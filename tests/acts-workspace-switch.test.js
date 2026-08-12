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
