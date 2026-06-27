import express from 'express';
import { listSheets, readSheetRows, validateServiceAccount } from '../services/googleSheetsService.js';

const router = express.Router();

function clean(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[\s._:,;№#()\-\/\\]+/g, '')
    .replace(/ё/g, 'е')
    .replace(/ў/g, 'у')
    .replace(/қ/g, 'к')
    .replace(/ғ/g, 'г')
    .replace(/ҳ/g, 'х');
}

function resolveConfig(input = {}) {
  const spreadsheetUrl = clean(input.spreadsheetUrl || input.spreadsheetId);
  const sheetName = clean(input.sheetName || input.mainSheetName);
  if (!spreadsheetUrl) {
    const error = new Error('Google Sheets ссылкаси киритилмаган');
    error.code = 'SHEET_URL_REQUIRED';
    throw error;
  }
  if (!sheetName) {
    const error = new Error('ASOSIY VAROQ номи киритилмаган');
    error.code = 'SHEET_NAME_REQUIRED';
    throw error;
  }
  return {
    spreadsheetUrl,
    sheetName,
    serviceAccount: validateServiceAccount(input.serviceAccount),
  };
}

function normalizeMenuItems(input = []) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      menuName: clean(item?.menuName || item?.name),
      sheetName: clean(item?.sheetName || item?.sheet),
    }))
    .filter((item) => item.menuName || item.sheetName);
}

function validateMenuItems(menuItems = []) {
  for (const [index, item] of menuItems.entries()) {
    if (!item.menuName || !item.sheetName) {
      const error = new Error(`Menyular ro'yxati ${index + 1}-qatorida Menyu nomi yoki Sheet varoq nomi to'ldirilmagan`);
      error.code = 'MENU_ITEM_INCOMPLETE';
      throw error;
    }
  }
}

const FIELD_ALIASES = {
  pos: ['№', 'n', 'no', 'номер', 'позномер', 'позиция', 'позицияномер', 'poz', 'pos', 'position', 'pozitsiya', 'тартиб'],
  name: ['наименованиеси', 'наименование', 'наименованиеcи', 'асбобноми', 'асбоб', 'прибор', 'си', 'name', 'device', 'devicename', 'nomi'],
  brand: ['типмарка', 'типимарка', 'тип', 'марка', 'бренд', 'brand', 'model', 'type', 'turimarka'],
  serial: ['заводскойномер', 'заводраками', 'заводрақами', 'серия', 'серийныйномер', 'serial', 'serialno', 'serialnumber'],
  range: ['пределизмерения', 'предел', 'диапазон', 'улчовдиапазони', 'олшовдиапазони', 'range', 'measure', 'measurementrange'],
  location: ['местоустановки', 'жой', 'жойлашув', 'урнатилганжой', 'объект', 'худуд', 'location', 'place'],
  work: ['переченьвр', 'перечень', 'иштури', 'работа', 'хизматтури', 'work', 'worktype', 'to2', 'то2'],
};

function findHeaderIndex(rows) {
  const maxScan = Math.min(rows.length, 20);
  for (let index = 0; index < maxScan; index += 1) {
    const normalized = rows[index].map(normalize);
    let score = 0;
    for (const aliases of Object.values(FIELD_ALIASES)) {
      if (normalized.some((cell) => aliases.includes(cell))) score += 1;
    }
    if (score >= 3) return index;
  }
  return -1;
}

function buildHeaderMap(header = []) {
  const normalized = header.map(normalize);
  const map = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const foundIndex = normalized.findIndex((cell) => aliases.includes(cell));
    if (foundIndex >= 0) map[field] = foundIndex;
  }
  return map;
}

function valueAt(row, index) {
  if (index === undefined || index === null || index < 0) return '';
  return clean(row[index]);
}

function fallbackInstrument(row, index) {
  return {
    pos: clean(row[1] || row[0] || index + 1),
    name: clean(row[2] || row[1]),
    brand: clean(row[3] || ''),
    serial: clean(row[4] || ''),
    range: clean(row[5] || ''),
    location: clean(row[6] || ''),
    work: clean(row[8] || row[7] || ''),
  };
}

function mapInstrument(row, index, headerMap) {
  if (!headerMap || Object.keys(headerMap).length === 0) return fallbackInstrument(row, index);
  const mapped = {
    pos: valueAt(row, headerMap.pos) || clean(index + 1),
    name: valueAt(row, headerMap.name),
    brand: valueAt(row, headerMap.brand),
    serial: valueAt(row, headerMap.serial),
    range: valueAt(row, headerMap.range),
    location: valueAt(row, headerMap.location),
    work: valueAt(row, headerMap.work),
  };
  if (!mapped.name && !mapped.serial) return fallbackInstrument(row, index);
  return mapped;
}

function isUsableInstrument(row) {
  return Boolean(row.name || row.serial || row.pos) && !['наименование', 'заводской номер', 'поз номер'].includes(normalize(row.name));
}

function parseInstruments(rows) {
  const headerIndex = findHeaderIndex(rows);
  const headerMap = headerIndex >= 0 ? buildHeaderMap(rows[headerIndex]) : {};
  const startIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
  const instruments = rows
    .slice(startIndex)
    .map((row, index) => mapInstrument(row, startIndex + index, headerMap))
    .filter(isUsableInstrument)
    .map((item, index) => ({
      id: `${item.serial || item.pos || index}-${index}`,
      pos: item.pos || String(index + 1),
      name: item.name || 'Асбоб',
      brand: item.brand || 'Бошқа',
      serial: item.serial || '',
      range: item.range || '',
      location: item.location || '',
      work: item.work || '',
    }));

  const missingColumns = [];
  if (headerIndex >= 0) {
    for (const required of ['pos', 'name', 'serial']) {
      if (headerMap[required] === undefined) missingColumns.push(required);
    }
  }

  return { instruments, headerIndex, headerMap, missingColumns };
}

function summarize(instruments) {
  const brands = [...new Set(instruments.map((item) => item.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const locations = [...new Set(instruments.map((item) => item.location).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    total: instruments.length,
    brands,
    locations,
  };
}

function missingSheets(sheets, names) {
  return names.filter((name) => !sheets.includes(name));
}

router.post('/settings/test', async (req, res) => {
  try {
    const config = resolveConfig(req.body || {});
    const menuItems = normalizeMenuItems(req.body?.menuItems);
    validateMenuItems(menuItems);
    const sheets = await listSheets(config);
    const requiredNames = [config.sheetName, ...menuItems.map((item) => item.sheetName)];
    const missing = missingSheets(sheets, requiredNames);
    if (missing.length) {
      return res.status(400).json({
        ok: false,
        error: `Қуйидаги варақлар топилмади: ${missing.join(', ')}`,
        code: 'SHEET_NAMES_NOT_FOUND',
        missingSheets: missing,
        sheets,
      });
    }
    res.json({ ok: true, sheetExists: true, sheetName: config.sheetName, menuItems, sheets });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message, code: error.code || 'ULCHOV_SETTINGS_TEST_FAILED' });
  }
});

router.post('/instruments', async (req, res) => {
  try {
    const config = resolveConfig(req.body || {});
    const sheets = await listSheets(config);
    if (!sheets.includes(config.sheetName)) {
      return res.status(400).json({
        ok: false,
        error: `ASOSIY VAROQ топилмади: ${config.sheetName}`,
        code: 'SHEET_NAME_NOT_FOUND',
        sheets,
      });
    }
    const rows = await readSheetRows({ ...config, range: 'A:Z' });
    const parsed = parseInstruments(rows);
    if (!parsed.instruments.length) {
      return res.status(400).json({
        ok: false,
        error: 'Танланган варақдан асбоб маълумотлари топилмади',
        code: 'NO_INSTRUMENT_ROWS_FOUND',
        missingColumns: parsed.missingColumns,
      });
    }
    res.json({
      ok: true,
      sheetName: config.sheetName,
      rowsRead: rows.length,
      instruments: parsed.instruments,
      summary: summarize(parsed.instruments),
      missingColumns: parsed.missingColumns,
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message, code: error.code || 'ULCHOV_INSTRUMENTS_FAILED' });
  }
});

export default router;
