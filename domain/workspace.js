const WORKSPACE_ROLES = new Set([
  'owner',
  'administrator',
  'operator',
  'engineer',
  'department_manager',
  'viewer',
]);

export function extractSpreadsheetId(value = '') {
  const input = String(value).trim();
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    || input.match(/^([a-zA-Z0-9_-]{20,})$/);
  if (!match) throw new Error('Invalid Google Sheets URL or ID');
  return match[1];
}

export function extractDriveFolderId(value = '') {
  const input = String(value).trim();
  if (!input) return '';
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    || input.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    || input.match(/^([a-zA-Z0-9_-]{15,})$/);
  if (!match) throw new Error('Invalid Google Drive folder URL or ID');
  return match[1];
}

export function slugifyWorkspaceName(value = '') {
  const slug = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (!slug) throw new Error('Workspace name must contain Latin letters or numbers for slug generation');
  return slug.slice(0, 80).replace(/-+$/g, '');
}

export function validateWorkspaceRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!WORKSPACE_ROLES.has(normalized)) {
    throw new Error(`Invalid workspace role: ${role}`);
  }
  return normalized;
}

function sourcePart(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function buildSourceKeyV2(input = {}) {
  const sheet = sourcePart(input.sourceSheet || input.sheetName);
  const row = sourcePart(input.sourceRowNumber || input.rowNumber);
  const position = sourcePart(input.positionNo);
  const serial = sourcePart(input.serialNo);
  const fallback = [
    sourcePart(input.deviceName),
    sourcePart(input.measureRange),
    sourcePart(input.place),
  ].join('|');
  const identity = serial || fallback;
  if (!sheet || !row || !identity) {
    throw new Error('sourceSheet, sourceRowNumber and serial/fallback identity are required');
  }
  return [sheet, row, position, identity].join('::');
}

export function normalizeWorkspaceInput(input = {}) {
  const name = String(input.name || input.workspaceName || '').trim();
  if (name.length < 2 || name.length > 200) {
    throw new Error('Workspace name must contain 2-200 characters');
  }
  const spreadsheetId = extractSpreadsheetId(input.spreadsheetUrl || input.spreadsheetId);
  const mainSheetName = String(input.mainSheetName || '').trim();
  if (!mainSheetName) throw new Error('Main sheet name is required');
  const driveFolderId = extractDriveFolderId(input.driveFolderUrl || input.driveFolderId || '');
  const timeZone = String(input.timeZone || 'Asia/Tashkent').trim();
  return {
    name,
    slug: String(input.slug || '').trim() || slugifyWorkspaceName(name),
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    mainSheetName,
    driveFolderId,
    timeZone,
  };
}

export const workspaceRoles = Object.freeze([...WORKSPACE_ROLES]);
