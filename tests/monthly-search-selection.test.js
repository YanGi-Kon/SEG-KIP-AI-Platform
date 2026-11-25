import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../public/js/kuduk-workflow.js', import.meta.url), 'utf8');

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} is defined`);
  assert.notEqual(end, -1, `${nextName} follows ${name}`);
  return source.slice(start, end);
}

test('monthly search drag updates selected rows without replacing the active result table', () => {
  const selection = functionSource('setMonthlySearchRowSelection', 'applyMonthlySearchDrag');
  const drag = functionSource('applyMonthlySearchDrag', 'endMonthlySearchDrag');
  assert.match(selection, /checkbox\.checked\s*=\s*checked/);
  assert.match(selection, /toggleMonthlyRow\(/);
  assert.doesNotMatch(selection, /renderMonthlySearchResults\(/);
  assert.match(drag, /tr\[data-search-row-index\]/);
  assert.match(source, /document\.addEventListener\('pointermove', applyMonthlySearchDrag/);
});

test('monthly search keyboard selection handles Space and Shift plus vertical arrows', () => {
  const keyboard = functionSource('handleMonthlySearchKeyboard', 'monthlySearchRegionRoutes');
  assert.match(source, /addEventListener\('keydown', handleMonthlySearchKeyboard\)/);
  assert.match(keyboard, /event\.code === 'Space'/);
  assert.match(keyboard, /event\.shiftKey/);
  assert.match(keyboard, /event\.key !== 'ArrowDown' && event\.key !== 'ArrowUp'/);
  assert.match(keyboard, /checked:\!checkbox\.checked/);
  assert.match(keyboard, /focusMonthlySearchCell\(nextIndex, cellPosition\)/);
  assert.match(keyboard, /syncMonthlySearchCheckboxes\(\)/);
  assert.match(source, /event\.target\.closest\('tr\[data-search-row-index\]'\)/);
});

test('monthly search fullscreen button toggles the modal class and fullscreen layout', () => {
  assert.match(source, /id="kudukSearchFullscreen"/);
  assert.match(source, /modal\.classList\.toggle\('kw-search-fullscreen'\)/);
  assert.match(source, /#kudukSearchModal\.kw-search-fullscreen/);
});
