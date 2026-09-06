import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/modules/to.html', import.meta.url), 'utf8');

test('TO JURNALI Мастер КИПиА imzolovchisini workspace signerlaridan avtomatik oladi', () => {
  assert.match(html, /id="toKipMasterName"/);
  assert.match(html, /id="toKipMasterSignature"/);
  assert.match(html, /id="toKipMasterPreambleName"/);
  assert.match(html, /\/api\/workspaces\/\$\{encodeURIComponent\(expectedWsId\)\}\/signers\?includeInactive=true/);
  assert.match(html, /isKipMasterSigner/);
  assert.match(html, /signatureFileId\.match\(\/\^db:/);
  assert.match(html, /loadKipMasterSigner\(state\.workspaceId\)/);
});

test('TO JURNALI faqat Мастер КИПиА rolini avtomatik tanlaydi', () => {
  assert.match(html, /text\.includes\('кип'\)&&text\.includes\('мастер'\)/);
  assert.match(html, /text\.includes\('kip'\)&&text\.includes\('master'\)/);
  assert.doesNotMatch(html, /text\.includes\('инженер'\)/);
});
