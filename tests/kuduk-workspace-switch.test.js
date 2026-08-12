import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { resolveKudukTenantId } from '../routes/kuduk.js';

test('kuduk tenant state is isolated by Workspace id', () => {
  const first = resolveKudukTenantId({ workspaceId: '11111111-1111-4111-8111-111111111111', legacySexId: 'sex_4' });
  const second = resolveKudukTenantId({ workspaceId: '22222222-2222-4222-8222-222222222222', legacySexId: 'sex_4' });

  assert.equal(first, 'workspace_11111111-1111-4111-8111-111111111111');
  assert.equal(second, 'workspace_22222222-2222-4222-8222-222222222222');
  assert.notEqual(first, second);
});

test('legacy tenant id remains available only when Workspace context is absent', () => {
  assert.equal(resolveKudukTenantId({ legacySexId: 'sex_4' }), 'sex_4');
});

test('journal reacts to Workspace change without requiring Save & Connect', () => {
  const html = fs.readFileSync(new URL('../public/modules/kuduk-journal.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const route = fs.readFileSync(new URL('../routes/kuduk.js', import.meta.url), 'utf8');

  assert.match(html, /SEG_KIP_WORKSPACE_CHANGE/);
  assert.match(html, /activateWorkspace\(event\.data\.workspaceId\)/);
  assert.match(html, /query:\{ workspaceId: workspaceId\(\), sexId: sexId\(\) \}/);
  assert.match(app, /\['journal','acts','faults','to','replacement'\]\.includes\(activeModuleName\)/);
  assert.match(route, /applyConfig\(tenantId, config, false\)/);
  assert.match(route, /applyConfig\(tenantId, body, !req\.workspace\)/);
});

test('Workspace message reloads journal state with the new workspace header and socket room', async () => {
  const html = fs.readFileSync(new URL('../public/modules/kuduk-journal.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const source = scripts.at(-1)?.[1] || '';
  const handlers = {};
  const requests = [];
  const socketWorkspaces = [];
  const storage = new Map([['seg_kip_selected_workspace_id', 'workspace-a']]);
  const sessionStorage = new Map([['seg_kip_workspace_access_token', 'test-token']]);
  const makeStorage = (map) => ({
    getItem: (key) => map.get(key) || '',
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  });
  const localStorage = makeStorage(storage);
  const session = makeStorage(sessionStorage);
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: id === 'menuSheet' ? 'кудук руйхати' : '',
        innerHTML: '',
        textContent: '',
        className: '',
        style: {},
        classList: { add() {}, remove() {} },
        addEventListener() {},
      });
    }
    return elements.get(id);
  };
  const parent = { localStorage, sessionStorage: session, postMessage() {} };
  const context = {
    Headers,
    console,
    confirm: () => true,
    document: { getElementById: element },
    fetch: async (url, options = {}) => {
      const workspaceId = options.headers?.get('x-workspace-id') || '';
      requests.push({ url, workspaceId });
      return {
        ok: true,
        json: async () => ({
          connected: false,
          status: 'OFFLINE',
          sexId: `workspace_${workspaceId}`,
          routes: [],
          sheets: {},
          statuses: {},
        }),
      };
    },
    io: ({ query }) => {
      socketWorkspaces.push(query.workspaceId);
      return { disconnect() {}, on() {} };
    },
    localStorage,
    parent,
    sessionStorage: session,
    setTimeout,
    window: {
      addEventListener(type, handler) { handlers[type] = handler; },
    },
  };
  vm.runInNewContext(source, context);

  handlers.load();
  await new Promise((resolve) => setTimeout(resolve, 0));
  handlers.message({ data: { type: 'SEG_KIP_WORKSPACE_CHANGE', workspaceId: 'workspace-b' } });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(requests.filter((item) => item.url.includes('/state')).map((item) => item.workspaceId), [
    'workspace-a',
    'workspace-b',
  ]);
  assert.deepEqual(socketWorkspaces, ['workspace-a', 'workspace-b']);
});
