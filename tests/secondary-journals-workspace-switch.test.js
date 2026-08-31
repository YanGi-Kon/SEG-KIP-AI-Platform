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
        children: [],
        className: '',
        dataset: {},
        style: {},
        addEventListener() {},
        appendChild(fragment) { if (fragment?.children) this.children.push(...fragment.children); },
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

test('Nosozliklar reglament frontend jadvali Workspace nomini iframe reloadsiz almashtiradi', () => {
  const html = read('../public/modules/faults.html');
  const source = inlineScript(html);
  const local = storage();
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
    document: {
      getElementById: get,
      addEventListener() {},
      createElement: () => ({ dataset: {}, innerHTML: '' }),
      createDocumentFragment: () => ({ children: [], appendChild(child) { this.children.push(child); } }),
    },
    localStorage: local.api,
    parent,
    setTimeout: (fn) => fn(),
    window,
  };
  vm.runInNewContext(source, context);

  handlers.message({ data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-a', workspace: { id: 'workspace-a', name: 'Sex A', moduleSettings: {} } } });
  assert.equal(window.FaultsJournalWorkspace.state.workspaceId, 'workspace-a');
  assert.equal(get('faultsWorkspaceName').textContent, 'Sex A');
  handlers.message({ data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-b', workspace: { id: 'workspace-b', name: 'Sex B', moduleSettings: {} } } });
  assert.equal(window.FaultsJournalWorkspace.state.workspaceId, 'workspace-b');
  assert.equal(get('faultsWorkspaceName').textContent, 'Sex B');
  assert.doesNotMatch(source, /seg_kip_faults_frontend_rows_v1|SAVE_MODULE_SETTINGS/);
  assert.match(source, /REQUEST_WORKSPACE_INFO/);
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
