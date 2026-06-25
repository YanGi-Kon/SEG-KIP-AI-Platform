import { extractSpreadsheetId, getSheetsClient } from './googleSheetsService.js';
import { resolveGoogleConfig } from './signatureApprovalService.js';

const REQUIRED_ACT_TABS = [
  'АКТЛАР_КУНЛИК',
  'АКТЛАР_РЕЕСТР',
  'ИМЗО_ЧЕКУВЧИЛАР',
];

export function resolveWorkspaceGoogleConfig(workspace) {
  if (!workspace?.spreadsheetUrl || !workspace?.mainSheetName) {
    throw new Error('Workspace Google Sheets configuration is incomplete');
  }

  const platformConfig = resolveGoogleConfig(
    { spreadsheetUrl: workspace.spreadsheetUrl },
    { requireServer: false },
  );

  return {
    ...platformConfig,
    spreadsheetUrl: workspace.spreadsheetUrl,
  };
}

export async function testWorkspaceSheetConnection(workspace) {
  const config = resolveWorkspaceGoogleConfig(workspace);
  const sheets = await getSheetsClient(config.serviceAccount);
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
    fields: 'spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,sheetType))',
  });

  const tabs = (response.data.sheets || [])
    .map((sheet) => sheet.properties?.title)
    .filter(Boolean);
  const tabSet = new Set(tabs);
  const missingRequiredTabs = REQUIRED_ACT_TABS.filter((name) => !tabSet.has(name));
  const mainSheetExists = tabSet.has(workspace.mainSheetName);

  return {
    ok: mainSheetExists,
    spreadsheetId,
    spreadsheetTitle: response.data.properties?.title || '',
    locale: response.data.properties?.locale || '',
    sheetTimeZone: response.data.properties?.timeZone || '',
    workspaceTimeZone: workspace.timeZone || 'Asia/Tashkent',
    mainSheetName: workspace.mainSheetName,
    mainSheetExists,
    tabs,
    requiredTabs: REQUIRED_ACT_TABS,
    missingRequiredTabs,
    accessVerified: true,
    writeCapabilityVerified: false,
    driveFolderVerified: false,
  };
}
