import { withTransaction } from '../db/pool.js';
import { extractDriveFolderId } from '../domain/workspace.js';
import {
  createSharedDriveProvider,
  classifySharedDriveError,
} from './driveProviders/sharedDriveServiceAccountProvider.js';
import { AppsScriptPersonalDriveProvider } from './driveProviders/appsScriptPersonalDriveProvider.js';
import {
  decryptWorkspaceSecret,
  encryptWorkspaceSecret,
  validateAppsScriptDeploymentUrl,
} from './workspaceSecretService.js';
import {
  findWorkspaceForUser,
  getWorkspacePersonalDriveConfig,
  saveWorkspacePersonalDriveConfig,
  updateWorkspaceRecord,
} from '../repositories/workspaceRepository.js';

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

export function classifyWorkspaceDriveError(error) {
  const explicitCode = clean(error?.code);
  if (/^FINAL_PDF_/.test(explicitCode)) {
    return {
      code: explicitCode,
      message: clean(error?.message) || 'Final PDF yaratilmadi.',
      statusCode: Number(error?.statusCode) || 500,
      rawReason: '',
      recommendedFix: explicitCode === 'FINAL_PDF_CHROMIUM_NOT_FOUND'
        ? 'Railway image ichida Chromium o\u2018rnatilganini va PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium ekanini tekshiring.'
        : '',
    };
  }
  if (/^(WORKSPACE_SECRET_|WORKSPACE_ENCRYPTION_KEY_)/.test(explicitCode)) {
    const needsReconfiguration = explicitCode === 'WORKSPACE_SECRET_DECRYPT_FAILED'
      || explicitCode === 'WORKSPACE_SECRET_INVALID';
    return {
      code: explicitCode,
      message: clean(error?.message) || 'Workspace Personal Drive secret xatosi.',
      statusCode: Number(error?.statusCode) || 500,
      rawReason: '',
      recommendedFix: needsReconfiguration
        ? '6. YAKUNIY HUJJATLAR bo‘limida Personal Drive Apps Script URL va webhook secretni qayta ulang.'
        : 'Serverda WORKSPACE_ENCRYPTION_KEY qiymatini kamida 32 belgili barqaror kalit sifatida sozlang.',
    };
  }
  const classified = classifySharedDriveError(error);
  return {
    code: classified.code,
    message: classified.message,
    statusCode: classified.statusCode,
    rawReason: classified.rawReason || '',
    recommendedFix: classified.recommendedFix || '',
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

export async function createWorkspaceDriveProvider(workspace) {
  if (!workspace?.id) throw makeError('Workspace context required', 'WORKSPACE_CONTEXT_REQUIRED', 400);
  const personalDrive = await getWorkspacePersonalDriveConfig(workspace.id);
  if (personalDrive?.configured) {
    return new AppsScriptPersonalDriveProvider({
      url: personalDrive.appsScriptUrl,
      secret: decryptWorkspaceSecret(personalDrive.secretEncrypted),
      timeoutMs: process.env.PERSONAL_DRIVE_APPS_SCRIPT_TIMEOUT_MS || 30000,
    });
  }
  return createSharedDriveProvider();
}

export async function configureWorkspacePersonalDrive(userId, workspaceId, input = {}) {
  return withTransaction(async (client) => {
    const workspace = await findWorkspaceForUser(workspaceId, userId, { forUpdate: true, client });
    if (!workspace || workspace.memberStatus !== 'active' || workspace.status === 'archived') {
      throw makeError('Workspace not found', 'WORKSPACE_NOT_FOUND', 404);
    }
    const appsScriptUrl = validateAppsScriptDeploymentUrl(input.appsScriptUrl || input.url || '');
    const secret = clean(input.secret);
    if (!appsScriptUrl && !secret) return saveWorkspacePersonalDriveConfig(workspaceId, {}, client);
    if (!appsScriptUrl || secret.length < 32) {
      throw makeError('Apps Script URL va kamida 32 belgili secret talab qilinadi.', 'DRIVE_APPS_SCRIPT_CONFIG_REQUIRED');
    }
    return saveWorkspacePersonalDriveConfig(workspaceId, {
      appsScriptUrl,
      secretEncrypted: encryptWorkspaceSecret(secret),
    }, client);
  });
}

export async function getWorkspacePersonalDriveStatus(workspaceId) {
  const config = await getWorkspacePersonalDriveConfig(workspaceId);
  const status = {
    configured: Boolean(config?.configured),
    appsScriptUrl: config?.appsScriptUrl || '',
    secretConfigured: Boolean(config?.secretEncrypted),
    ready: false,
    needsReconfiguration: false,
  };
  if (!status.configured) return status;
  try {
    decryptWorkspaceSecret(config.secretEncrypted);
    return { ...status, ready: true };
  } catch (error) {
    const classified = classifyWorkspaceDriveError(error);
    return {
      ...status,
      code: classified.code,
      message: classified.message,
      recommendedFix: classified.recommendedFix,
      needsReconfiguration: true,
    };
  }
}

// Compatibility wrapper for existing callers while the export service migrates to the provider API.
export async function createWorkspaceDriveClient(workspace) {
  const provider = await createWorkspaceDriveProvider(workspace);
  return {
    provider,
    drive: provider.drive,
    serviceAccountEmail: provider.serviceAccountEmail,
    serviceAccountProjectId: provider.serviceAccountProjectId,
    credentialSource: provider.credentialSource,
  };
}

export async function ensureWorkspaceDocumentsSubfolder(
  workspace,
  { folderName = 'ХУЖАТЛАР', provider = null, client = null } = {},
) {
  const rootFolderId = resolveWorkspaceFinalDocumentsFolderId(workspace);
  if (!rootFolderId) {
    throw makeError('Yakuniy hujjatlar Drive papka ID kiritilmagan.', 'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED');
  }
  const selectedProvider = provider || client?.provider || await createWorkspaceDriveProvider(workspace);
  const folder = await selectedProvider.ensureSubfolder(rootFolderId, folderName);
  return {
    provider: selectedProvider,
    rootFolderId,
    ...folder,
    serviceAccountEmail: selectedProvider.serviceAccountEmail,
    serviceAccountProjectId: selectedProvider.serviceAccountProjectId,
  };
}

export async function testWorkspaceFinalDocumentsFolder(workspace, { writeTest = true } = {}) {
  const folderId = resolveWorkspaceFinalDocumentsFolderId(workspace);
  if (!folderId) {
    throw makeError('Yakuniy hujjatlar Drive papka ID kiritilmagan.', 'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED');
  }

  let provider;
  try {
    provider = await createWorkspaceDriveProvider(workspace);
    return await provider.validateFolder(folderId, { writeTest });
  } catch (error) {
    const classified = classifyWorkspaceDriveError(error);
    throw makeError(classified.message, classified.code, classified.statusCode, {
      driveErrorCode: classified.code,
      driveErrorMessage: classified.message,
      rawReason: classified.rawReason,
      recommendedFix: classified.recommendedFix,
      serviceAccountEmail: provider?.serviceAccountEmail || '',
      serviceAccountProjectId: provider?.serviceAccountProjectId || '',
    });
  }
}
