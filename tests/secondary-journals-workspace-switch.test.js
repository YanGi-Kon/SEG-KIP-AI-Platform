import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const inlineScript = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1] || '';

function storage(initial = []) {
  const values = new Map(initial);
  return {
    values,
    api: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  };
}

function elementFactory() {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        className: '',
        dataset: {},
        style: {},
        addEventListener() {},
        focus() {},
        reset() {},
        closest() { return null; },
        classList: { add() {}, remove() {}, contains() { return false; } },
      });
    }
    return elements.get(id);
  };
  return { elements, get };
}

test('Nosozliklar yozuvlari Workspace bo‘yicha ajratilib A → B → A qaytadi', () => {
  const html = read('../public/modules/faults.html');
  const source = inlineScript(html);
  const local = storage([
    ['seg_kip_faults_frontend_rows_v1:workspace-a', JSON.stringify([{ id: 'a1', position: 'A-101', status: 'open' }])],
    ['seg_kip_faults_frontend_rows_v1:workspace-b', JSON.stringify([{ id: 'b1', position: 'B-202', status: 'closed' }])],
  ]);
  const { get } = elementFactory();
  const handlers = {};
  const parent = { localStorage: local.api, postMessage() {} };
  const window = {
    parent,
    addEventListener(type, handler) { handlers[type] = handler; },
  };
  const context = {
    console,
    confirm: () => true,
    crypto: { randomUUID: () => 'uuid' },
    document: { getElementById: get, addEventListener() {} },
    localStorage: local.api,
    parent,
    setTimeout: (fn) => fn(),
    window,
  };
  vm.runInNewContext(source, context);

  handlers.message({ data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-a', workspace: { id: 'workspace-a', name: 'Sex A', moduleSettings: {} } } });
  assert.equal(window.FaultsJournalWorkspace.state.rows[0].position, 'A-101');
  handlers.message({ data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-b', workspace: { id: 'workspace-b', name: 'Sex B', moduleSettings: {} } } });
  assert.equal(window.FaultsJournalWorkspace.state.rows[0].position, 'B-202');
  assert.equal(get('faultsWorkspaceName').textContent, 'Sex B');
  handlers.message({ data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-a', workspace: { id: 'workspace-a', name: 'Sex A', moduleSettings: {} } } });
  assert.equal(window.FaultsJournalWorkspace.state.rows[0].position, 'A-101');
  assert.equal(get('faultsCountText').textContent, '1 ta yozuv');
  assert.match(source, /SAVE_MODULE_SETTINGS/);
});

for (const module of [
  { file: '../public/modules/to.html', api: 'ToJournalWorkspace', nameId: 'toWorkspaceName' },
  { file: '../public/modules/replacement.html', api: 'ReplacementJournalWorkspace', nameId: 'replacementWorkspaceName' },
]) {
  test(`${module.api} tanlangan Workspace nomini avtomatik almashtiradi`, () => {
    const source = inlineScript(read(module.file));
    const local = storage();
    const { get } = elementFactory();
    const handlers = {};
    const parent = { localStorage: local.api, postMessage() {} };
    const window = { parent, addEventListener(type, handler) { handlers[type] = handler; } };
    vm.runInNewContext(source, {
      document: { readyState: 'loading', getElementById: get, addEventListener() {} },
      localStorage: local.api,
      parent,
      window,
    });

    handlers.message({ data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-a', workspace: { id: 'workspace-a', name: 'Sex A' } } });
    handlers.message({ data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-b', workspace: { id: 'workspace-b', name: 'Sex B' } } });
    assert.equal(window[module.api].state.workspaceId, 'workspace-b');
    assert.equal(window[module.api].state.workspaceName, 'Sex B');
    assert.equal(get(module.nameId).textContent, 'Sex B');
    assert.match(source, /REQUEST_WORKSPACE_INFO/);
  });
}

test('Workspace-aware ikkilamchi jurnallar iframe qayta yuklanishisiz ishlaydi', () => {
  const app = read('../public/js/app.js');
  assert.match(app, /\['journal','acts','faults','to','replacement'\]\.includes\(activeModuleName\)/);
});
