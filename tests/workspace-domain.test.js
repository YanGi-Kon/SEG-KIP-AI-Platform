import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourceKeyV2,
  extractDriveFolderId,
  extractSpreadsheetId,
  normalizeWorkspaceInput,
  slugifyWorkspaceName,
  validateWorkspaceRole,
} from '../domain/workspace.js';

test('extractSpreadsheetId supports URL and raw ID', () => {
  const id = '191RWU_J2IxqfwdwCbvopVtcb4WhRkPM1UQppVbgiLhs';
  assert.equal(extractSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit`), id);
  assert.equal(extractSpreadsheetId(id), id);
  assert.throws(() => extractSpreadsheetId('not-a-sheet'), /Invalid Google Sheets/);
});

test('extractDriveFolderId supports folder URL and empty value', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz';
  assert.equal(extractDriveFolderId(`https://drive.google.com/drive/folders/${id}`), id);
  assert.equal(extractDriveFolderId(''), '');
});

test('slugifyWorkspaceName is deterministic and bounded', () => {
  assert.equal(slugifyWorkspaceName('Andijon KIP 01'), 'andijon-kip-01');
  assert.throws(() => slugifyWorkspaceName('Андижон'), /Latin letters or numbers/);
});

test('validateWorkspaceRole rejects unknown roles', () => {
  assert.equal(validateWorkspaceRole('Engineer'), 'engineer');
  assert.throws(() => validateWorkspaceRole('root'), /Invalid workspace role/);
});

test('buildSourceKeyV2 uses normalized source fields', () => {
  const key = buildSourceKeyV2({
    sourceSheet: ' База ',
    sourceRowNumber: 5,
    positionNo: 1,
    serialNo: ' А0269788 ',
  });
  assert.equal(key, 'База::5::1::А0269788');
});

test('buildSourceKeyV2 falls back to device identity', () => {
  const key = buildSourceKeyV2({
    sourceSheet: 'База',
    sourceRowNumber: 6,
    positionNo: 2,
    deviceName: 'Манометр',
    measureRange: '0-6 МПа',
    place: 'Аввал',
  });
  assert.equal(key, 'База::6::2::Манометр|0-6 МПа|Аввал');
});

test('normalizeWorkspaceInput canonicalizes Google references', () => {
  const sheetId = '191RWU_J2IxqfwdwCbvopVtcb4WhRkPM1UQppVbgiLhs';
  const folderId = '1AbCdEfGhIjKlMnOpQrStUvWxYz';
  const workspace = normalizeWorkspaceInput({
    name: 'Andijon KIP',
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    mainSheetName: 'База',
    driveFolderUrl: `https://drive.google.com/drive/folders/${folderId}`,
  });
  assert.equal(workspace.slug, 'andijon-kip');
  assert.equal(workspace.spreadsheetId, sheetId);
  assert.equal(workspace.driveFolderId, folderId);
  assert.equal(workspace.timeZone, 'Asia/Tashkent');
});
