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

test('monthly analysis grid supports row-cell drag and Shift arrow add/remove ranges', () => {
  const select = functionSource('setMonthlyRowSelection', 'syncMonthlyRowSelection');
  const keyboard = functionSource('handleMonthlyGridKeyboard', 'applyMonthlyGridDrag');
  const drag = functionSource('applyMonthlyGridDrag', 'endMonthlyGridDrag');
  assert.match(source, /rows\?\.addEventListener\('pointerdown'/);
  assert.match(source, /rows\?\.addEventListener\('keydown', handleMonthlyGridKeyboard\)/);
  assert.match(source, /setPointerCapture\(event\.pointerId\)/);
  assert.match(select, /selectedKeys\.add\(key\)/);
  assert.doesNotMatch(select, /renderMonthlyAnalysis\(/);
  assert.match(keyboard, /checked:!checkbox\.checked/);
  assert.match(keyboard, /focusMonthlyGridCell\(nextIndex,cellPosition\)/);
  assert.match(drag, /elementFromPoint/);
  assert.match(source, /data-monthly-row-index/);
});

test('monthly search prevents selecting a region twice and marks chosen regions in the list', () => {
  const populate = functionSource('populateMonthlySearchRegions', 'updateMonthlySearchField');
  const regionState = functionSource('monthlySearchRegionState', 'updateMonthlySearchField');
  const selectRegion = functionSource('selectMonthlySearchRegion', 'monthlySearchIndexesForQueries');
  assert.match(populate, /monthlySearchRegionState\(route\)/);
  assert.match(populate, /disabled/);
  assert.match(populate, /kw-region-already-selected/);
  assert.match(regionState, /monthlyState\.selectedKeys\.has\(monthlyRowKey\(row,index\)\)/);
  assert.match(regionState, /selectable\.every/);
  assert.match(regionState, /alreadyReported/);
  assert.match(selectRegion, /alreadySelected/);
  assert.match(selectRegion, /searchQueries\.push/);
  assert.doesNotMatch(selectRegion, /searchQueries\s*=\s*\[/);
  assert.match(source, /populateMonthlySearchRegions\(\);\s*monthlyState\.searchHasRun = false/);
  const openSearch = functionSource('openMonthlySearch', 'closeMonthlySearch');
  assert.match(openSearch, /populateMonthlySearchRegions\(\)/);
  const rowSelection = functionSource('setMonthlyRowSelection', 'syncMonthlyRowSelection');
  assert.match(rowSelection, /kudukSearchModal.*classList\.contains\('show'\).*populateMonthlySearchRegions/);
});

test('applying selected monthly search rows opens the document date prompt', () => {
  const applySelection = functionSource('applyMonthlySearchSelection', 'clearMonthlySearch');
  assert.match(source, /kudukSearchDone.*addEventListener\('click', applyMonthlySearchSelection\)/);
  assert.match(applySelection, /selectedMonthlyRows\(\)\.length/);
  assert.match(applySelection, /closeMonthlySearch\(\);\s*openDocumentDateDialog\(\)/);
  assert.match(applySelection, /setMonthlySearchStatus\(/);
});
