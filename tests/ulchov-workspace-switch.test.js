import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('O‘lchov module handles Workspace changes without iframe reload or manual save', () => {
  const source = fs.readFileSync(new URL('../public/js/ulchov-sheets.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');

  assert.match(source, /loadSheet\(false,nextId\)/);
  assert.match(source, /STALE_WORKSPACE_RESPONSE/);
  assert.match(source, /e\.data\.workspaceId/);
  assert.match(app, /activeModuleName !== 'ulchov'/);
});

test('latest Workspace response wins when O‘lchov workspaces switch quickly', async () => {
  const source = fs.readFileSync(new URL('../public/js/ulchov-sheets.js', import.meta.url), 'utf8');
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
      elements.set(id, {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        className: '',
        style: {},
        classList: { add() {}, remove() {} },
      });
    }
    return elements.get(id);
  };
  const parent = { localStorage, sessionStorage, postMessage() {} };
  const menus = JSON.stringify([{ menuName: 'ПАСПОРТ МАНОМЕТР', sheetName: 'Манометр' }]);
  const context = {
    console,
    document: {
      readyState: 'loading',
      addEventListener(type, handler) { handlers[type] = handler; },
      getElementById: element,
      querySelector() { return null; },
    },
    fetch: async (_url, options) => {
      const workspaceId = options.headers['x-workspace-id'];
      requests.push(workspaceId);
      if (workspaceId === 'workspace-a') await new Promise((resolve) => setTimeout(resolve, 20));
      const instruments = workspaceId === 'workspace-a'
        ? [{ pos: '1', name: 'A-1', brand: 'A' }, { pos: '2', name: 'A-2', brand: 'A' }]
        : [{ pos: '9', name: 'B-1', brand: 'B' }];
      return {
        ok: true,
        json: async () => ({ ok: true, sheetName: 'Манометр', instruments }),
      };
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
  const workspace = (id) => ({
    id,
    moduleSettings: {
      ulchov_sheet_name: 'Манометр',
      ulchov_menu_sheet_map: menus,
    },
  });

  const first = handlers.message({
    data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-a', workspace: workspace('workspace-a'), isAdmin: true },
  });
  const second = handlers.message({
    data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-b', workspace: workspace('workspace-b'), isAdmin: true },
  });
  await Promise.all([first, second]);

  assert.deepEqual(requests, ['workspace-a', 'workspace-b']);
  assert.equal(context.window.UlchovSheets.state.instruments.length, 1);
  assert.equal(context.window.UlchovSheets.state.instruments[0].name, 'B-1');
  assert.equal(element('total-count').textContent, 1);
});
