import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Aktlar arxivi Workspace almashtirilganda saqlashsiz yangilanadi', () => {
  const source = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');

  assert.match(source, /loadAnalysis\(nextId\)/);
  assert.match(source, /loadReports\(nextId\)/);
  assert.match(source, /STALE_WORKSPACE_RESPONSE/);
  assert.match(source, /e\.data\.workspaceId/);
  assert.match(source, /window\.ActsUI=\{state,[^}]*loadReports/);
  assert.match(app, /\['journal','acts','faults','to','replacement'\]\.includes\(activeModuleName\)/);
});

test('A4 hujjatdagi imzo PNG doimiy o‘lchamda ko‘rinishi kerak', () => {
  const source = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');

  assert.match(source, /signatureUrl1|signatureUrl2|signatureUrl3/);
  assert.match(source, /object-fit:\s*contain/);
  assert.match(source, /object-position:\s*center bottom/);
  assert.match(source, /trimSignaturePngWhitespace\(blob\)/);
  assert.match(source, /<img src="\$\{esc\(url\)\}" alt="Имзо"/);
  assert.match(source, /signerCell\(a\[`department\$\{slot\}`\],'цех ва и\/ж\.',a\[`signatureUrl\$\{slot\}`\]\)/);
});

test('viewDoc registry va himoyalangan PNG yuklangandan keyin A4 ni ko‘rsatishi kerak', async () => {
  const source = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');
  const requests = [];
  const elements = new Map();
  const makeStorage = (entries = []) => {
    const values = new Map(entries);
    return {
      getItem: (key) => values.get(key) || '',
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    };
  };
  const localStorage = makeStorage([
    ['seg_kip_selected_workspace_id', 'workspace-test'],
    ['acts_sheet_name', 'ASOSIY VAROQ'],
  ]);
  const sessionStorage = makeStorage([['seg_kip_workspace_access_token', 'workspace-token']]);
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        disabled: false,
        style: { setProperty() {} },
        classList: { add() {}, remove() {}, contains() { return false; } },
        querySelector() { return null; },
      });
    }
    return elements.get(id);
  };
  const parent = { localStorage, sessionStorage, postMessage() {} };
  const signatureId = '11111111-1111-4111-8111-111111111111';
  const context = {
    console,
    Headers,
    TextEncoder,
    Blob,
    btoa,
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById: element,
      createElement: () => element(`created-${elements.size}`),
      body: { appendChild(node) { if (node.id) elements.set(node.id, node); } },
      querySelectorAll() { return []; },
    },
    fetch: async (url, options = {}) => {
      const authorization = options.headers instanceof Headers
        ? options.headers.get('Authorization')
        : options.headers?.Authorization || '';
      requests.push({ url, authorization });
      if (url.endsWith('/signers?includeInactive=true')) {
        return {
          ok: true,
          json: async () => ({ rows: [{
            id: 'signer-1',
            fullName: 'Ali Valiyev',
            position: 'КИП Мастер',
            status: 'active',
            signatureFileId: `db:${signatureId}`,
            signatureUrl: 'https://drive.google.com/file/d/not-an-image/view',
          }] }),
        };
      }
      if (url.endsWith(`/signers/signature/${signatureId}`)) {
        return { ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    localStorage,
    parent,
    sessionStorage,
    setTimeout,
    URL: {
      createObjectURL: () => 'blob:kip-master-signature',
      revokeObjectURL() {},
    },
    window: { addEventListener() {}, parent },
  };
  vm.runInNewContext(source, context);
  context.window.ActsUI.state.dailyRows = [{
    actNo: '444',
    a4Json: JSON.stringify({
      actNo: '444',
      person1: 'Ali Valiyev',
      position1: 'КИП Мастер',
      department1: 'Цех №1',
    }),
  }];

  await context.window.ActsUI.viewDoc('444');

  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ authorization }) => authorization === 'Bearer workspace-token'));
  assert.match(requests[1].url, new RegExp(`/signers/signature/${signatureId}$`));
  const a4Html = element('actsA4Content').innerHTML;
  assert.match(a4Html, /src="blob:kip-master-signature"/);
  assert.match(a4Html, /act-signers-label">цех ва и\/ж\./);
  assert.ok(a4Html.indexOf('КИП Мастер') < a4Html.indexOf('blob:kip-master-signature'));
});

test('tez A → B almashishda faqat oxirgi Workspace aktlari va arxivi qoladi', async () => {
  const source = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');
  const handlers = {};
  const requests = [];
  const storage = new Map();
  const sessionValues = new Map([['seg_kip_workspace_access_token', 'test-token']]);
  const makeStorage = (map) => ({
    getItem: (key) => map.get(key) || '',
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  });
  const localStorage = makeStorage(storage);
  const sessionStorage = makeStorage(sessionValues);
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      const span = { textContent: '' };
      elements.set(id, {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        disabled: false,
        style: { setProperty() {} },
        classList: { add() {}, remove() {}, contains() { return false; } },
        querySelector(selector) { return selector === 'span' ? span : null; },
      });
    }
    return elements.get(id);
  };
  const parent = { localStorage, sessionStorage, postMessage() {} };
  const response = (data) => ({ ok: true, status: 200, json: async () => data });
  const context = {
    console,
    Headers,
    TextEncoder,
    btoa,
    document: {
      readyState: 'loading',
      addEventListener(type, handler) { handlers[type] = handler; },
      getElementById: element,
      querySelectorAll() { return []; },
    },
    fetch: async (url, options = {}) => {
      const workspaceId = options.headers instanceof Headers
        ? options.headers.get('x-workspace-id') || ''
        : options.headers?.['x-workspace-id'] || '';
      requests.push({ url, workspaceId });
      if (url.startsWith('/api/workspaces/')) return response({ rows: [] });
      if (workspaceId === 'workspace-a') await new Promise((resolve) => setTimeout(resolve, 25));
      if (url === '/api/acts/monthly-analysis') {
        return response(workspaceId === 'workspace-a'
          ? { totalRows: 20, plannedDocuments: 2, createdDocuments: 0, completionPercentage: 0, sheetName: 'A', rows: [{ deviceName: 'A-asbob' }] }
          : { totalRows: 10, plannedDocuments: 1, createdDocuments: 1, completionPercentage: 100, sheetName: 'B', rows: [{ deviceName: 'B-asbob' }] });
      }
      if (url === '/api/acts/reports/daily') {
        return response({ rows: workspaceId === 'workspace-a'
          ? [{ actNo: 'A-1' }, { actNo: 'A-2' }]
          : [{ actNo: 'B-1' }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    localStorage,
    parent,
    sessionStorage,
    setTimeout,
    window: {
      addEventListener(type, handler) { handlers[type] = handler; },
      parent,
    },
  };
  vm.runInNewContext(source, context);
  const workspace = (id) => ({ id, moduleSettings: { acts_sheet_name: id === 'workspace-a' ? 'A' : 'B' } });

  const first = handlers.message({
    data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-a', workspace: workspace('workspace-a'), isAdmin: true },
  });
  const second = handlers.message({
    data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-b', workspace: workspace('workspace-b'), isAdmin: true },
  });
  await Promise.all([first, second]);

  const actsRequests = requests.filter(({ url }) => url.startsWith('/api/acts/'));
  assert.deepEqual(actsRequests.map(({ workspaceId }) => workspaceId), [
    'workspace-a', 'workspace-a', 'workspace-b', 'workspace-b',
  ]);
  assert.equal(context.window.ActsUI.state.analysisRows.length, 1);
  assert.equal(context.window.ActsUI.state.analysisRows[0].deviceName, 'B-asbob');
  assert.equal(context.window.ActsUI.state.dailyRows.length, 1);
  assert.equal(context.window.ActsUI.state.dailyRows[0].actNo, 'B-1');
  assert.match(element('dailyRows').innerHTML, /B-1/);
  assert.doesNotMatch(element('dailyRows').innerHTML, /A-1/);
});
