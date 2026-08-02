import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function source(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8');
}

test('legacy acts routes enforce workspace permissions when workspace mode is enabled', async () => {
  const routeSource = await source('../routes/acts.js');

  assert.match(routeSource, /workspaceGuards\('documents:read'\)/);
  assert.match(routeSource, /workspaceGuards\('documents:create'\)/);
  assert.match(routeSource, /workspaceGuards\('workspace:test'\)/);
  assert.match(routeSource, /resolveWorkspaceGoogleConfig\(req\.workspace\)/);
  assert.match(routeSource, /req\.workspace\?\.mainSheetName/);
});

test('workspace request authorization accepts a workspace id header', async () => {
  const middlewareSource = await source('../middleware/workspaceAccess.js');

  assert.match(middlewareSource, /requireWorkspaceRequestPermission/);
  assert.match(middlewareSource, /req\.get\('x-workspace-id'\)/);
});

test('department managers receive read-only workspace settings and no member-list request', async () => {
  const uiSource = await source('../public/js/workspace-ui.js');
  const readMembersSection = uiSource.slice(
    uiSource.indexOf('function canReadMembers'),
    uiSource.indexOf('function canManageMemberRole'),
  );

  assert.match(readMembersSection, /\['owner', 'administrator'\]/);
  assert.doesNotMatch(readMembersSection, /department_manager/);
  assert.match(uiSource, /applyWorkspaceSettingsAccess/);
  assert.match(uiSource, /input\.readOnly = readOnly/);
});

test('acts UI binds create and send controls to workspace document permissions', async () => {
  const actsSource = await source('../public/js/acts.js');

  assert.match(actsSource, /department_manager: new Set\(\['documents:read','documents:send'\]\)/);
  assert.match(actsSource, /headers\.set\('x-workspace-id',id\)/);
  assert.match(actsSource, /!hasPermission\('documents:create'\)/);
  assert.match(actsSource, /hasPermission\('documents:send'\)/);
  assert.match(actsSource, /state\.workspace\.spreadsheetUrl/);
});

test('final documents folder is read-only outside owner and administrator roles', async () => {
  const folderSource = await source('../public/js/acts-final-documents-folder.js');

  assert.match(folderSource, /function canConfigureWorkspace/);
  assert.match(folderSource, /\['owner', 'administrator'\]/);
  assert.match(folderSource, /input\.readOnly = !canConfigureWorkspace\(\)/);
  assert.match(folderSource, /Boolean\(busy\) \|\| !canConfigureWorkspace\(\)/);
});
