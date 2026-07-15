import { Readable } from 'stream';
import { withTransaction } from '../db/pool.js';
import { google } from 'googleapis';
import { extractDriveFolderId } from '../domain/workspace.js';
import { resolvePlatformGoogleConfig } from './googleCredentialService.js';
import {
  findWorkspaceForUser,
  updateWorkspaceRecord,
} from '../repositories/workspaceRepository.js';

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const SERVICE_ACCOUNT_QUOTA_FIX = 'Service account oddiy My Drive papkaga fayl egasi sifatida yuklay olmaydi. Shared Drive ishlating yoki Google OAuth orqali real user nomidan yuklash arxitekturasiga o‘ting.';

function clean(value) {
  return String(value ?? '').trim();
}

function makeError(message, code = 'WORKSPACE_DRIVE_FOLDER_ERROR', statusCode = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

function driveAuth(serviceAccount) {
  return new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

function serviceAccountPublicInfo(serviceAccount = {}) {
  return {
    serviceAccountEmail: clean(serviceAccount.client_email),
    serviceAccountProjectId: clean(serviceAccount.project_id),
  };
}

function queryEscape(value = '') {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function classifyWorkspaceDriveError(error) {
  const status = Number(error?.code || error?.response?.status || 0);
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  const reason = clean(errors[0]?.reason || error?.response?.data?.error || '');
  const text = `${error?.message || ''} ${JSON.stringify(errors)} ${JSON.stringify(error?.response?.data || {})}`;

  if (/Service Accounts do not have storage quota|do not have storage quota|storage quota|about-sharedrives|OAuth delegation/i.test(text)) {
    return {
      code: 'SERVICE_ACCOUNT_NO_STORAGE_QUOTA',
      message: 'Service account oddiy My Drive papkaga fayl yarata olmaydi, chunki unda Drive storage quota yo‘q.',
      statusCode: 400,
      rawReason: reason,
      recommendedFix: SERVICE_ACCOUNT_QUOTA_FIX,
    };
  }
  if (/drive api has not been used|accessNotConfigured|SERVICE_DISABLED|disabled|not enabled/i.test(text)) {
    return {
      code: 'DRIVE_API_DISABLED',
      message: 'Google Drive API yoqilmagan. Google Cloud Console’da Drive API’ni enable qiling.',
      statusCode: 400,
      rawReason: reason,
    };
  }
  if (/invalid_grant|invalid_credentials|private key|service account|credentials|configuration|GOOGLE_SERVICE_ACCOUNT/i.test(text)) {
    return {
      code: error?.code || 'GOOGLE_SERVICE_ACCOUNT_INVALID',
      message: error?.message || 'Google service account sozlamasi noto‘g‘ri yoki private key eskirgan.',
      statusCode: 400,
      rawReason: reason,
      serviceAccountEmail: error?.clientEmail || error?.serviceAccountEmail || '',
      serviceAccountProjectId: error?.projectId || error?.serviceAccountProjectId || '',
    };
  }
  if (status === 404 || /File not found|notFound/i.test(text)) {
    return {
      code: 'DRIVE_FOLDER_NOT_FOUND',
      message: 'Drive papka topilmadi yoki service account bu papkaga share qilinmagan.',
      statusCode: 404,
      rawReason: reason,
    };
  }
  if (status === 403 || /insufficientFilePermissions|forbidden|permission|denied/i.test(text)) {
    return {
      code: 'DRIVE_WRITE_PERMISSION_DENIED',
      message: 'Service account bu papkaga yozish huquqiga ega emas. Papkani service account email bilan Editor qilib share qiling.',
      statusCode: 403,
      rawReason: reason,
    };
  }
  return {
    code: 'DRIVE_UPLOAD_FAILED',
    message: 'Google Drive amali vaqtincha ishlamadi.',
    statusCode: status >= 400 && status < 600 ? status : 400,
    rawReason: reason,
  };
}

export async function saveWorkspaceFinalDocumentsFolder(userId, workspaceId, rawValue) {
  return withTransaction(async (client) => {
    const current = await findWorkspaceForUser(workspaceId, userId, { forUpdate: true, client });
    if (!current || current.memberStatus !== 'active' || current.status === 'archived') {
      throw makeError('Workspace not found', 'WORKSPACE_NOT_FOUND', 404);
    }
    const finalDocumentsFolderId = extractDriveFolderId(rawValue || '');
    return updateWorkspaceRecord(workspaceId, { finalDocumentsFolderId }, client);
  });
}

export function resolveWorkspaceFinalDocumentsFolderId(workspace) {
  return clean(workspace?.finalDocumentsFolderId);
}

export async function createWorkspaceDriveClient(workspace) {
  const config = resolvePlatformGoogleConfig({ spreadsheetUrl: workspace?.spreadsheetUrl });
  const auth = driveAuth(config.serviceAccount);
  await auth.authorize();
  return {
    drive: google.drive({ version: 'v3', auth }),
    serviceAccount: config.serviceAccount,
    credentialSource: config.credentialSource,
    credentialConflict: config.credentialConflict,
    ...serviceAccountPublicInfo(config.serviceAccount),
  };
}

export async function ensureWorkspaceDocumentsSubfolder(workspace, { folderName = 'ХУЖАТЛАР', client = null } = {}) {
  const rootFolderId = resolveWorkspaceFinalDocumentsFolderId(workspace);
  if (!rootFolderId) {
    throw makeError('Yakuniy hujjatlar Drive papka ID kiritilmagan.', 'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED', 400);
  }

  const driveClient = client || await createWorkspaceDriveClient(workspace);
  const { drive } = driveClient;
  const escapedFolderName = queryEscape(folderName);
  const list = await drive.files.list({
    q: `'${rootFolderId}' in parents and trashed=false and mimeType='${DRIVE_FOLDER_MIME}' and name='${escapedFolderName}'`,
    fields: 'files(id,name,mimeType,driveId,webViewLink,parents)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
    pageSize: 10,
  });

  const existing = (list.data.files || []).find((file) => clean(file.id));
  if (existing) {
    return {
      ...driveClient,
      rootFolderId,
      folderId: clean(existing.id),
      folderName: clean(existing.name) || folderName,
      folderUrl: clean(existing.webViewLink),
      driveId: clean(existing.driveId),
      created: false,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: DRIVE_FOLDER_MIME,
      parents: [rootFolderId],
    },
    fields: 'id,name,mimeType,driveId,webViewLink,parents',
    supportsAllDrives: true,
  });

  return {
    ...driveClient,
    rootFolderId,
    folderId: clean(created.data.id),
    folderName: clean(created.data.name) || folderName,
    folderUrl: clean(created.data.webViewLink),
    driveId: clean(created.data.driveId),
    created: true,
  };
}

export async function testWorkspaceFinalDocumentsFolder(workspace, { writeTest = true } = {}) {
  const folderId = resolveWorkspaceFinalDocumentsFolderId(workspace);
  if (!folderId) {
    throw makeError('Якуний ҳужжатлар Drive папка ID киритилмаган.', 'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED', 400);
  }

  let driveClient = null;
  try {
    driveClient = await createWorkspaceDriveClient(workspace);
    const { drive, serviceAccountEmail, serviceAccountProjectId, credentialSource, credentialConflict } = driveClient;
    const folder = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType,driveId,ownedByMe,spaces,webViewLink,owners(emailAddress),capabilities(canAddChildren,canEdit)',
      supportsAllDrives: true,
    });
    const data = folder.data || {};
    const folderDiagnostic = {
      folderId: data.id || folderId,
      folderName: data.name || '',
      mimeType: data.mimeType || '',
      folderMimeType: data.mimeType || '',
      folderUrl: data.webViewLink || '',
      driveId: data.driveId || '',
      ownedByMe: Boolean(data.ownedByMe),
      spaces: data.spaces || [],
      canAddChildren: Boolean(data.capabilities?.canAddChildren),
      canEdit: Boolean(data.capabilities?.canEdit),
      uploadStrategy: data.driveId ? 'service_account_shared_drive' : 'service_account_my_drive',
    };

    if (data.mimeType !== DRIVE_FOLDER_MIME) {
      throw makeError('Киритилган ID Google Drive папка эмас.', 'DRIVE_FOLDER_NOT_A_FOLDER', 400, {
        serviceAccountEmail,
        serviceAccountProjectId,
        credentialSource,
        credentialConflict,
        folderDiagnostic,
      });
    }

    let writeTestFileId = '';
    if (writeTest) {
      try {
        const testFile = await drive.files.create({
          requestBody: {
            name: `SEG-KIP-final-pdf-test-${Date.now()}.txt`,
            mimeType: 'text/plain',
            parents: [folderId],
          },
          media: { mimeType: 'text/plain', body: Readable.from('SEG KIP final documents folder write test') },
          fields: 'id,name,driveId',
          supportsAllDrives: true,
        });
        writeTestFileId = clean(testFile.data?.id);
        if (writeTestFileId) {
          await drive.files.delete({ fileId: writeTestFileId, supportsAllDrives: true }).catch(() => {});
        }
      } catch (error) {
        const classified = classifyWorkspaceDriveError(error);
        throw makeError(classified.message, classified.code, classified.statusCode, {
          serviceAccountEmail,
          serviceAccountProjectId,
          credentialSource,
          credentialConflict,
          driveErrorCode: classified.code,
          driveErrorMessage: classified.message,
          recommendedFix: classified.recommendedFix || '',
          folderDiagnostic,
        });
      }
    }

    return {
      ok: true,
      ...folderDiagnostic,
      serviceAccountEmail,
      serviceAccountProjectId,
      credentialSource,
      credentialConflict,
      driveApiEnabled: true,
      folderAccessible: true,
      writeTest: Boolean(writeTest),
      writeTestPassed: Boolean(!writeTest || writeTestFileId),
    };
  } catch (error) {
    if (error.statusCode && error.code) throw error;
    const classified = classifyWorkspaceDriveError(error);
    throw makeError(classified.message, classified.code, classified.statusCode, {
      driveErrorCode: classified.code,
      driveErrorMessage: classified.message,
      rawReason: classified.rawReason,
      serviceAccountEmail: classified.serviceAccountEmail || driveClient?.serviceAccountEmail || '',
      serviceAccountProjectId: classified.serviceAccountProjectId || driveClient?.serviceAccountProjectId || '',
      recommendedFix: classified.recommendedFix || '',
    });
  }
}
