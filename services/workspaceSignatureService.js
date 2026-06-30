import crypto from 'crypto';
import { Readable } from 'stream';
import { google } from 'googleapis';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';
import {
  getWorkspaceSignatureImage,
  saveWorkspaceSignatureImage,
} from '../repositories/workspaceSignatureRepository.js';

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

function driveErrorReason(error) {
  const text = `${error?.message || ''} ${JSON.stringify(error?.errors || [])}`;
  if (/File not found|notFound|404/i.test(text)) return 'Drive папка топилмади ёки service account бу папкага кира олмайди';
  if (/drive api has not been used|accessNotConfigured|SERVICE_DISABLED|disabled|not enabled|403/i.test(text)) return 'Google Drive API ёқилмаган ёки service account рухсати йўқ';
  if (/service account|private key|credentials|configuration/i.test(text)) return 'Google service account созламаси тўлиқ эмас';
  return 'Google Drive вақтинча ишламади';
}

async function saveSignatureToDatabase(workspace, file, actorUserId = null, fallbackReason = '') {
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
      fallbackReason: fallbackReason || 'Google Drive API disabled or unavailable',
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

export async function uploadWorkspaceSignaturePng(workspace, file, { actorUserId = null } = {}) {
  validatePngFile(file);
  const folderId = clean(workspace?.driveFolderId) || clean(process.env.SIGNATURE_DRIVE_FOLDER_ID);
  const name = `SEG-KIP-workspace-${clean(workspace?.id).slice(0, 8) || 'signature'}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;

  try {
    const config = resolveWorkspaceGoogleConfig(workspace);
    const auth = driveAuth(config.serviceAccount);
    await auth.authorize();
    const drive = google.drive({ version: 'v3', auth });
    const requestBody = { name, mimeType: 'image/png' };
    if (folderId) requestBody.parents = [folderId];
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
      storage: 'drive',
    };
  } catch (error) {
    return saveSignatureToDatabase(workspace, file, actorUserId, driveErrorReason(error));
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
