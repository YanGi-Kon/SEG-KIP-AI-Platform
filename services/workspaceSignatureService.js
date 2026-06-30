import crypto from 'crypto';
import { Readable } from 'stream';
import { google } from 'googleapis';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';

function clean(value) {
  return String(value ?? '').trim();
}

function makeError(message, code = 'WORKSPACE_SIGNATURE_UPLOAD_ERROR', statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
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

export async function uploadWorkspaceSignaturePng(workspace, file) {
  validatePngFile(file);
  const config = resolveWorkspaceGoogleConfig(workspace);
  const auth = driveAuth(config.serviceAccount);
  await auth.authorize();

  const drive = google.drive({ version: 'v3', auth });
  const folderId = clean(workspace?.driveFolderId) || clean(process.env.SIGNATURE_DRIVE_FOLDER_ID);
  const name = `SEG-KIP-workspace-${clean(workspace?.id).slice(0, 8) || 'signature'}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
  const requestBody = { name, mimeType: 'image/png' };
  if (folderId) requestBody.parents = [folderId];

  try {
    const result = await drive.files.create({
      requestBody,
      media: { mimeType: 'image/png', body: Readable.from(file.buffer) },
      fields: 'id,name,mimeType,webViewLink,parents',
    });
    const fileId = result.data.id;
    return {
      fileId,
      name: result.data.name || name,
      webViewLink: result.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
      folderId: folderId || '',
    };
  } catch (error) {
    if (folderId && /File not found|notFound|404/i.test(error.message || '')) {
      throw makeError('Workspace Drive folder ID topilmadi yoki service account bu papkaga kira olmaydi', 'WORKSPACE_DRIVE_FOLDER_NOT_ACCESSIBLE');
    }
    throw makeError(error.message || 'Workspace signature upload failed');
  }
}
