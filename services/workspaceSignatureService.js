import crypto from 'crypto';
import { Readable } from 'stream';
import { google } from 'googleapis';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';
import {
  getWorkspaceSignatureImage,
  saveWorkspaceSignatureImage,
} from '../repositories/workspaceSignatureRepository.js';

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

function clean(value) {
  return String(value ?? '').trim();
}

function makeError(message, code = 'WORKSPACE_SIGNATURE_UPLOAD_ERROR', statusCode = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

function validatePngFile(file) {
  if (!file?.buffer) {
    throw makeError('PNG файл танланмаган', 'SIGNATURE_FILE_REQUIRED');
  }
  const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const isPng = file.mimetype === 'image/png'
    && file.buffer.length >= pngMagic.length
    && file.buffer.subarray(0, pngMagic.length).equals(pngMagic);
  if (!isPng) {
    throw makeError('Фақат ҳақиқий PNG файл қабул қилинади', 'INVALID_SIGNATURE_PNG');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw makeError('PNG ҳажми 2 MB дан ошмаслиги керак', 'SIGNATURE_PNG_TOO_LARGE');
  }
}

function driveAuth(serviceAccount) {
  return new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

function classifyDriveError(error) {
  const status = Number(error?.code || error?.response?.status || 0);
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  const reason = clean(errors[0]?.reason || error?.response?.data?.error || '');
  const text = `${error?.message || ''} ${JSON.stringify(errors)} ${JSON.stringify(error?.response?.data || {})}`;

  if (/drive api has not been used|accessNotConfigured|SERVICE_DISABLED|disabled|not enabled/i.test(text)) {
    return {
      code: 'DRIVE_API_DISABLED',
      message: 'Google Drive API ёқилмаган. Google Cloud Console’da Drive API’ni enable qiling.',
      statusCode: 400,
      rawReason: reason,
    };
  }
  if (/invalid_grant|invalid_credentials|private key|service account|credentials|configuration/i.test(text)) {
    return {
      code: 'GOOGLE_SERVICE_ACCOUNT_INVALID',
      message: 'Google service account созламаси нотўғри ёки private key эскирган.',
      statusCode: 400,
      rawReason: reason,
    };
  }
  if (status === 404 || /File not found|notFound/i.test(text)) {
    return {
      code: 'DRIVE_FOLDER_NOT_FOUND',
      message: 'Drive папка топилмади ёки service account бу папкага share қилинмаган.',
      statusCode: 404,
      rawReason: reason,
    };
  }
  if (status === 403 || /insufficientFilePermissions|forbidden|permission|denied/i.test(text)) {
    return {
      code: 'DRIVE_WRITE_PERMISSION_DENIED',
      message: 'Service account бу папкага ёзиш ҳуқуқига эга эмас. Папкани service account email билан Editor қилиб share қилинг.',
      statusCode: 403,
      rawReason: reason,
    };
  }
  return {
    code: 'DRIVE_UPLOAD_FAILED',
    message: 'Google Drive upload вақтинча ишламади.',
    statusCode: status >= 400 && status < 600 ? status : 400,
    rawReason: reason,
  };
}

function serviceAccountPublicInfo(serviceAccount = {}) {
  return {
    serviceAccountEmail: clean(serviceAccount.client_email),
    serviceAccountProjectId: clean(serviceAccount.project_id),
  };
}

function resolveFolderId(workspace) {
  return clean(workspace?.driveFolderId) || clean(process.env.SIGNATURE_DRIVE_FOLDER_ID);
}

async function createDriveClient(workspace) {
  const config = resolveWorkspaceGoogleConfig(workspace);
  const auth = driveAuth(config.serviceAccount);
  await auth.authorize();
  return {
    drive: google.drive({ version: 'v3', auth }),
    serviceAccount: config.serviceAccount,
    ...serviceAccountPublicInfo(config.serviceAccount),
  };
}

function safeFilePart(value) {
  return clean(value)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64) || 'signature';
}

function makeDriveSignatureName(workspace, input = {}) {
  const object = safeFilePart(workspace?.slug || workspace?.name || 'Fargona-4-Cex');
  const position = safeFilePart(input.position || 'Lavozim');
  const fullName = safeFilePart(input.fullName || input.fio || 'FIO');
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `${object}_${position}_${fullName}_${stamp}.png`;
}

async function saveSignatureToDatabase(workspace, file, actorUserId = null, fallback = {}) {
  try {
    const imageSha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const saved = await saveWorkspaceSignatureImage(workspace.id, {
      fileName: clean(file.originalname) || 'signature.png',
      mimeType: 'image/png',
      imageBase64: file.buffer.toString('base64'),
      imageSha256,
      sizeBytes: file.size,
      createdBy: actorUserId,
    });
    const fileId = `db:${saved.id}`;
    return {
      fileId,
      name: saved.fileName,
      webViewLink: `/api/workspaces/${encodeURIComponent(workspace.id)}/signers/signature/${encodeURIComponent(saved.id)}`,
      storage: 'database',
      fallbackReason: fallback.message || fallback.fallbackReason || 'Google Drive API disabled or unavailable',
      driveErrorCode: fallback.code || 'DRIVE_FALLBACK_USED',
      driveErrorMessage: fallback.message || '',
    };
  } catch (error) {
    if (error?.code === '42P01' || /workspace_signature_store/i.test(error?.message || '')) {
      throw makeError(
        'PostgreSQL imzo zaxira jadvali hali tayyor emas. Railway deploy/migration tugaganidan keyin qayta urinib ko‘ring.',
        'WORKSPACE_SIGNATURE_STORE_NOT_READY',
      );
    }
    throw makeError(
      `Imzoni saqlash xato: ${error?.message || 'PostgreSQL fallback ishlamadi'}`,
      'WORKSPACE_SIGNATURE_DATABASE_FALLBACK_FAILED',
    );
  }
}

export async function testWorkspaceSignatureFolder(workspace, { writeTest = true } = {}) {
  const folderId = resolveFolderId(workspace);
  if (!folderId) {
    throw makeError('Имзолар Drive папка ID киритилмаган.', 'DRIVE_FOLDER_ID_REQUIRED', 400);
  }

  try {
    const { drive, serviceAccountEmail, serviceAccountProjectId } = await createDriveClient(workspace);
    const folder = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType,webViewLink,owners(emailAddress),capabilities(canAddChildren,canEdit)',
      supportsAllDrives: true,
    });
    const data = folder.data || {};
    if (data.mimeType !== DRIVE_FOLDER_MIME) {
      throw makeError('Киритилган ID Google Drive папка эмас.', 'DRIVE_FOLDER_NOT_A_FOLDER', 400, {
        serviceAccountEmail,
        serviceAccountProjectId,
      });
    }

    let writeTestFileId = '';
    if (writeTest) {
      try {
        const testFile = await drive.files.create({
          requestBody: {
            name: `SEG-KIP-drive-test-${Date.now()}.txt`,
            mimeType: 'text/plain',
            parents: [folderId],
          },
          media: { mimeType: 'text/plain', body: Readable.from('SEG KIP Drive write test') },
          fields: 'id,name',
          supportsAllDrives: true,
        });
        writeTestFileId = testFile.data?.id || '';
        if (writeTestFileId) {
          await drive.files.delete({ fileId: writeTestFileId, supportsAllDrives: true }).catch(() => {});
        }
      } catch (error) {
        const classified = classifyDriveError(error);
        throw makeError(classified.message, 'DRIVE_WRITE_PERMISSION_DENIED', classified.statusCode, {
          serviceAccountEmail,
          serviceAccountProjectId,
          driveErrorCode: classified.code,
          driveErrorMessage: classified.message,
        });
      }
    }

    return {
      ok: true,
      folderId: data.id || folderId,
      folderName: data.name || '',
      folderMimeType: data.mimeType || '',
      folderUrl: data.webViewLink || '',
      serviceAccountEmail,
      serviceAccountProjectId,
      driveApiEnabled: true,
      folderAccessible: true,
      writeTest: Boolean(writeTest),
      writeTestPassed: Boolean(!writeTest || writeTestFileId),
    };
  } catch (error) {
    if (error.statusCode && error.code) throw error;
    const classified = classifyDriveError(error);
    throw makeError(classified.message, classified.code, classified.statusCode, {
      driveErrorCode: classified.code,
      driveErrorMessage: classified.message,
      rawReason: classified.rawReason,
    });
  }
}

export async function uploadWorkspaceSignaturePng(workspace, file, { actorUserId = null, position = '', fullName = '' } = {}) {
  validatePngFile(file);
  const folderId = resolveFolderId(workspace);
  if (!folderId) {
    return saveSignatureToDatabase(workspace, file, actorUserId, {
      code: 'DRIVE_FOLDER_ID_REQUIRED',
      message: 'Drive папка ID киритилмаган.',
    });
  }
  const name = makeDriveSignatureName(workspace, { position, fullName });

  try {
    const { drive, serviceAccountEmail, serviceAccountProjectId } = await createDriveClient(workspace);
    const result = await drive.files.create({
      requestBody: { name, mimeType: 'image/png', parents: [folderId] },
      media: { mimeType: 'image/png', body: Readable.from(file.buffer) },
      fields: 'id,name,mimeType,webViewLink,parents',
      supportsAllDrives: true,
    });
    const fileId = result.data.id;
    return {
      fileId,
      name: result.data.name || name,
      webViewLink: result.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
      folderId,
      storage: 'drive',
      serviceAccountEmail,
      serviceAccountProjectId,
    };
  } catch (error) {
    const classified = classifyDriveError(error);
    return saveSignatureToDatabase(workspace, file, actorUserId, classified);
  }
}

export async function getWorkspaceSignaturePng(workspaceId, signatureId) {
  const row = await getWorkspaceSignatureImage(workspaceId, signatureId);
  if (!row) throw makeError('Workspace signature image topilmadi', 'WORKSPACE_SIGNATURE_NOT_FOUND', 404);
  return {
    fileName: row.fileName,
    mimeType: row.mimeType,
    buffer: Buffer.from(row.imageBase64, 'base64'),
  };
}
