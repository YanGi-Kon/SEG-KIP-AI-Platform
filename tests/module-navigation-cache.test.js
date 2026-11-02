import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');

function makeFrame(id = '') {
  let source = null;
  let sourceAssignments = 0;
  let messages = 0;
  const listeners = new Map();
  const frame = {
    id,
    dataset: {},
    hidden: true,
    title: '',
    contentWindow: { postMessage() { messages += 1; } },
    addEventListener: (name, callback) => listeners.set(name, callback),
    getAttribute: (name) => name === 'src' ? source : null,
    set src(value) { source = String(value); sourceAssignments += 1; },
    get src() { return source || 'about:blank'; },
    get sourceAssignments() { return sourceAssignments; },
    get postMessageCount() { return messages; },
  };
  return frame;
}

function createApp() {
  const frames = new Map([
    ['hisobotModuleFrame', makeFrame('hisobotModuleFrame')],
    ['faultsModuleFrame', makeFrame('faultsModuleFrame')],
    ['genericModuleFrame', makeFrame('genericModuleFrame')],
  ]);
  const pageClasses = new Set();
  const page = {
    classList: { add: (name) => pageClasses.add(name), remove: (name) => pageClasses.delete(name), contains: (name) => pageClasses.has(name) },
    appendChild: (frame) => frames.set(frame.id, frame),
    querySelectorAll: (selector) => selector === 'iframe' ? [...frames.values()] : [],
  };
  const ulchovPage = { classList: { add() {}, remove() {}, contains: () => false } };
  const localValues = new Map();
  const localStorage = {
    getItem: (key) => localValues.get(key) ?? null,
    setItem: (key, value) => localValues.set(key, String(value)),
  };
  const document = {
    getElementById: (id) => id === 'genericModulePage' ? page : id === 'ulchovIntegratedPage' ? ulchovPage : frames.get(id) ?? null,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    createElement: (tag) => tag === 'iframe' ? makeFrame() : { addEventListener() {} },
  };
  const listeners = new Map();
  const window = { addEventListener: (name, callback) => listeners.set(name, callback), scrollTo() {} };
  const context = { window, document, localStorage, console, setTimeout };
  vm.runInNewContext(appSource, context);
  return { openModulePage: context.openModulePage, frames, listeners };
}

test('switching generic menus reuses each module iframe instead of navigating it again', () => {
  const app = createApp();

  app.openModulePage('acts');
  const acts = app.frames.get('genericModuleFrame');
  assert.equal(acts.sourceAssignments, 1);

  app.openModulePage('to');
  const to = app.frames.get('toModuleFrame');
  assert.ok(to);
  assert.equal(to.sourceAssignments, 1);

  app.openModulePage('settings');
  const settings = app.frames.get('settingsModuleFrame');
  assert.ok(settings);
  assert.equal(settings.sourceAssignments, 1);

  app.openModulePage('to');
  assert.equal(app.frames.get('toModuleFrame'), to);
  assert.equal(to.sourceAssignments, 1);
  assert.equal(to.postMessageCount, 0, 'returning to TO does not trigger a second module open/load message');
  assert.equal(to.hidden, false);
  assert.equal(settings.hidden, true);

  app.openModulePage('acts');
  assert.equal(app.frames.get('genericModuleFrame'), acts);
  assert.equal(acts.sourceAssignments, 1);
  assert.equal(acts.hidden, false);
});

test('journal and faults keep their own iframe when other menus are opened', () => {
  const app = createApp();
  app.openModulePage('journal');
  const journal = app.frames.get('hisobotModuleFrame');
  app.openModulePage('faults');
  const faults = app.frames.get('faultsModuleFrame');

  assert.equal(journal.sourceAssignments, 1);
  assert.equal(faults.sourceAssignments, 1);
  app.openModulePage('to');
  app.openModulePage('journal');
  app.openModulePage('faults');

  assert.equal(app.frames.get('hisobotModuleFrame'), journal);
  assert.equal(app.frames.get('faultsModuleFrame'), faults);
  assert.equal(journal.sourceAssignments, 1);
  assert.equal(faults.sourceAssignments, 1);
  assert.equal(journal.hidden, true);
  assert.equal(faults.hidden, false);
});

test('workspace changes refresh non-aware modules once, while hidden cached pages wait until opened', () => {
  const app = createApp();
  app.openModulePage('settings');
  const settings = app.frames.get('settingsModuleFrame');
  assert.equal(settings.sourceAssignments, 1);

  app.openModulePage('acts');
  app.listeners.get('seg-kip:workspace-change')({ detail: { workspace: { name: 'Workspace B' }, workspaceId: 'workspace-b' } });
  assert.equal(settings.sourceAssignments, 1, 'hidden settings frame is marked stale without an unnecessary background reload');
  assert.equal(settings.dataset.workspaceStale, 'true');

  app.openModulePage('settings');
  assert.equal(settings.sourceAssignments, 2, 'stale settings refresh once when selected');
  assert.equal(settings.dataset.workspaceStale, 'false');

  app.listeners.get('seg-kip:workspace-change')({ detail: { workspace: { name: 'Workspace C' }, workspaceId: 'workspace-c' } });
  assert.equal(settings.sourceAssignments, 3, 'visible non-aware settings refresh immediately on Workspace change');
});
