import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/modules/faults.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

test('faults module renders the seven-column reglament journal frontend', () => {
  assert.match(html, /НОСОЗЛИКЛАР ЖУРНАЛИ/);
  assert.match(html, /Nosozliklarni qayd etish reglament jurnali/);
  assert.match(html, /id="faultsStatus"/);
  assert.match(html, /id="faultsWorkspaceName"/);
  assert.match(html, /id="faultsBack"/);
  assert.match(html, /<table class="journal-table">/);
  assert.match(html, /id="faultsRows"/);
  assert.match(html, /№ п\/п<span>T\/r<\/span>/);
  assert.doesNotMatch(html, /Dalolatnoma №/);
  assert.match(html, /Дата, время возникновения неисправности/);
  assert.match(html, /Наименование оборудования/);
  assert.match(html, /Краткое описание неисправности/);
  assert.match(html, /Принятые меры по ликвидации неисправности/);
  assert.match(html, /Дата устранения неисправности/);
  assert.match(html, /Подпись ответств\. за устранение неисправности\./);
  assert.match(html, /type="datetime-local"/);
  assert.match(html, /type="date"/);
  assert.match(html, /Faqat frontend/);
});

test('faults frontend links the first column to Acts reports without local journal persistence', () => {
  assert.ok(scriptMatch, 'inline frontend script must exist');
  assert.doesNotThrow(() => new Function(scriptMatch[1]));
  assert.match(scriptMatch[1], /const GRID_ROWS=22/);
  assert.match(scriptMatch[1], /function createBlankRows/);
  assert.match(scriptMatch[1], /function loadActReportNumbers/);
  assert.match(scriptMatch[1], /\/api\/acts\/reports\/daily/);
  assert.match(scriptMatch[1], /report\?\.actNo/);
  assert.match(scriptMatch[1], /report\?\.date/);
  assert.match(scriptMatch[1], /function toDateInputValue/);
  assert.match(scriptMatch[1], /function equipmentDisplayValue/);
  assert.match(scriptMatch[1], /report\?\.a4Json/);
  assert.match(scriptMatch[1], /parsedPosition=workPlace\.match/);
  assert.match(scriptMatch[1], /act-number-control/);
  assert.match(scriptMatch[1], /linked-control/);
  assert.match(scriptMatch[1], /readonly/);
  assert.doesNotMatch(scriptMatch[1], /class="row-number"/);
  assert.match(scriptMatch[1], /function loadWorkspace/);
  assert.match(scriptMatch[1], /REQUEST_WORKSPACE_INFO/);
  assert.doesNotMatch(scriptMatch[1], /ROWS_KEY|CONFIG_KEY|openModal|saveForm|removeRow|SAVE_MODULE_SETTINGS|localStorage\.setItem/);
});

test('faults frontend inserts all 22 editable rows when the page loads', () => {
  const rowsBody = {
    children: [],
    appendChild(fragment) { this.children.push(...fragment.children); },
  };
  const elements = new Map([
    ['faultsRows', rowsBody],
    ['faultsWorkspaceName', { textContent: '' }],
    ['faultsBack', { addEventListener() {} }],
  ]);
  const handlers = {};
  const parent = { localStorage: { getItem: () => null }, postMessage() {} };
  const window = {
    parent,
    addEventListener(type, handler) { handlers[type] = handler; },
  };
  const document = {
    getElementById: (id) => elements.get(id) || null,
    createElement: () => ({ dataset: {}, innerHTML: '' }),
    createDocumentFragment: () => ({
      children: [],
      appendChild(child) { this.children.push(child); },
    }),
  };

  vm.runInNewContext(scriptMatch[1], {
    document,
    localStorage: { getItem: () => null },
    parent,
    window,
  });
  handlers.DOMContentLoaded();

  assert.equal(rowsBody.children.length, 22);
  assert.equal(rowsBody.children[0].dataset.row, '1');
  assert.equal(rowsBody.children[21].dataset.row, '22');
  assert.match(rowsBody.children[0].innerHTML, /value="" readonly/);
  assert.doesNotMatch(rowsBody.children[0].innerHTML, /class="row-number">1/);
  assert.match(rowsBody.children[0].innerHTML, /type="date" value="" readonly/);
  assert.match(rowsBody.children[0].innerHTML, /textarea/);
});

test('faults frontend puts linked Acts report fields into their journal columns', async () => {
  const rowsBody = {
    _innerHTML: '',
    children: [],
    set innerHTML(value) { this._innerHTML = value; this.children = []; },
    get innerHTML() { return this._innerHTML; },
    appendChild(fragment) { this.children.push(...fragment.children); },
  };
  const elements = new Map([
    ['faultsRows', rowsBody],
    ['faultsStatus', { textContent: '' }],
    ['faultsStatusSub', { textContent: '' }],
    ['faultsWorkspaceName', { textContent: '' }],
  ]);
  const handlers = {};
  const parent = { localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null }, postMessage() {} };
  const window = { parent, addEventListener(type, handler) { handlers[type] = handler; } };
  const document = {
    getElementById: (id) => elements.get(id) || null,
    createElement: () => ({ dataset: {}, innerHTML: '' }),
    createDocumentFragment: () => ({ children: [], appendChild(child) { this.children.push(child); } }),
  };
  const requests = [];

  vm.runInNewContext(scriptMatch[1], {
    document,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          rows: [{
            actNo: '444',
            date: '14.07.2026',
            device: 'Манометр',
            place: 'Аввал',
            reasonText: 'Сервер ушлаш маълумотларини бермасдан кўп вақт олди',
            actionText: 'Резерв ускунани алмаштириб, хавфсизлик тозалашни ўтказиш',
            actionDate: '02.09.2026',
            actionTime: '15:40',
            a4Json: JSON.stringify({
              workPlace: 'Маг. указ. уров ТЕМПУ, завод рақами 2861-4-4, Ўлчаш чегараси 0-1200 мм, Цен. Аввал УПЛШ, поз. №23',
              reasonText: 'Сервер ушлаш маълумотларини бермасдан кўп вақт олди',
              actionText: 'Резерв ускунани алмаштириб, хавфсизлик тозалашни ўтказиш',
              actionDate: '02.09.2026',
              actionTime: '15:40',
              place: 'Аввал УПЛШ',
            }),
          }],
        }),
      };
    },
    localStorage: { getItem: () => null },
    sessionStorage: { getItem: () => null },
    parent,
    window,
  });

  handlers.message({
    data: {
      type: 'SEG_KIP_WORKSPACE_CHANGE',
      workspaceId: 'workspace-a',
      workspace: { id: 'workspace-a', name: 'Sex A', moduleSettings: { acts_sheet_name: 'ASOSIY' } },
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/acts/reports/daily');
  assert.equal(requests[0].options.headers['x-workspace-id'], 'workspace-a');
  assert.deepEqual(JSON.parse(requests[0].options.body), { sheetName: 'ASOSIY' });
  assert.equal(rowsBody.children.length, 22);
  assert.match(rowsBody.children[0].innerHTML, /value="444" readonly/);
  assert.match(rowsBody.children[0].innerHTML, /type="date" value="2026-07-14" readonly/);
  assert.match(rowsBody.children[0].innerHTML, /class="cell-control linked-control equipment-display".*rows="3".*readonly/);
  assert.match(rowsBody.children[0].innerHTML, /class="cell-control linked-control failure-description".*rows="3".*readonly/);
  assert.match(rowsBody.children[0].innerHTML, /Завод рақами: 2861-4-4/);
  assert.match(rowsBody.children[0].innerHTML, /Ўлчаш чегараси: 0-1200 мм/);
  assert.match(rowsBody.children[0].innerHTML, /Рад этиш сабаби: Сервер ушлаш маълумотларини бермасдан кўп вақт олди/);
  assert.match(rowsBody.children[0].innerHTML, /Резерв ускунани алмаштириб, хавфсизлик тозалашни ўтказиш/);
  assert.match(rowsBody.children[0].innerHTML, /type="datetime-local" value="2026-09-02T15:40"/);
  assert.doesNotMatch(rowsBody.children[0].innerHTML, />1<\/td>/);
  assert.match(elements.get('faultsStatus').textContent, /BOG.*LANGAN/);
  assert.equal(elements.get('faultsStatusSub').textContent, '1 ta dalolatnoma raqami yuklandi');
});

test('faults table keeps the source document column proportions', () => {
  for (const width of ['6.17%', '10.70%', '9.56%', '31.26%', '21.52%', '9.38%', '11.41%']) {
    assert.match(html, new RegExp(`width:${width.replace('.', '\\.')}`));
  }
});
