import { extractSpreadsheetId, getSheetsClient } from './googleSheetsService.js';
import { resolveEnvServiceAccount } from './googleCredentialService.js';
import { getRuntimeWorkspaceServiceAccount } from './workspaceService.js';

const REQUIRED_ACT_TABS = [
  'АКТЛАР_КУНЛИК',
  'АКТЛАР_РЕЕСТР',
  'ИМЗО_ЧЕКУВЧИЛАР',
];

export async function resolveWorkspaceGoogleConfig(workspace) {
  if (!workspace?.spreadsheetUrl || !workspace?.mainSheetName) {
    throw new Error('Workspace Google Sheets configuration is incomplete');
  }

  const workspaceCredential = await getRuntimeWorkspaceServiceAccount(workspace.id);
  if (workspaceCredential?.serviceAccount) {
    return {
      spreadsheetUrl: workspace.spreadsheetUrl,
      serviceAccount: workspaceCredential.serviceAccount,
      credentialSource: workspaceCredential.credentialSource,
      credentialConflict: false,
      serviceAccountClientEmail: workspaceCredential.clientEmail || workspaceCredential.serviceAccount.client_email || '',
      serviceAccountProjectId: workspaceCredential.projectId || workspaceCredential.serviceAccount.project_id || '',
    };
  }

  const platformConfig = resolveEnvServiceAccount();
  return {
    ...platformConfig,
    spreadsheetUrl: workspace.spreadsheetUrl,
    serviceAccountClientEmail: platformConfig.serviceAccount?.client_email || '',
    serviceAccountProjectId: platformConfig.serviceAccount?.project_id || '',
  };
}

export async function testWorkspaceSheetConnection(workspace) {
  const config = await resolveWorkspaceGoogleConfig(workspace);
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
    credentialSource: config.credentialSource || 'UNKNOWN',
    serviceAccountClientEmail: config.serviceAccountClientEmail || '',
    serviceAccountProjectId: config.serviceAccountProjectId || '',
  };
}
