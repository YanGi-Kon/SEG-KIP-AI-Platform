import crypto from 'crypto';
import { withTransaction } from '../db/pool.js';
import { normalizeWorkspaceInput } from '../domain/workspace.js';
import {
  assertCanAssignWorkspaceRole,
  assertCanManageWorkspaceMember,
  normalizeWorkspaceMemberRole,
  normalizeWorkspaceMemberStatus,
} from '../domain/workspaceMember.js';
import { findUserByEmail } from '../repositories/userRepository.js';
import {
  addWorkspaceMember,
  archiveWorkspaceRecord,
  createWorkspaceRecord,
  deleteWorkspaceMemberRecord,
  findWorkspaceMemberById,
  findWorkspaceMemberByUserId,
  findWorkspaceForUser,
  listUserWorkspaces,
  listWorkspaceMembers,
  updateWorkspaceMemberRecord,
  updateWorkspaceRecord,
} from '../repositories/workspaceRepository.js';

const DEFAULT_WORKSPACE = Object.freeze({
  name: process.env.DEFAULT_WORKSPACE_NAME || 'Fargona №-4-Цех',
  slug: process.env.DEFAULT_WORKSPACE_SLUG || 'fargona-4-cex',
  spreadsheetUrl: process.env.DEFAULT_WORKSPACE_SHEET_URL || 'https://docs.google.com/spreadsheets/d/191RWU_J2IxqfwdwCbvopVtcb4WhRkPM1UQppVbgiLhs/edit',
  driveFolderId: process.env.DEFAULT_WORKSPACE_DRIVE_FOLDER_ID || '',
  finalDocumentsFolderId: process.env.DEFAULT_WORKSPACE_FINAL_DOCUMENTS_FOLDER_ID || '',
  timeZone: process.env.DEFAULT_WORKSPACE_TIME_ZONE || 'Asia/Tashkent',
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function shouldBootstrapDefaultWorkspace() {
  return String(process.env.DEFAULT_WORKSPACE_BOOTSTRAP ?? 'true').toLowerCase() !== 'false';
}

async function bootstrapDefaultWorkspace(userId) {
  const workspace = await createWorkspace(userId, DEFAULT_WORKSPACE);
  const active = await updateWorkspace(userId, workspace.id, { ...DEFAULT_WORKSPACE, status: 'active' });
  return active;
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
  const rows = await listUserWorkspaces(userId);
  if (rows.length || !shouldBootstrapDefaultWorkspace()) return rows;

  await bootstrapDefaultWorkspace(userId);
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
      driveFolderUrl: input.driveFolderUrl,
      driveFolderId: input.driveFolderId ?? current.driveFolderId,
      finalDocumentsFolderUrl: input.finalDocumentsFolderUrl,
      finalDocumentsFolderId: input.finalDocumentsFolderId ?? current.finalDocumentsFolderId,
      timeZone: input.timeZone ?? current.timeZone,
      serviceAccountBase64: input.serviceAccountBase64 !== undefined ? input.serviceAccountBase64 : current.serviceAccountBase64,
      moduleSettings: input.moduleSettings ?? current.moduleSettings,
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

export async function archiveWorkspace(userId, workspaceId, options = {}) {
  return withTransaction(async (client) => {
    let current;
    if (options.preAuthorized) {
      // Platform admin bypasses membership check — workspace already verified by middleware
      const { findWorkspaceById } = await import('../repositories/workspaceRepository.js');
      current = await findWorkspaceById(workspaceId, client);
      if (current) { current.memberRole = 'owner'; current.memberStatus = 'active'; }
    } else {
      current = await findWorkspaceForUser(workspaceId, userId, { forUpdate: true, client });
    }
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

function normalizeMemberEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw serviceError('Valid member email is required', 'WORKSPACE_MEMBER_EMAIL_REQUIRED', 400);
  }
  return email;
}

function normalizeMemberId(value) {
  const memberId = String(value || '').trim();
  if (!UUID_PATTERN.test(memberId)) {
    throw serviceError('Workspace member ID is invalid', 'INVALID_WORKSPACE_MEMBER_ID', 400);
  }
  return memberId;
}

function ensureActiveUser(user) {
  if (!user) {
    throw serviceError('Platform user not found. Create the user first.', 'WORKSPACE_MEMBER_USER_NOT_FOUND', 404);
  }
  if (user.status !== 'active') {
    throw serviceError('Only active platform users can join a workspace', 'WORKSPACE_MEMBER_USER_INACTIVE', 409);
  }
}

export async function createWorkspaceMember(actorWorkspace, input = {}) {
  const email = normalizeMemberEmail(input.email);
  const user = await findUserByEmail(email);
  ensureActiveUser(user);
  
  const platformRole = String(user.platformRole || '').toLowerCase();
  let mappedRole = 'viewer';
  if (platformRole === 'super_admin' || platformRole === 'super admin') mappedRole = 'administrator';
  else if (platformRole === 'кип мастер') mappedRole = 'engineer';
  
  const role = normalizeWorkspaceMemberRole(mappedRole);
  const status = normalizeWorkspaceMemberStatus(input.status);
  assertCanAssignWorkspaceRole(actorWorkspace.memberRole, role);


  const existing = await findWorkspaceMemberByUserId(actorWorkspace.id, user.id);
  if (existing) {
    throw serviceError('User is already a member of this workspace', 'WORKSPACE_MEMBER_EXISTS', 409);
  }

  await addWorkspaceMember({
    workspaceId: actorWorkspace.id,
    userId: user.id,
    role,
    status,
  });
  return findWorkspaceMemberByUserId(actorWorkspace.id, user.id);
}

export async function updateWorkspaceMember(actorWorkspace, memberId, input = {}) {
  const normalizedMemberId = normalizeMemberId(memberId);
  const current = await findWorkspaceMemberById(actorWorkspace.id, normalizedMemberId);
  if (!current) {
    throw serviceError('Workspace member not found', 'WORKSPACE_MEMBER_NOT_FOUND', 404);
  }

  const role = input.role === undefined
    ? current.role
    : normalizeWorkspaceMemberRole(input.role);
  const status = input.status === undefined
    ? current.status
    : normalizeWorkspaceMemberStatus(input.status);
  assertCanManageWorkspaceMember(actorWorkspace.memberRole, current.role, role);

  if (status === 'active') {
    ensureActiveUser({ status: current.userStatus });
  }
  const member = await updateWorkspaceMemberRecord(actorWorkspace.id, normalizedMemberId, { role, status });
  if (!member) {
    throw serviceError('Workspace member not found', 'WORKSPACE_MEMBER_NOT_FOUND', 404);
  }
  return member;
}

export async function deleteWorkspaceMember(actorWorkspace, memberId) {
  const normalizedMemberId = normalizeMemberId(memberId);
  const current = await findWorkspaceMemberById(actorWorkspace.id, normalizedMemberId);
  if (!current) {
    throw serviceError('Workspace member not found', 'WORKSPACE_MEMBER_NOT_FOUND', 404);
  }
  assertCanManageWorkspaceMember(actorWorkspace.memberRole, current.role);
  const deleted = await deleteWorkspaceMemberRecord(actorWorkspace.id, normalizedMemberId);
  if (!deleted) {
    throw serviceError('Workspace member not found', 'WORKSPACE_MEMBER_NOT_FOUND', 404);
  }
  return { deleted: true, memberId: deleted.id, userId: deleted.user_id };
}
