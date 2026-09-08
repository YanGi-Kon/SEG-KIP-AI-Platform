import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const bridge = fs.readFileSync(new URL('../public/js/to-period-sheet-bridge.js', import.meta.url), 'utf8');

test('TO hujjati pastida Saqlash tugmasi yaratiladi', () => {
  assert.match(bridge, /toDocumentSaveBtn/);
  assert.match(bridge, /Сақлаш/);
  assert.match(bridge, /documentContainer\.insertAdjacentElement\('afterend', bar\)/);
});

test('Saqlash yangi davrni yaratadi yoki mavjud davrni Sheets bilan sinxronlaydi', () => {
  assert.match(bridge, /createSelectedPeriod/);
  assert.match(bridge, /sync-to-sheet/);
  assert.match(bridge, /persistPendingEditableField/);
});
