import crypto from 'crypto';
import { withTransaction } from '../db/pool.js';
import { normalizeWorkspaceInput } from '../domain/workspace.js';
import {
  addWorkspaceMember,
  archiveWorkspaceRecord,
  createWorkspaceRecord,
  findWorkspaceForUser,
  listUserWorkspaces,
  listWorkspaceMembers,
  updateWorkspaceRecord,
} from '../repositories/workspaceRepository.js';

function serviceError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function uniqueSlug(baseSlug, attempt) {
  if (attempt === 0) return baseSlug;
  return `${baseSlug.slice(0, 70).replace(/-+$/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
}

export async function createWorkspace(userId, input) {
  const normalized = normalizeWorkspaceInput(input);
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await withTransaction(async (client) => {
        const workspace = await createWorkspaceRecord({
          ...normalized,
          slug: uniqueSlug(normalized.slug, attempt),
          ownerId: userId,
          status: 'draft',
          isDefault: false,
        }, client);
        await addWorkspaceMember({
          workspaceId: workspace.id,
          userId,
          role: 'owner',
          status: 'active',
        }, client);
        return { ...workspace, memberRole: 'owner', memberStatus: 'active' };
      });
    } catch (error) {
      lastError = error;
      if (error.code !== '23505') throw error;
    }
  }

  throw serviceError(
    lastError?.constraint === 'workspaces_slug_key'
      ? 'Workspace slug could not be generated uniquely'
      : 'Workspace conflicts with an existing record',
    'WORKSPACE_CONFLICT',
    409,
  );
}

export async function getUserWorkspaces(userId) {
  return listUserWorkspaces(userId);
}

export async function getWorkspace(userId, workspaceId) {
  const workspace = await findWorkspaceForUser(workspaceId, userId);
  if (!workspace || workspace.memberStatus !== 'active' || workspace.status === 'archived') {
    throw serviceError('Workspace not found', 'WORKSPACE_NOT_FOUND', 404);
  }
  return workspace;
}

export async function updateWorkspace(userId, workspaceId, input) {
  return withTransaction(async (client) => {
    const current = await findWorkspaceForUser(workspaceId, userId, { forUpdate: true, client });
    if (!current || current.memberStatus !== 'active' || current.status === 'archived') {
      throw serviceError('Workspace not found', 'WORKSPACE_NOT_FOUND', 404);
    }

    const normalized = normalizeWorkspaceInput({
      name: input.name ?? current.name,
      slug: input.slug ?? current.slug,
      spreadsheetUrl: input.spreadsheetUrl ?? current.spreadsheetUrl,
      mainSheetName: input.mainSheetName ?? current.mainSheetName,
      driveFolderId: input.driveFolderId ?? current.driveFolderId,
      timeZone: input.timeZone ?? current.timeZone,
    });

    const nextStatus = input.status === undefined ? current.status : String(input.status).trim();
    if (!['draft', 'active', 'disabled'].includes(nextStatus)) {
      throw serviceError('Invalid Workspace status', 'INVALID_WORKSPACE_STATUS', 400);
    }

    try {
      return await updateWorkspaceRecord(workspaceId, {
        ...normalized,
        slug: input.slug === undefined ? current.slug : normalized.slug,
        status: nextStatus,
      }, client);
    } catch (error) {
      if (error.code === '23505') {
        throw serviceError('Workspace slug is already in use', 'WORKSPACE_CONFLICT', 409);
      }
      throw error;
    }
  });
}

export async function archiveWorkspace(userId, workspaceId) {
  return withTransaction(async (client) => {
    const current = await findWorkspaceForUser(workspaceId, userId, { forUpdate: true, client });
    if (!current || current.memberStatus !== 'active' || current.status === 'archived') {
      throw serviceError('Workspace not found', 'WORKSPACE_NOT_FOUND', 404);
    }
    const archived = await archiveWorkspaceRecord(workspaceId, client);
    if (!archived) throw serviceError('Workspace not found', 'WORKSPACE_NOT_FOUND', 404);
    return archived;
  });
}

export async function getWorkspaceMembers(workspaceId) {
  return listWorkspaceMembers(workspaceId);
}
