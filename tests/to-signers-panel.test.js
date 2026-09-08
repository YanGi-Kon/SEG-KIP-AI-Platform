import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../public/js/to-period-sheet-bridge.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../public/js/to-signers-panel.js', import.meta.url), 'utf8');

test('TO JURNALI loads the signers panel and removes the redundant Open button', () => {
  assert.match(bridge, /to-signers-panel\.js/);
  assert.match(bridge, /toOpenPeriodBtn'\)\?\.remove/);
});

test('TO JURNALI exposes 5. ИМЗО ЧЕКУВЧИЛАР from the selected Workspace registry', () => {
  assert.match(panel, /5\. ИМЗО ЧЕКУВЧИЛАР/);
  assert.match(panel, /toSignersBtn/);
  assert.match(panel, /toSignersModal/);
  assert.match(panel, /\/api\/workspaces\/\$\{encodeURIComponent\(wsId\)\}\/signers\?includeInactive=true/);
  assert.match(panel, /TO · Мастер КИПиА/);
  assert.match(panel, /SEG_KIP_WORKSPACE_CHANGE/);
});
