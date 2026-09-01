import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const actsHtml = fs.readFileSync(
  new URL('../public/modules/acts.html', import.meta.url),
  'utf8',
);
const finalDocumentsScript = fs.readFileSync(
  new URL('../public/js/acts-final-documents-folder.js', import.meta.url),
  'utf8',
);
const workspacesRoute = fs.readFileSync(
  new URL('../routes/workspaces.js', import.meta.url),
  'utf8',
);

test('acts journal exposes the sixth final documents button and modal', () => {
  assert.match(actsHtml, /id="finalDocumentsFolderSettingsBtn"/);
  assert.match(actsHtml, /ActsUI\.openFinalDocumentsFolderSettings\(\)/);
  assert.match(actsHtml, />6\. ЯКУНИЙ ҲУЖЖАТЛАР<\/button>/);
  assert.match(actsHtml, /id="finalDocumentsFolderModal"/);
  assert.match(actsHtml, /id="finalDocumentsFolderPanel"/);
});

test('final documents dependencies load in a functional order', () => {
  const apiClient = actsHtml.indexOf('<script src="../js/workspace-api-client.js"></script>');
  const acts = actsHtml.indexOf('<script src="../js/acts.js');
  const finalDocuments = actsHtml.indexOf('<script src="../js/acts-final-documents-folder.js"></script>');
  const personalDrive = actsHtml.indexOf('<script src="../js/acts-personal-drive-settings.js"></script>');

  assert.ok(apiClient >= 0, 'workspace API client must be loaded');
  assert.ok(acts > apiClient, 'ActsUI must load after the workspace API client');
  assert.ok(finalDocuments > acts, 'final documents controls must extend ActsUI after it loads');
  assert.ok(personalDrive > finalDocuments, 'personal Drive controls must mount after the final documents panel');
});

test('the sixth button opens its modal and has working folder endpoints', () => {
  assert.match(finalDocumentsScript, /window\.ActsUI\.openFinalDocumentsFolderSettings = openFinalDocumentsFolderSettings/);
  assert.match(finalDocumentsScript, /finalDocumentsFolderModal'\)\?\.classList\.add\('show'\)/);
  assert.match(finalDocumentsScript, /documentsPath\(\)\}\/final-folder/);
  assert.match(workspacesRoute, /router\.put\('\/:workspaceId\/documents\/final-folder'/);
  assert.match(workspacesRoute, /router\.post\('\/:workspaceId\/documents\/final-folder\/test'/);
});
