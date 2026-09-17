import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../public/js/to-period-sheet-bridge.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../public/js/to-signers-panel.js', import.meta.url), 'utf8');

test('TO JURNALI loads the signers panel and removes the redundant Open button', () => {
  assert.match(bridge, /to-signers-panel\.js\?v=to-signers6-final-order/);
  assert.match(bridge, /toOpenPeriodBtn'\)\?\.remove/);
});

test('TO JURNALI exposes 5. ИМЗО ЧЕКУВЧИЛАР from the selected Workspace registry', () => {
  assert.match(panel, /5\. ИМЗО ЧЕКУВЧИЛАР/);
  assert.match(panel, /toSignersBtn/);
  assert.match(panel, /toSignersModal/);
  assert.match(panel, /\/api\/workspaces\/\$\{encodeURIComponent\(wsId\)\}\/signers\?includeInactive=true/);
  assert.match(panel, /translatePosition\('Мастер КИПиА'\)/);
  assert.match(panel, /SEG_KIP_WORKSPACE_CHANGE/);
});


test('TO signer modal exposes the existing interface language mechanism beside refresh', () => {
  assert.match(panel, /id="toSignersLangBtn"/);
  assert.match(panel, /🌐 Язык интерфейса/);
  assert.match(panel, /data-to-signers-lang="ru">🇷🇺 Русский/);
  assert.match(panel, /data-to-signers-lang="uz_cyrl">🇺🇿 Ўзбекча \(кирилл\)/);
  assert.match(panel, /const LANG_KEY = 'seg_kip_lang'/);
  assert.match(panel, /parent\?\.setLanguage\?\.\(lang\)/);
  assert.match(panel, /window\.ToJournalWorkspace\?\.setInterfaceLanguage\?\.\(lang\)/);
});

test('TO signer positions are translated without modifying signer registry data', () => {
  assert.match(panel, /function translatePosition\(value, lang = state\.language\)/);
  assert.match(panel, /ru: 'Начальник участка', uz_cyrl: 'Участка бошлиғи'/);
  assert.match(panel, /'нч участка'/);
  assert.match(panel, /ru: 'Участок КИПиА', uz_cyrl: 'НЎВваА участка'/);
  assert.match(panel, /ru: 'Мастер КИПиА', uz_cyrl: 'НЎВваА устаси'/);
  assert.match(panel, /ru: 'Мастер добычи цех-1', uz_cyrl: 'Цех-1 қазиб чиқариш устаси'/);
  assert.match(panel, /ru: 'Мастер ППН-1', uz_cyrl: 'ППН-1 устаси'/);
  assert.match(panel, /ru: 'Слесарь КИПиА', uz_cyrl: 'НЎВваА чилангари'/);
  assert.match(panel, /esc\(translatePosition\(row\.position\)\)/);
  assert.doesNotMatch(panel, /fetch\([^\n]+position[^\n]+method:\s*['"](?:PUT|PATCH|POST)/);
});


test('TO signer modal adds a functional create button backed by the Workspace signer APIs', () => {
  assert.match(panel, /id="toSignersAddBtn"/);
  assert.match(panel, /\+ Добавить/);
  assert.match(panel, /\+ Қўшиш/);
  assert.match(panel, /id="toSignersAddForm"/);
  assert.match(panel, /id="toSignerAddPosition"/);
  assert.match(panel, /id="toSignerAddFullName"/);
  assert.match(panel, /id="toSignerAddEmail"/);
  assert.match(panel, /id="toSignerAddSignature"/);
  assert.match(panel, /accept="image\/png,\.png"/);
  assert.match(panel, /\/signers\/signature/);
  assert.match(panel, /form\.append\('signature', file\)/);
  assert.match(panel, /method: 'POST'/);
  assert.match(panel, /signatureFileId: clean\(uploaded\.fileId\)/);
  assert.match(panel, /status: 'active'/);
  assert.match(panel, /await load\(\)/);
  assert.match(panel, /window\.ToJournalWorkspace\?\.loadAutoSigners\?\.\(wsId\)/);
});
