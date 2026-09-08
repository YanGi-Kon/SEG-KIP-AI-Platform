import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function source(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8');
}

test('acts routes keep the current workspace-wide guard and Workspace Google source', async () => {
  const routeSource = await source('../routes/acts.js');

  assert.match(routeSource, /router\.use\(workspaceGuards\('workspace:read'\)\)/);
  assert.match(routeSource, /const workspace = req\.workspace \|\| \{\}/);
  assert.match(routeSource, /workspace\.spreadsheetUrl/);
  assert.match(routeSource, /workspace\.serviceAccountBase64/);
  assert.doesNotMatch(routeSource, /req\.workspace\?\.mainSheetName/);
});

test('workspace request authorization accepts a workspace id header', async () => {
  const middlewareSource = await source('../middleware/workspaceAccess.js');

  assert.match(middlewareSource, /requireWorkspaceRequestPermission/);
  assert.match(middlewareSource, /req\.get\('x-workspace-id'\)/);
});

test('workspace settings member controls stay restricted to owner and administrator', async () => {
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

test('acts UI follows the simplified workspace model and module-scoped sheet settings', async () => {
  const actsSource = await source('../public/js/acts.js');

  assert.match(actsSource, /headers\.set\('x-workspace-id',\s*wid\)/);
  assert.match(actsSource, /window\.actsIsAdmin = isAdmin/);
  assert.match(actsSource, /ws\?\.moduleSettings\?\.acts_sheet_name/);
  assert.match(actsSource, /localStorage\.setItem\(KEYS\.sheet, ws\.moduleSettings\.acts_sheet_name\)/);
  assert.doesNotMatch(actsSource, /department_manager: new Set/);
});

test('final documents folder is read-only outside owner and administrator roles', async () => {
  const folderSource = await source('../public/js/acts-final-documents-folder.js');

  assert.match(folderSource, /function canConfigureWorkspace/);
  assert.match(folderSource, /\['owner', 'administrator'\]/);
  assert.match(folderSource, /input\.readOnly = !canConfigureWorkspace\(\)/);
  assert.match(folderSource, /Boolean\(busy\) \|\| !canConfigureWorkspace\(\)/);
});
