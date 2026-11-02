import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/js/ulchov-sheets.js', import.meta.url), 'utf8');
const kachalka = fs.readFileSync(new URL('../public/js/kachalka.js', import.meta.url), 'utf8');

test('ASOSIY VAROQ busy state is observed by the shared kachalka', () => {
  assert.match(source, /setAttribute\('aria-busy','true'\)/);
  assert.match(source, /removeAttribute\('aria-busy'\)/);
  assert.match(kachalka, /getAttribute\('aria-busy'\) === 'true'/);
  assert.match(kachalka, /attributeFilter:\['aria-busy'/);
});

function createUlchov(fetchImpl) {
  const values = new Map([
    ['ulchov_menu_sheet_map', JSON.stringify([{ menuName: 'Formulyar', sheetName: 'ASOSIY VAROQ' }])],
    ['ulchov_settings_confirmed', 'true'],
    ['seg_kip_selected_workspace_id', 'workspace-a'],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const attrs = new Map();
  const status = {
    className: '',
    textContent: '',
    setAttribute: (key, value) => attrs.set(key, String(value)),
    getAttribute: (key) => attrs.get(key) ?? null,
    removeAttribute: (key) => attrs.delete(key),
  };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    getElementById: (id) => id === 'ulchovSheetStatus' ? status : null,
    querySelector: () => null,
  };
  const window = { addEventListener() {} };
  const context = {
    window,
    document,
    localStorage: storage,
    sessionStorage: storage,
    parent: { localStorage: storage, sessionStorage: storage },
    fetch: fetchImpl,
  };
  vm.runInNewContext(source, context);
  return { api: window.UlchovSheets, status, storage };
}

test('ASOSIY VAROQ loader clears when the instruments request succeeds', async () => {
  let resolveFetch;
  const env = createUlchov(() => new Promise((resolve) => { resolveFetch = resolve; }));
  const loading = env.api.loadSheet();

  assert.equal(env.status.getAttribute('aria-busy'), 'true');
  assert.match(env.status.textContent, /маълумотлари юкланмоқда/);

  resolveFetch({
    ok: true,
    status: 200,
    json: async () => ({ instruments: [{ brand: 'WIKA' }], sheetName: 'ASOSIY VAROQ' }),
  });
  assert.equal(await loading, true);
  assert.equal(env.status.getAttribute('aria-busy'), null);
  assert.match(env.status.textContent, /маълумот юкланди/);
});

test('stale Workspace response clears the old loading state without overwriting the new one', async () => {
  let resolveFetch;
  const env = createUlchov(() => new Promise((resolve) => { resolveFetch = resolve; }));
  const loading = env.api.loadSheet(false, 'workspace-a');

  assert.equal(env.status.getAttribute('aria-busy'), 'true');
  env.storage.setItem('seg_kip_selected_workspace_id', 'workspace-b');
  resolveFetch({
    ok: true,
    status: 200,
    json: async () => ({ instruments: [{ brand: 'WIKA' }], sheetName: 'ASOSIY VAROQ' }),
  });

  assert.equal(await loading, false);
  assert.equal(env.status.getAttribute('aria-busy'), null);
  assert.doesNotMatch(env.status.textContent, /юкланмо|yuklanmoqda/i);
});

test('ASOSIY VAROQ loader clears when the instruments request fails', async () => {
  const env = createUlchov(async () => { throw new Error('offline'); });

  assert.equal(await env.api.loadSheet(), false);
  assert.equal(env.status.getAttribute('aria-busy'), null);
  assert.equal(env.status.textContent, 'offline');
});
