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
  assert.match(source, /signerCell\(a\[`department\$\{slot\}`\],'цех ва и\/ж\.',a\[`signatureUrl\$\{slot\}`\],slot\)/);
  assert.match(source, /SEG_SIGNATURE_SLOT_\$\{signatureSlot\}_START/);
  assert.match(source, /canRenderSignerSlotSignature\(act,slot,signer\)/);
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

test('2–3-slot imzolari email tasdiq holatiga qarab yuklanadi', async () => {
  const source = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');
  const requests = [];
  const elements = new Map();
  const values = new Map([
    ['seg_kip_selected_workspace_id', 'workspace-test'],
    ['acts_sheet_name', 'ASOSIY VAROQ'],
  ]);
  const sessionValues = new Map([['seg_kip_workspace_access_token', 'workspace-token']]);
  const storage = (map) => ({
    getItem: (key) => map.get(key) || '',
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  });
  const localStorage = storage(values);
  const sessionStorage = storage(sessionValues);
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      id,
      value: '',
      innerHTML: '',
      textContent: '',
      disabled: false,
      style: { setProperty() {} },
      classList: { add() {}, remove() {}, contains() { return false; } },
      querySelector() { return null; },
    });
    return elements.get(id);
  };
  const ids = {
    kip: '11111111-1111-4111-8111-111111111111',
    approved: '22222222-2222-4222-8222-222222222222',
    pending: '33333333-3333-4333-8333-333333333333',
  };
  const signers = [
    { id: 'kip-1', fullName: 'Fozilov O', position: 'КИП Мастер', email: 'kip@example.com', signatureFileId: `db:${ids.kip}`, status: 'active' },
    { id: 'signer-2', fullName: 'Imzolovchi Ikki', position: 'Sex boshlig‘i', email: 'two@example.com', signatureFileId: `db:${ids.approved}`, status: 'active' },
    { id: 'signer-3', fullName: 'Imzolovchi Uch', position: 'Muhandis', email: 'three@example.com', signatureFileId: `db:${ids.pending}`, status: 'active' },
  ];
  const assignedApprovers = [
    { slot: 1, signerId: 'kip-1', fio: 'Fozilov O', position: 'КИП Мастер', gmail: 'kip@example.com' },
    { slot: 2, signerId: 'signer-2', fio: 'Imzolovchi Ikki', position: 'Sex boshlig‘i', gmail: 'two@example.com' },
    { slot: 3, signerId: 'signer-3', fio: 'Imzolovchi Uch', position: 'Muhandis', gmail: 'three@example.com' },
  ];
  const approvalRows = [
    { slot: 2, signerId: 'signer-2', fio: 'Imzolovchi Ikki', gmail: 'two@example.com', status: 'Тасдиқланди' },
    { slot: 3, signerId: 'signer-3', fio: 'Imzolovchi Uch', gmail: 'three@example.com', status: 'Кутилмоқда' },
  ];
  let objectUrlIndex = 0;
  const parent = { localStorage, sessionStorage, postMessage() {} };
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
      requests.push({ url, authorization: options.headers instanceof Headers ? options.headers.get('Authorization') : options.headers?.Authorization || '' });
      if (url.endsWith('/signers?includeInactive=true')) return { ok: true, json: async () => ({ rows: signers }) };
      if (Object.values(ids).some((id) => url.endsWith(`/signers/signature/${id}`))) {
        return { ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    localStorage,
    parent,
    sessionStorage,
    setTimeout,
    URL: {
      createObjectURL: () => `blob:approved-signature-${++objectUrlIndex}`,
      revokeObjectURL() {},
    },
    window: { addEventListener() {}, parent },
  };
  vm.runInNewContext(source, context);
  context.window.ActsUI.state.dailyRows = [{
    actNo: '777',
    a4Json: JSON.stringify({
      actNo: '777',
      person1: 'Fozilov O', position1: 'КИП Мастер', department1: 'Цех №1',
      person2: 'Imzolovchi Ikki', position2: 'Sex boshlig‘i', department2: 'Цех №1',
      person3: 'Imzolovchi Uch', position3: 'Muhandis', department3: 'Цех №1',
      assignedApprovers,
      approvals: approvalRows,
    }),
  }];

  await context.window.ActsUI.viewDoc('777');

  const imageRequests = requests.filter(({ url }) => url.includes('/signers/signature/'));
  assert.equal(imageRequests.length, 2);
  assert.ok(imageRequests.some(({ url }) => url.endsWith(ids.kip)));
  assert.ok(imageRequests.some(({ url }) => url.endsWith(ids.approved)));
  assert.ok(imageRequests.every(({ url }) => !url.endsWith(ids.pending)));
  assert.ok(requests.every(({ authorization }) => authorization === 'Bearer workspace-token'));
  const a4Html = element('actsA4Content').innerHTML;
  // Each loaded signature is reused in the upper signer block and the final signature block.
  assert.equal((a4Html.match(/<img src="blob:approved-signature-/g) || []).length, 4);
  assert.match(a4Html, /SEG_SIGNATURE_SLOT_3_START--><!--SEG_SIGNATURE_SLOT_3_END/);
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
