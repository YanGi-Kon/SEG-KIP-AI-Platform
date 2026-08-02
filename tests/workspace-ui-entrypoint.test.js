import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('the workspace UI is loaded by the production entrypoint', () => {
  const indexPath = new URL('../public/index.html', import.meta.url);
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  const appScriptIndex = indexHtml.indexOf('<script src="js/app.js"></script>');
  const workspaceScriptIndex = indexHtml.indexOf('<script src="js/workspace-ui.js"></script>');

  assert.notEqual(appScriptIndex, -1, 'app.js must be loaded');
  assert.notEqual(workspaceScriptIndex, -1, 'workspace-ui.js must be loaded');
  assert.ok(
    workspaceScriptIndex > appScriptIndex,
    'workspace-ui.js must load after app.js so it can extend the existing navigation',
  );
});
