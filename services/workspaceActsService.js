import { readSheetRows } from './googleSheetsService.js';
import { getDailyReports, writeActDocument } from './actBlankSheetService.js';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';
import { calculateCompletionPercentage } from '../domain/actsMetrics.js';

function clean(value) {
  return String(value ?? '').trim();
}

function serviceError(message, code = 'WORKSPACE_ACTS_ERROR', statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function isTargetWork(value) {
  const normalized = clean(value).toLowerCase().replace(/\s+/g, '');
  return ['то-2', 'то2', 'to-2', 'to2', 'акт', 'akt'].includes(normalized);
}

function isDataRow(row) {
  const values = Array.isArray(row) ? row : [];
  const joined = values.map((value) => clean(value).toLowerCase()).join(' ');
  if (!values.some((value) => clean(value))) return false;
  if (joined.includes('наименование') || joined.includes('заводской') || joined.includes('перечень')) return false;
  return Boolean(values[1] || values[2] || values[8]);
}

function makeSourceKey({ sheetName, rowNumber, positionNo, serialNo, deviceName, measureRange, place }) {
  const serialOrFallback = clean(serialNo || `${positionNo || ''}-${deviceName || ''}-${measureRange || ''}-${place || ''}`);
  return [sheetName, rowNumber, positionNo || '', serialOrFallback].map(clean).join('::');
}

function mapRow(row, index, sheetName, completedByKey) {
  const mapped = {
    rowNumber: index + 1,
    date: row[0] || '',
    positionNo: row[1] || '',
    deviceName: row[2] || '',
    typeMark: row[3] || '',
    serialNo: row[4] || '',
    measureRange: row[5] || '',
    place: row[6] || '',
    suv: row[7] || '',
    workType: row[8] || '',
    executor: row[9] || '',
    sourceSheet: sheetName,
    sourceRowNumber: index + 1,
  };
  mapped.sourceKey = makeSourceKey(mapped);
  const completed = completedByKey.get(mapped.sourceKey);
  mapped.isCompleted = Boolean(completed);
  mapped.actNo = completed?.actNo || '';
  mapped.rowStart = completed?.rowStart || '';
  mapped.status = mapped.isCompleted ? 'Хужат якунланди' : 'Хужат яратиш';
  return mapped;
}

async function workspaceConfig(workspace) {
  if (!workspace?.id) throw serviceError('Workspace topilmadi', 'WORKSPACE_NOT_FOUND', 404);
  if (!workspace.spreadsheetUrl || !workspace.mainSheetName) {
    throw serviceError('Workspace Google Sheets sozlamalari to‘liq emas', 'WORKSPACE_SHEETS_CONFIG_INCOMPLETE');
  }
  return resolveWorkspaceGoogleConfig(workspace);
}

export async function getWorkspaceMonthlyAnalysis(workspace) {
  const config = await workspaceConfig(workspace);
  const sheetName = workspace.mainSheetName;
  const rows = await readSheetRows({
    spreadsheetUrl: config.spreadsheetUrl,
    serviceAccount: config.serviceAccount,
    sheetName,
    range: 'A:J',
  });
  const reports = await getDailyReports({
    spreadsheetUrl: config.spreadsheetUrl,
    serviceAccount: config.serviceAccount,
  });
  const completedByKey = new Map(
    reports
      .filter((report) => clean(report.sourceKey))
      .map((report) => [clean(report.sourceKey), report]),
  );
  const dataRows = rows
    .map((row, index) => ({ row, index }))
    .filter((item) => isDataRow(item.row));
  const matched = dataRows
    .filter((item) => isTargetWork(item.row[8]))
    .map((item) => mapRow(item.row, item.index, sheetName, completedByKey));
  const completedMatched = matched.filter((row) => row.isCompleted).length;
  const createdDocuments = Math.min(matched.length, Math.max(completedMatched, reports.length));

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    totalRows: dataRows.length,
    plannedDocuments: matched.length,
    createdDocuments,
    completionPercentage: calculateCompletionPercentage(createdDocuments, matched.length),
    sheetName,
    credentialSource: config.credentialSource || 'UNKNOWN',
    serviceAccountClientEmail: config.serviceAccountClientEmail || '',
    serviceAccountProjectId: config.serviceAccountProjectId || '',
    rows: matched,
  };
}

export async function createWorkspaceActDocument(workspace, act) {
  if (!act || typeof act !== 'object') {
    throw serviceError('Akt ma’lumotlari kiritilmagan', 'WORKSPACE_ACT_PAYLOAD_REQUIRED');
  }
  const config = await workspaceConfig(workspace);
  const result = await writeActDocument({
    spreadsheetUrl: config.spreadsheetUrl,
    serviceAccount: config.serviceAccount,
    act,
  });
  return {
    ...result,
    workspaceId: workspace.id,
    credentialSource: config.credentialSource || 'UNKNOWN',
  };
}

export async function getWorkspaceDailyActReports(workspace) {
  const config = await workspaceConfig(workspace);
  const rows = await getDailyReports({
    spreadsheetUrl: config.spreadsheetUrl,
    serviceAccount: config.serviceAccount,
  });
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    credentialSource: config.credentialSource || 'UNKNOWN',
    serviceAccountClientEmail: config.serviceAccountClientEmail || '',
    serviceAccountProjectId: config.serviceAccountProjectId || '',
    rows,
  };
}
