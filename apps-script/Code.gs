var SEG_KIP_SECRET_PROPERTY = 'SEG_KIP_WEBHOOK_SECRET';
var SEG_KIP_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function clean_(value) {
  return String(value == null ? '' : value).trim();
}
function canonicalJson_(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson_).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + canonicalJson_(value[key]);
  }).join(',') + '}';
}

function hex_(bytes) {
  return bytes.map(function (b) {
    var value = b < 0 ? b + 256 : b;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function response_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail_(message, code, statusCode) {
  return response_({ ok: false, error: message, code: code, statusCode: statusCode || 400 });
}

function authenticate_(body) {
  var secret = clean_(PropertiesService.getScriptProperties().getProperty(SEG_KIP_SECRET_PROPERTY));
  if (!secret) throw new Error('DRIVE_APPS_SCRIPT_SECRET_MISSING');
  var timestamp = Number(body.timestamp || 0);
  if (!timestamp || Math.abs(Date.now() - timestamp) > SEG_KIP_MAX_CLOCK_SKEW_MS) {
    throw new Error('DRIVE_APPS_SCRIPT_REQUEST_EXPIRED');
  }
  var nonce = clean_(body.nonce);
  if (!nonce) throw new Error('DRIVE_APPS_SCRIPT_NONCE_REQUIRED');
  var cache = CacheService.getScriptCache();
  var cacheKey = 'nonce:' + nonce;
  if (cache.get(cacheKey)) throw new Error('DRIVE_APPS_SCRIPT_REPLAY_REJECTED');
  var canonical = canonicalJson_({
    action: clean_(body.action),
    nonce: nonce,
    payload: body.payload || {},
    timestamp: timestamp
  });
  var expected = hex_(Utilities.computeHmacSha256Signature(
    canonical,
    secret,
    Utilities.Charset.UTF_8
  ));
  if (expected !== clean_(body.signature).toLowerCase()) throw new Error('DRIVE_APPS_SCRIPT_AUTH_FAILED');
  cache.put(cacheKey, '1', 600);
}

function folder_(id) {
  var folderId = clean_(id);
  if (!folderId) throw new Error('DRIVE_FOLDER_ID_REQUIRED');
  try { return DriveApp.getFolderById(folderId); } catch (error) { throw new Error('DRIVE_FOLDER_NOT_FOUND'); }
}

function validateFolder_(payload) {
  var folder = folder_(payload.folderId);
  var writeTestPassed = false;
  if (payload.writeTest) {
    var testFile = folder.createFile('SEG-KIP-drive-test-' + Date.now() + '.txt', 'SEG KIP Personal Drive write test');
    testFile.setTrashed(true);
    writeTestPassed = true;
  }
  return {
    ok: true,
    folderId: folder.getId(),
    folderName: folder.getName(),
    folderUrl: folder.getUrl(),
    writeTestPassed: writeTestPassed
  };
}

function ensureSubfolder_(payload) {
  var root = folder_(payload.rootFolderId);
  var name = clean_(payload.name) || 'HUJJATLAR';
  var matches = root.getFoldersByName(name);
  if (matches.hasNext()) {
    var existing = matches.next();
    return { ok: true, folderId: existing.getId(), folderName: existing.getName(), created: false };
  }
  var created = root.createFolder(name);
  return { ok: true, folderId: created.getId(), folderName: created.getName(), created: true };
}

function uploadPdfBase64_(payload) {
  var target = folder_(payload.targetFolderId);
  var name = clean_(payload.name) || 'Tasdiqlangan.pdf';
  var mimeType = clean_(payload.mimeType);
  var encoded = clean_(payload.pdfBase64);
  if (mimeType && mimeType !== 'application/pdf') throw new Error('DRIVE_PDF_MIME_TYPE_INVALID');
  if (!encoded) throw new Error('DRIVE_PDF_BASE64_REQUIRED');

  var bytes;
  try {
    bytes = Utilities.base64Decode(encoded);
  } catch (error) {
    throw new Error('DRIVE_PDF_BASE64_INVALID');
  }
  if (!bytes || !bytes.length) throw new Error('DRIVE_PDF_BYTES_EMPTY');
  if (bytes.length < 5 || bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70 || bytes[4] !== 45) {
    throw new Error('DRIVE_PDF_SIGNATURE_INVALID');
  }

  var blob = Utilities.newBlob(bytes, 'application/pdf', name);
  var file = target.createFile(blob);
  var fileId = clean_(file.getId());
  if (!fileId) throw new Error('DRIVE_PDF_UPLOAD_FAILED');
  return {
    ok: true,
    fileId: fileId,
    url: 'https://drive.google.com/file/d/' + fileId + '/view',
    size: bytes.length,
    parentFolderId: target.getId(),
    createdAt: new Date().toISOString()
  };
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    authenticate_(body);
    var action = clean_(body.action);
    if (action === 'validate_folder') return response_(validateFolder_(body.payload || {}));
    if (action === 'ensure_subfolder') return response_(ensureSubfolder_(body.payload || {}));
    if (action === 'upload_pdf_base64') return response_(uploadPdfBase64_(body.payload || {}));
    return fail_('Noma’lum amal.', 'DRIVE_APPS_SCRIPT_ACTION_INVALID', 400);
  } catch (error) {
    var code = clean_(error && error.message) || 'DRIVE_APPS_SCRIPT_FAILED';
    var authError = /AUTH|SECRET|NONCE|REPLAY|EXPIRED/.test(code);
    return fail_(authError ? 'So‘rov autentifikatsiyadan o‘tmadi.' : 'Personal Drive amali bajarilmadi.', code, authError ? 403 : 400);
  }
}
