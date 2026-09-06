import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildToJournalView, parseToSheetRows } from '../routes/to.js';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('TO source parser АКТ ТО jadvalidagi bo‘lim va qatorlarni saqlaydi', () => {
  const rows = [
    ['Sarlavha'],
    [],
    ['№', 'Зав. №', 'Наименование оборудования', 'Поз.', 'кол-во, шт.', 'Техническое состояние', 'Вид работ', 'Примечание'],
    ['1-участка'],
    ['42', 'C8FV', 'Манометр', '1', '1', 'удов.', 'ТО-2', 'замечаний нет'],
    ['43', 'CE5H', 'Манометр', '2', '2', 'не удов.', 'ТО-1', 'Снять резерв'],
    [],
    ['3-участка 57-раён'],
    ['61', 'CE5O', 'Манометр', '33', '1', 'удов.', 'ТО-2', ''],
    ['Заключение: оборудование исправно и пригодно к эксплуатации'],
    ['999', 'SHOULD-NOT-BE-READ', 'Манометр', '99', '1', 'удов.', 'ТО-2', ''],
  ];

  const parsed = parseToSheetRows(rows);

  assert.equal(parsed.headerRowNumber, 3);
  assert.equal(parsed.totalItems, 3);
  assert.deepEqual(parsed.sections.map((section) => section.name), ['1-участка', '3-участка 57-раён']);
  assert.deepEqual(parsed.sections[0].items[0], {
    sourceRowNumber: 5,
    no: '42',
    serialNo: 'C8FV',
    equipmentName: 'Манометр',
    positionNo: '1',
    quantity: '1',
    technicalState: 'удов.',
    workType: 'ТО-2',
    note: 'замечаний нет',
  });
  assert.equal(parsed.sections[0].items[1].technicalState, 'не удов.');
  assert.equal(parsed.sections[1].items[0].serialNo, 'CE5O');
});

test('TO JURNALI target ustunlari source ustunlari bilan aralashtirilmaydi', () => {
  const parsed = {
    headerRowNumber: 24,
    totalItems: 1,
    sections: [{
      name: '1-участка',
      items: [{
        sourceRowNumber: 25,
        no: '1',
        serialNo: 'C8FV',
        equipmentName: 'Манометр',
        positionNo: '12',
        quantity: '2',
        technicalState: 'удов.',
        workType: 'ТО-2',
        note: 'замечаний нет',
      }],
    }],
  };

  const view = buildToJournalView(parsed);
  const item = view.sections[0].items[0];

  assert.equal(item.equipmentName, 'Манометр');
  assert.equal(item.serialNo, 'C8FV');
  assert.equal(item.workType, 'ТО-2');
  assert.equal(item.note, 'замечаний нет');
  assert.equal(item.positionNo, undefined);
  assert.equal(item.quantity, undefined);
  assert.equal(item.technicalState, undefined);
  assert.deepEqual(item.sourceMeta, {
    positionNo: '12',
    quantity: '2',
    technicalState: 'удов.',
  });
});

test('TO frontend Workspace ASOSIY VAROQ sozlamasini alohida modul kalitida saqlaydi', () => {
  const html = read('../public/modules/to.html');

  assert.match(html, /id="toSettingsBtn"/);
  assert.match(html, /id="toSettingsModal"/);
  assert.match(html, /id="toSheetName"/);
  assert.match(html, /id="toWorkspaceName"/);
  assert.match(html, /to_sheet_name/);
  assert.match(html, /\/api\/to\/settings\/test/);
  assert.match(html, /\/api\/to\/source/);
  assert.match(html, /SAVE_MODULE_SETTINGS/);
  assert.match(html, /REQUEST_WORKSPACE_INFO/);
  assert.match(html, /ToJournalWorkspace/);
  assert.doesNotMatch(html, /moduleSettings\?\.acts_sheet_name/);
  assert.doesNotMatch(html, /\/api\/acts\/reports\/daily/);

  assert.match(html, /Наименование и тип \(марка\) прибора/);
  assert.match(html, /Заводской номер/);
  assert.match(html, /Предел измерения/);
  assert.match(html, /Наименование технического обслуживания/);
  assert.match(html, /Дата проведения ТО/);
  assert.match(html, /Подпись лица, проводившего ТО/);
  assert.match(html, /Примечание/);
});

test('TO API exact bo‘lmagan ko‘rinadigan sheet nomini xavfsiz hal qilish uchun maxsus route ishlatadi', () => {
  const source = read('../routes/to.js');
  assert.match(source, /resolveExistingSheetName/);
  assert.match(source, /sheets\.includes\(raw\)/);
  assert.match(source, /String\(name\)\.trim\(\) === wanted/);
  assert.match(source, /router\.post\('\/settings\/test'/);
  assert.match(source, /router\.post\('\/source'/);
  assert.match(source, /buildToJournalView/);
});
