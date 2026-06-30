import {
  createWorkspaceSigner,
  deleteWorkspaceSigner,
  getWorkspaceSigner,
  listWorkspaceSigners,
  updateWorkspaceSigner,
} from '../repositories/workspaceSignerRepository.js';

function clean(value) {
  return String(value ?? '').trim();
}

function makeError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeStatus(value, fallback = 'active') {
  const status = clean(value || fallback).toLowerCase();
  if (!['active', 'inactive', 'deleted'].includes(status)) {
    throw makeError('Signer status must be active, inactive or deleted', 'INVALID_SIGNER_STATUS');
  }
  return status;
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  if (!email) throw makeError('Gmail/email kiritilishi shart', 'SIGNER_EMAIL_REQUIRED');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw makeError('Gmail/email formati noto‘g‘ri', 'INVALID_SIGNER_EMAIL');
  }
  return email;
}

function normalizeSignerInput(input = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || input.position !== undefined || input.lavozimi !== undefined) {
    out.position = clean(input.position || input.lavozimi);
    if (!out.position) throw makeError('Lavozimi kiritilishi shart', 'SIGNER_POSITION_REQUIRED');
  }
  if (!partial || input.fullName !== undefined || input.fio !== undefined || input.FIO !== undefined) {
    out.fullName = clean(input.fullName || input.fio || input.FIO);
    if (!out.fullName) throw makeError('F.I.O kiritilishi shart', 'SIGNER_FULL_NAME_REQUIRED');
  }
  if (!partial || input.email !== undefined || input.gmail !== undefined) {
    out.email = normalizeEmail(input.email || input.gmail);
  }
  if (!partial || input.signatureFileId !== undefined) {
    out.signatureFileId = clean(input.signatureFileId);
  }
  if (!partial || input.signatureUrl !== undefined || input.imzoPNG !== undefined) {
    out.signatureUrl = clean(input.signatureUrl || input.imzoPNG);
  }
  if (!partial || input.status !== undefined) {
    out.status = normalizeStatus(input.status, 'active');
  }
  if (!partial && !out.signatureFileId && !out.signatureUrl) {
    throw makeError('PNG imzo yuklanishi shart', 'SIGNER_SIGNATURE_REQUIRED');
  }
  return out;
}

function translateUniqueError(error) {
  if (error?.code !== '23505') return error;
  const constraint = String(error.constraint || '');
  if (constraint.includes('email')) {
    return makeError('Bu Gmail ushbu obyekt imzo chekuvchilari ro‘yxatida allaqachon mavjud', 'SIGNER_EMAIL_ALREADY_EXISTS', 409);
  }
  return makeError('Bu F.I.O va lavozim ushbu obyekt ro‘yxatida allaqachon mavjud', 'SIGNER_ALREADY_EXISTS', 409);
}

export async function getWorkspaceSignerList(workspaceId, options = {}) {
  return listWorkspaceSigners(workspaceId, options);
}

export async function createSignerForWorkspace(workspaceId, input, actorUserId) {
  try {
    const normalized = normalizeSignerInput(input);
    return await createWorkspaceSigner(workspaceId, { ...normalized, actorUserId });
  } catch (error) {
    throw translateUniqueError(error);
  }
}

export async function updateSignerForWorkspace(workspaceId, signerId, input, actorUserId) {
  try {
    const current = await getWorkspaceSigner(workspaceId, signerId);
    if (!current) throw makeError('Imzo chekuvchi topilmadi', 'SIGNER_NOT_FOUND', 404);
    const normalized = normalizeSignerInput(input, { partial: true });
    const updated = await updateWorkspaceSigner(workspaceId, signerId, { ...normalized, actorUserId });
    if (!updated) throw makeError('Imzo chekuvchi topilmadi', 'SIGNER_NOT_FOUND', 404);
    return updated;
  } catch (error) {
    throw translateUniqueError(error);
  }
}

export async function deleteSignerForWorkspace(workspaceId, signerId, actorUserId) {
  const deleted = await deleteWorkspaceSigner(workspaceId, signerId, actorUserId);
  if (!deleted) throw makeError('Imzo chekuvchi topilmadi', 'SIGNER_NOT_FOUND', 404);
  return { deleted: true, id: signerId };
}
