import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/modules/to.html', import.meta.url), 'utf8');

test('TO JURNALI requested signer rows are prepared for automatic F.I.O and signatures', () => {
  for (const id of [
    'toDepartmentChiefName', 'toDepartmentChiefSignature',
    'toKipChiefName', 'toKipChiefSignature',
    'toKipMasterName', 'toKipMasterSignature',
    'toProductionMaster1Name', 'toProductionMaster1Signature',
    'toProductionMaster2Name', 'toProductionMaster2Signature',
    'toPpnMaster1Name', 'toPpnMaster1Signature',
    'toPpnMaster2Name', 'toPpnMaster2Signature',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="toKipMasterPreambleName"/);
  assert.match(html, /представители участок КИПиА Фазилов И\. Б\.<br>/);
});

test('TO JURNALI classifies requested Russian and Uzbek Cyrillic signer positions', () => {
  assert.match(html, /function signerRoleKey\(row=\{\}\)/);
  assert.match(html, /text\.includes\('кип'\).*text\.includes\('нўвваа'\).*text\.includes\('нувваа'\)/);
  assert.match(html, /if\(hasKip&&isChief\)return'kip-chief'/);
  assert.match(html, /if\(hasKip&&isMaster\)return'kip-master'/);
  assert.match(html, /text\.includes\('добыч'\).*text\.includes\('қазиб'\).*text\.includes\('казиб'\)/);
  assert.match(html, /return'production-master'/);
  assert.match(html, /text\.includes\('ппн'\).*return'ppn-master'/);
  assert.match(html, /text\.includes\('устаси'\)/);
});

test('TO JURNALI loads the Workspace signer registry once and distributes duplicate roles into separate slots', () => {
  assert.match(html, /async function loadAutoSigners\(expectedWsId=state\.workspaceId\)/);
  assert.match(html, /\/api\/workspaces\/\$\{encodeURIComponent\(expectedWsId\)\}\/signers\?includeInactive=true/);
  assert.match(html, /function assignSignersToSlots\(signers=\[\],slots=\[\]\)/);
  assert.match(html, /AUTO_SIGNER_SLOTS\.filter\(slot=>slot\.key===key\)/);
  assert.match(html, /renderAutoSigner\(slot,signer,signatureUrl,hasSaved\?'manual':'auto'\)/);
  assert.match(html, /signatureObjectUrls:\[\]/);
  assert.match(html, /state\.signatureObjectUrls\.push\(objectUrl\)/);
  assert.match(html, /loadAutoSigners\(state\.workspaceId\)/);
});

test('TO JURNALI supports selectable approvers from the shared active signer registry', () => {
  assert.match(html, /\{key:'department-chief'/);
  assert.match(html, /\{key:'kip-chief'/);
  assert.match(html, /\{key:'kip-master'/);
  assert.match(html, /\{key:'production-master'/);
  assert.match(html, /\{key:'ppn-master'/);
  assert.match(html, /class="signer-name-select"/);
  assert.match(html, /state\.signerRegistry=.*filter\(row=>!row\.status\|\|normalizeSignerText\(row\.status\)==='active'\)/);
  assert.match(html, /state\.signerRegistry\.map\(row=>/);
  assert.match(html, /select\.addEventListener\('change',\(\)=>void selectSignerForSlot\(slot,select\.value\)\)/);
  assert.doesNotMatch(html, /\{key:'engineer'/);
});

test('TO JURNALI remembers manual approver choices per Workspace and month', () => {
  assert.match(html, /SIGNER_SELECTION_STORAGE_PREFIX='seg_to_signer_selection_v1'/);
  assert.match(html, /signerSelectionStorageKey\(workspaceId=state\.workspaceId,year=state\.periodYear,month=state\.periodMonth\)/);
  assert.match(html, /saved\[slot\.nameId\]=id/);
  assert.match(html, /writeSignerSelections\(saved\)/);
  assert.match(html, /applySignerSelectionsForCurrentPeriod/);
});

test('TO JURNALI selected approver receives the signature stored in 5. ИМЗО ЧЕКУВЧИЛАР', () => {
  assert.match(html, /state\.signerRegistry\.find\(row=>clean\(row\.id\)===id\)/);
  assert.match(html, /signatureDisplayUrl\(signer,expectedWsId,requestVersion\)/);
  assert.match(html, /renderAutoSigner\(slot,signer,signatureUrl,'manual'\)/);
});
