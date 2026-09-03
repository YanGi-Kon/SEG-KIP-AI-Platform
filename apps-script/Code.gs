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

function renderAndUploadPdf_(payload) {
  var root = folder_(payload.rootFolderId);
  var target = folder_(payload.targetFolderId);
  var html = String(payload.html || '');
  var name = clean_(payload.name) || 'Tasdiqlangan.pdf';
  if (!html) throw new Error('DRIVE_PDF_HTML_REQUIRED');
  var tempId = '';
  try {
    var htmlBlob = Utilities.newBlob(html, 'text/html', 'SEG-KIP-temp.html');
    var metadata = {
      name: 'TMP_SEG_KIP_' + Date.now(),
      mimeType: 'application/vnd.google-apps.document',
      parents: [root.getId()]
    };
    var temp = Drive.Files.create(metadata, htmlBlob, { supportsAllDrives: true });
    tempId = clean_(temp.id);
    if (!tempId) throw new Error('DRIVE_TEMP_DOCUMENT_FAILED');
    var pdfBlob = null;
    var conversionError = null;
    for (var attempt = 0; attempt < 4; attempt += 1) {
      try {
        if (attempt > 0) Utilities.sleep(500 * attempt);
        pdfBlob = DriveApp.getFileById(tempId).getAs(MimeType.PDF).setName(name);
        if (pdfBlob && pdfBlob.getBytes().length > 0) break;
      } catch (error) {
        conversionError = error;
      }
    }
    if (!pdfBlob || !pdfBlob.getBytes().length) {
      throw new Error('DRIVE_PDF_CONVERSION_FAILED' + (conversionError ? ': ' + conversionError.message : ''));
    }
    var pdf = target.createFile(pdfBlob);
    if (!clean_(pdf.getId())) throw new Error('DRIVE_PDF_UPLOAD_FAILED');
    return {
      ok: true,
      fileId: pdf.getId(),
      url: 'https://drive.google.com/file/d/' + pdf.getId() + '/view'
    };
  } finally {
    if (tempId) {
      try { DriveApp.getFileById(tempId).setTrashed(true); } catch (ignored) {}
    }
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    authenticate_(body);
    var action = clean_(body.action);
    if (action === 'validate_folder') return response_(validateFolder_(body.payload || {}));
    if (action === 'ensure_subfolder') return response_(ensureSubfolder_(body.payload || {}));
    if (action === 'render_and_upload_pdf') return response_(renderAndUploadPdf_(body.payload || {}));
    return fail_('Noma’lum amal.', 'DRIVE_APPS_SCRIPT_ACTION_INVALID', 400);
  } catch (error) {
    var code = clean_(error && error.message) || 'DRIVE_APPS_SCRIPT_FAILED';
    var authError = /AUTH|SECRET|NONCE|REPLAY|EXPIRED/.test(code);
    return fail_(authError ? 'So‘rov autentifikatsiyadan o‘tmadi.' : 'Personal Drive amali bajarilmadi.', code, authError ? 403 : 400);
  }
}
