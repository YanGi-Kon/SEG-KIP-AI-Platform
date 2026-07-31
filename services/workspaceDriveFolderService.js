import { withTransaction } from '../db/pool.js';
import { extractDriveFolderId } from '../domain/workspace.js';
import {
  createSharedDriveProvider,
  classifySharedDriveError,
} from './driveProviders/sharedDriveServiceAccountProvider.js';
import {
  findWorkspaceForUser,
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
  return createSharedDriveProvider();
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
