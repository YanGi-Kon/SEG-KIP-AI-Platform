import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data", "tenants");
fs.mkdirSync(DATA_DIR, { recursive: true });

const TENANTS = new Map();
const TIMERS = new Map();
let IO = null;

const ALIASES = {
  date: ["дата", "date", "сана"],
  // Google Sheets'dagi real sarlavhalar turlicha yozilishi mumkin:
  // "Поз номер", "Поз. номер", "Позиция №", "№" va h.k.
  pos: ["поз номер", "поз. номер", "позномер", "поз", "позиция", "позиция №", "позиционный номер", "№", "no", "n", "pos", "position", "poz"],
  name: ["наименование си", "наименование средства измерения", "наименование", "си", "қурилма", "qurilma", "name", "номи"],
  brand: ["тип, марка", "тип марка", "тип", "марка", "brand", "бренд"],
  serial: ["заводской номер", "завод номер", "заводской", "завод", "завод рақами", "serial", "серийн", "серийный номер"],
  range: ["предел измерения", "предел", "диапазон", "range", "шкала"],
  location: ["место установки", "место", "location", "ҳудуд", "худуд", "объект", "жой"],
  skv: ["скв", "скважина", "skv", "қудуқ", "кудук", "quduq"],
  work: ["перечень в/р", "перечень вр", "перечень", "вид работ", "work", "иш"],
  executor: ["исполнитель работ: должность", "исполнитель", "должность", "executor", "бажарувчи"],
  signature: ["подпись", "имзо", "signature"]
};

// Oldingi variantda majburiy ustunlar juda qattiq tekshirilgani uchun ayrim varoqlar umuman yuklanmay qolgan.
// Endi data-varoq deb tanish uchun kamida 2 ta asosiy ustun topilishi kifoya.
const DATA_REQUIRED_MIN_SCORE = 2;
const FIELD_ORDER = ["date", "pos", "name", "brand", "serial", "range", "location", "skv", "work", "executor", "signature"];
const BASE_SHEET_CANDIDATES = ["База", "ОБШИЕ", "Общие", "OBSHIE", "Baza"];

// Frontend menyusi faqat ushbu aniq blokdan quriladi.
// Google Sheets tablarini avtomatik skanerlash taqiqlangan.
const MENU_RANGE_A1 = "C9:Q49";
const MENU_START_ROW_INDEX = 8; // C9 -> 0-based row index
const MENU_START_COL_INDEX = 2; // C -> 0-based col index
const SYSTEM_SHEETS = new Set([
  "меню", "кудук руйхати", "база", "общие", "манометр", "формуляр", "телемеханика", "улчов воситалари", "ўлчов воситалари"
].map(norm));

function safeSexId(value) {
  const raw = String(value || "").trim().toLowerCase();
  const safe = raw.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
  return safe || "sex_default";
}
function tenantFile(sexId) { return path.join(DATA_DIR, `${safeSexId(sexId)}.json`); }
function norm(s) { return String(s || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/ё/g, "е").trim().toLowerCase(); }
function hardNorm(s) { return norm(s).replace(/[\s\-_.,:;()"'`«»№#]+/g, ""); }
function sha(obj) { return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex"); }
function safeSheetTitle(title) { return String(title || "").replace(/'/g, "''"); }
function extractSpreadsheetId(url) {
  const m = String(url || "").match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(String(url || "").trim())) return String(url).trim();
  return "";
}
function colName(i) { let n = i + 1, s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
function a1(row, col) { return `${colName(col)}${row + 1}`; }
function rangeA1(sheet, row, col) { return `'${safeSheetTitle(sheet)}'!${a1(row, col)}`; }
function sheetRange(sheet, startRow, startCol, endRow, endCol) { return `'${safeSheetTitle(sheet)}'!${a1(startRow, startCol)}:${a1(endRow, endCol)}`; }
function rowToCells(row) { return row?.values || []; }
function cellText(cell) {
  if (!cell) return "";
  if (cell.formattedValue != null) return String(cell.formattedValue);
  const ev = cell.effectiveValue || cell.userEnteredValue || {};
  if (ev.stringValue != null) return String(ev.stringValue);
  if (ev.numberValue != null) return String(ev.numberValue);
  if (ev.boolValue != null) return String(ev.boolValue);
  // Formula matni oddiy jurnal qiymati sifatida frontendga chiqmasligi shart.
  // formulaValue faqat extractHyperlinkFormulaParts() ichida HYPERLINK parser uchun ishlatiladi.
  return "";
}
function cellFormula(cell) { return String(cell?.userEnteredValue?.formulaValue || ""); }
function extractHyperlinkFormulaParts(cell) {
  const formula = cellFormula(cell);
  // Google Sheets inglizcha HYPERLINK va rus lokalidagi ГИПЕРССЫЛКА formulalarini qo‘llab-quvvatlaydi.
  const m = formula.match(/(?:HYPERLINK|ГИПЕРССЫЛКА)\s*\(\s*["']([^"']+)["']\s*[,;]\s*["']([^"']+)["']\s*\)/i);
  return m ? { link: m[1], label: m[2] } : null;
}
function extractHyperlinkLabel(cell) {
  const parts = extractHyperlinkFormulaParts(cell);
  return parts ? parts.label : cellText(cell);
}
function extractLinksFromCell(cell) {
  const links = [];
  if (!cell) return links;
  if (cell.hyperlink) links.push(String(cell.hyperlink));
  for (const run of cell.textFormatRuns || []) if (run?.format?.link?.uri) links.push(String(run.format.link.uri));
  const parts = extractHyperlinkFormulaParts(cell);
  if (parts?.link) links.push(parts.link);
  return [...new Set(links)];
}
function gidFromLink(link) { const m = String(link || "").match(/[#&?]gid=(\d+)/i); return m ? Number(m[1]) : null; }
function sheetNameFromHashLink(link) { const m = String(link || "").match(/#'?([^'!#]+)'?!/); return m ? decodeURIComponent(m[1]) : ""; }
function findIndex(headers, key) {
  const names = (ALIASES[key] || []).map(hardNorm);
  let best = { index: -1, score: 0 };
  for (let i = 0; i < headers.length; i++) {
    const h = hardNorm(headers[i]);
    if (!h) continue;
    for (const n of names) {
      if (!n) continue;
      let score = 0;
      if (h === n) score = 100;
      else if (h.startsWith(n) || n.startsWith(h)) score = 80;
      else if (h.includes(n) || n.includes(h)) score = 60;
      if (score > best.score) best = { index: i, score };
    }
  }
  return best.index;
}
function findHeaderRow(matrix) {
  let best = { row: -1, score: 0, idx: {}, headers: [] };
  for (let r = 0; r < Math.min(matrix.length, 60); r++) {
    const idx = {};
    let score = 0;
    const row = matrix[r] || [];
    for (const key of FIELD_ORDER) {
      idx[key] = findIndex(row, key);
      if (idx[key] >= 0) score++;
    }
    // Neft jurnali headerlari odatda: Дата, Поз номер, Наименование СИ, Тип/марка, Заводской номер...
    if (idx.name >= 0) score += 2;
    if (idx.serial >= 0) score += 2;
    if (idx.pos >= 0) score += 1;
    if (score > best.score) best = { row: r, score, idx, headers: row };
  }
  return best;
}
function isDataHeader(header) {
  return header && header.row >= 0 && header.score >= DATA_REQUIRED_MIN_SCORE && (header.idx.name >= 0 || header.idx.serial >= 0 || header.idx.pos >= 0);
}
function valuesMatrixFromGrid(sheet) {
  const rowData = sheet.data?.[0]?.rowData || [];
  return rowData.map(row => rowToCells(row).map(cell => extractHyperlinkFormulaParts(cell) ? extractHyperlinkLabel(cell) : cellText(cell)));
}
function buildSheetMaps(metadata) {
  const byId = new Map(), hardTitle = new Map();
  for (const sh of metadata.sheets || []) { byId.set(Number(sh.properties.sheetId), sh.properties.title); hardTitle.set(hardNorm(sh.properties.title), sh.properties.title); }
  return { byId, hardTitle };
}
function findBaseSheet(maps) {
  for (const name of BASE_SHEET_CANDIDATES) {
    const m = matchSheetByText(name, maps);
    if (m) return m;
  }
  return "";
}
function isJournalTitle(title) {
  const t = hardNorm(title);
  return t === "журнал" || t === "общийжурнал" || t === "журналучетаприборов";
}
function matchSheetByText(text, maps) {
  const t = hardNorm(text);
  if (!t) return "";
  if (maps.hardTitle.has(t)) return maps.hardTitle.get(t);
  for (const [k, title] of maps.hardTitle.entries()) if (k && (t === k || t.includes(k) || k.includes(t))) return title;
  return "";
}
function sanitizeService(service) {
  if (!service || typeof service !== "object") throw new Error("Service Account JSON noto‘g‘ri.");
  if (!service.client_email || !service.private_key) throw new Error("Service Account JSON ichida client_email yoki private_key topilmadi.");
  return { client_email: service.client_email, private_key: service.private_key, project_id: service.project_id || "" };
}
async function makeSheets(service) {
  const auth = new google.auth.JWT({
    email: service.client_email,
    key: service.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}
function publicState(t) {
  return {
    sexId: t.sexId,
    connected: Boolean(t.connected),
    status: t.connected ? "READY" : "OFFLINE",
    spreadsheetId: t.spreadsheetId || "",
    spreadsheetUrl: t.spreadsheetUrl || "",
    menuSheet: t.menuSheet || "кудук руйхати",
    syncSeconds: t.syncSeconds || 30,
    routes: t.routes || [],
    sheets: t.sheets || {},
    statuses: t.statuses || {},
    logs: (t.logs || []).slice(-60),
    updatedAt: t.updatedAt || null,
    version: t.version || 0
  };
}
function log(t, level, message, meta = {}) {
  const item = { level, message, meta, ts: new Date().toISOString() };
  t.logs = [...(t.logs || []), item].slice(-150);
  console.log(`[KUDUK ${t.sexId} ${level.toUpperCase()}] ${message}`);
  IO?.to(`sex:${t.sexId}`).emit("kuduk-log", item);
}
function saveTenant(t) {
  const payload = {
    sexId: t.sexId,
    spreadsheetUrl: t.spreadsheetUrl,
    spreadsheetId: t.spreadsheetId,
    menuSheet: t.menuSheet,
    syncSeconds: t.syncSeconds,
    service: t.service
  };
  fs.writeFileSync(tenantFile(t.sexId), JSON.stringify(payload, null, 2));
}
async function loadTenant(sexId) {
  sexId = safeSexId(sexId);
  if (TENANTS.has(sexId)) return TENANTS.get(sexId);
  const t = { sexId, connected: false, routes: [], sheets: {}, statuses: {}, hashes: {}, logs: [], version: 0 };
  TENANTS.set(sexId, t);
  if (fs.existsSync(tenantFile(sexId))) {
    const cfg = JSON.parse(fs.readFileSync(tenantFile(sexId), "utf8"));
    await applyConfig(sexId, cfg, false);
  }
  return TENANTS.get(sexId);
}
async function getGrid(t, sheetName) {
  const res = await t.sheetsApi.spreadsheets.get({
    spreadsheetId: t.spreadsheetId,
    includeGridData: true,
    ranges: [`'${safeSheetTitle(sheetName)}'`],
    fields: "sheets.properties(sheetId,title),sheets.data.rowData.values(formattedValue,userEnteredValue,effectiveValue,hyperlink,textFormatRuns,dataValidation)"
  });
  const sh = res.data.sheets?.[0];
  if (!sh) throw new Error(`"${sheetName}" varog‘i topilmadi.`);
  return sh;
}
async function getGridRange(t, sheetName, range) {
  const res = await t.sheetsApi.spreadsheets.get({
    spreadsheetId: t.spreadsheetId,
    includeGridData: true,
    ranges: [`'${safeSheetTitle(sheetName)}'!${range}`],
    fields: "sheets.properties(sheetId,title),sheets.data.rowData.values(formattedValue,userEnteredValue,effectiveValue,hyperlink,textFormatRuns,dataValidation)"
  });
  const sh = res.data.sheets?.[0];
  if (!sh) throw new Error(`"${sheetName}" varog‘i topilmadi.`);
  return sh;
}
async function metadata(t) {
  const res = await t.sheetsApi.spreadsheets.get({ spreadsheetId: t.spreadsheetId, includeGridData: false, fields: "sheets.properties(sheetId,title,index)" });
  return res.data;
}
async function extractRoutes(t) {
  const meta = await metadata(t);
  const maps = buildSheetMaps(meta);
  const menu = await getGridRange(t, t.menuSheet, MENU_RANGE_A1);
  const rows = menu.data?.[0]?.rowData || [];
  const routes = [], seen = new Set();

  for (let r = 0; r < rows.length; r++) {
    const cells = rowToCells(rows[r]);
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const label = extractHyperlinkLabel(cell).trim();
      const plain = cellText(cell).trim();
      const title = label || plain;
      if (!title && !cellFormula(cell)) continue;

      let sheet = "", source = "", linkUsed = "", targetGid = null;
      for (const link of extractLinksFromCell(cell)) {
        const gid = gidFromLink(link);
        if (gid != null && maps.byId.has(gid)) { sheet = maps.byId.get(gid); source = "range-hyperlink-gid"; linkUsed = link; targetGid = gid; break; }
        const h = sheetNameFromHashLink(link);
        if (h) { const m = matchSheetByText(h, maps); if (m) { sheet = m; source = "range-hyperlink-sheet"; linkUsed = link; break; } }
      }
      // "ЖУРНАЛ" tugmasi oddiy hudud emas: u doimo Single Source of Truth bo‘lgan База varog‘ini ochadi.
      // Agar katakdagi hyperlink boshqa joyga ishora qilsa ham, umumiy jurnal uchun База ustuvor.
      if (isJournalTitle(title)) {
        const baseSheet = findBaseSheet(maps);
        if (baseSheet) {
          sheet = baseSheet;
          source = "journal-master-base";
        }
      }
      if (!sheet) { sheet = matchSheetByText(title, maps); if (sheet) source = "range-cell-text-match"; }

      const absoluteRow = MENU_START_ROW_INDEX + r;
      const absoluteCol = MENU_START_COL_INDEX + c;
      if (!sheet) {
        log(t, "error", `Menu katak target varoq bilan moslashmadi: ${a1(absoluteRow, absoluteCol)} = ${title}`);
        continue;
      }
      const isJournal = isJournalTitle(title);
      if (!isJournal && (SYSTEM_SHEETS.has(norm(sheet)) || SYSTEM_SHEETS.has(norm(title)))) continue;
      const routeKey = isJournal ? `__journal__${sheet}` : sheet;
      if (seen.has(routeKey)) continue;
      seen.add(routeKey);

      routes.push({
        title,
        gid: targetGid != null ? String(targetGid) : "",
        targetSheet: sheet,
        sheet,
        cell: a1(absoluteRow, absoluteCol),
        sourceCell: a1(absoluteRow, absoluteCol),
        range: `'${safeSheetTitle(sheet)}'!A:Q`,
        source,
        link: linkUsed,
        row: absoluteRow + 1,
        col: absoluteCol + 1,
        a1: a1(absoluteRow, absoluteCol),
        kind: isJournal ? "master-journal" : "area",
        isMasterJournal: isJournal,
        count: 0,
        status: "pending"
      });
    }
  }
  return routes;
}

async function discoverDataRoutes(t, existingRoutes = []) {
  const meta = await metadata(t);
  const seen = new Set(existingRoutes.map(r => r.sheet));
  const routes = [...existingRoutes];
  for (const sh of meta.sheets || []) {
    const title = sh.properties.title;
    if (!title || norm(title) === norm(t.menuSheet) || seen.has(title)) continue;
    try {
      const grid = await getGrid(t, title);
      const matrix = valuesMatrixFromGrid(grid);
      const header = findHeaderRow(matrix);
      if (isDataHeader(header)) {
        seen.add(title);
        routes.push({ title, sheet: title, source: "auto-data-header", link: "", row: header.row + 1, col: 1, a1: `HEADER:${header.row + 1}`, count: 0, status: "pending" });
      }
    } catch (_) {}
  }
  return routes;
}
function normalizeDataSheet(sheetName, matrix) {
  const header = findHeaderRow(matrix);
  if (!isDataHeader(header)) {
    throw new Error(`Data schema topilmadi: "${sheetName}" varog‘ida jurnal sarlavhalari (masalan: Поз номер, Наименование СИ, Заводской номер) aniqlanmadi.`);
  }
  const rows = [];
  for (let i = header.row + 1; i < matrix.length; i++) {
    const r = matrix[i] || [];
    if (!r.some(v => String(v || "").trim())) continue;
    const item = { _rowNumber: i + 1 };
    for (const f of FIELD_ORDER) item[f] = header.idx[f] >= 0 ? (r[header.idx[f]] ?? "") : "";
    // Muhim: pozitsiya raqamini sun'iy almashtirmaymiz. Agar B ustunda qiymat bo'lsa aynan o'sha chiqadi.
    // Faqat pozitsiya ustuni umuman topilmagan eski varoqlarda vaqtinchalik tartib raqami beriladi.
    if (!item.pos && header.idx.pos < 0) item.pos = String(rows.length + 1);
    if (!item.location) item.location = sheetName;
    rows.push(item);
  }
  return { header, rows };
}
async function loadSheet(t, route) {
  try {
    const grid = await getGrid(t, route.sheet);
    const matrix = valuesMatrixFromGrid(grid);
    const parsed = normalizeDataSheet(route.sheet, matrix);
    const hash = sha(parsed.rows);
    const changed = hash !== t.hashes[route.sheet];
    if (changed) { t.sheets[route.sheet] = parsed.rows; t.hashes[route.sheet] = hash; }
    t.statuses[route.sheet] = { status: parsed.rows.length ? "ok" : "empty", message: "OK", updatedAt: new Date().toISOString(), headerRow: parsed.header.row + 1, indexMap: parsed.header.idx, headers: parsed.header.headers };
    return { changed, rows: parsed.rows };
  } catch (e) {
    if (!Array.isArray(t.sheets[route.sheet])) t.sheets[route.sheet] = [];
    t.statuses[route.sheet] = { status: "error", message: e.message, updatedAt: new Date().toISOString() };
    log(t, "error", e.message, { sheet: route.sheet });
    return { changed: false, rows: t.sheets[route.sheet] };
  }
}
async function syncTenant(sexId, reason = "manual") {
  const t = await loadTenant(sexId);
  if (!t.sheetsApi) throw new Error("Backend konfiguratsiya qilinmagan.");
  if (t.syncRunning) return publicState(t);
  t.syncRunning = true;
  try {
    // Faqat qat'iy belgilangan menyu diapazoni o'qiladi: 'кудук руйхати'!C9:Q49.
    // Barcha sheet tablarini avtomatik skanerlash qasddan o'chirilgan.
    const routes = await extractRoutes(t).catch(e => { log(t, "error", "Route map o'qishda xato: " + e.message); return []; });
    const routeHash = sha(routes.map(r => ({ title: r.title, sheet: r.sheet, a1: r.a1, source: r.source })));
    const routesChanged = routeHash !== t.hashes.__routes;
    if (routesChanged) { t.routes = routes; t.hashes.__routes = routeHash; }
    await Promise.all(routes.map(r => loadSheet(t, r)));
    for (const r of t.routes) { r.count = Array.isArray(t.sheets[r.sheet]) ? t.sheets[r.sheet].length : 0; r.status = t.statuses[r.sheet]?.status || "pending"; r.message = t.statuses[r.sheet]?.message || ""; }
    t.connected = true;
    t.updatedAt = new Date().toISOString();
    t.version += 1;
    log(t, "ok", `Sync bajarildi (${reason}). Status: READY`);
    IO?.to(`sex:${t.sexId}`).emit("kuduk-data-update", publicState(t));
    return publicState(t);
  } finally { t.syncRunning = false; }
}
async function applyConfig(sexId, input, persist = true) {
  sexId = safeSexId(sexId || input.sexId);
  const spreadsheetId = extractSpreadsheetId(input.spreadsheetUrl || input.url || input.spreadsheetId);
  if (!spreadsheetId) throw new Error("Google Sheets ssilkasi/ID noto‘g‘ri.");
  const service = sanitizeService(input.service || input.serviceAccount || input.json);
  const t = TENANTS.get(sexId) || { sexId, routes: [], sheets: {}, statuses: {}, hashes: {}, logs: [], version: 0 };
  t.spreadsheetUrl = input.spreadsheetUrl || input.url || spreadsheetId;
  t.spreadsheetId = spreadsheetId;
  t.menuSheet = input.menuSheet || input.baseSheet || "кудук руйхати";
  t.syncSeconds = Math.max(10, Number(input.syncSeconds || 30));
  t.service = service;
  t.sheetsApi = await makeSheets(service);
  TENANTS.set(sexId, t);
  if (persist) saveTenant(t);
  startTimer(t);
  return await syncTenant(sexId, "config");
}
function startTimer(t) {
  const old = TIMERS.get(t.sexId);
  if (old) clearInterval(old);
  const timer = setInterval(() => syncTenant(t.sexId, "background-worker").catch(e => log(t, "error", "Background sync xatosi: " + e.message)), (t.syncSeconds || 30) * 1000);
  TIMERS.set(t.sexId, timer);
}

function isBaseSheetName(sheet, maps) {
  const base = findBaseSheet(maps);
  return base && hardNorm(base) === hardNorm(sheet);
}
async function getBaseSheetName(t) {
  const meta = await metadata(t);
  const maps = buildSheetMaps(meta);
  const base = findBaseSheet(maps);
  if (!base) throw new Error('База varog‘i topilmadi. Google Sheets ichida База/ОБШИЕ varog‘i bo‘lishi kerak.');
  return base;
}
function makeRowIdentity(values = {}) {
  return {
    pos: hardNorm(values.pos || values.positionNumber || ''),
    serial: hardNorm(values.serial || values.factoryNumber || ''),
    name: hardNorm(values.name || values.deviceName || '')
  };
}
function sameRowIdentity(row, id) {
  if (!row || !id) return false;
  const rowId = makeRowIdentity(row);
  if (id.pos && rowId.pos && id.serial && rowId.serial) return id.pos === rowId.pos && id.serial === rowId.serial;
  if (id.pos && rowId.pos && id.name && rowId.name) return id.pos === rowId.pos && id.name === rowId.name;
  if (id.serial && rowId.serial) return id.serial === rowId.serial;
  return false;
}
async function findBaseRowNumber(t, sourceSheet, rowNumber, values = {}) {
  const baseSheet = await getBaseSheetName(t);
  if (hardNorm(sourceSheet) === hardNorm(baseSheet)) return { baseSheet, rowNumber };
  if (!Array.isArray(t.sheets[sourceSheet])) await loadSheet(t, { sheet: sourceSheet });
  const sourceRow = (t.sheets[sourceSheet] || []).find(r => Number(r._rowNumber) === Number(rowNumber)) || values;
  const id = makeRowIdentity({ ...sourceRow, ...values });
  if (!Array.isArray(t.sheets[baseSheet])) await loadSheet(t, { sheet: baseSheet });
  const baseRow = (t.sheets[baseSheet] || []).find(r => sameRowIdentity(r, id));
  if (!baseRow) throw new Error(`База ichida mos yozuv topilmadi. Poz=${sourceRow.pos || values.pos || ''}, Zavod=${sourceRow.serial || values.serial || ''}`);
  return { baseSheet, rowNumber: Number(baseRow._rowNumber) };
}

async function updateRow(sexId, sheet, rowNumber, values) {
  const t = await loadTenant(sexId);
  if (!t.sheetsApi) throw new Error("Sex konfiguratsiyasi topilmadi.");
  await validateRowValues(t, values);
  const target = await findBaseRowNumber(t, sheet, rowNumber, values);
  sheet = target.baseSheet;
  rowNumber = target.rowNumber;
  const status = t.statuses[sheet];
  if (!status?.indexMap) await loadSheet(t, { sheet });
  const idx = t.statuses[sheet]?.indexMap;
  if (!idx) throw new Error("База ustun xaritasi topilmadi.");
  const updates = [];
  for (const f of FIELD_ORDER) if (idx[f] >= 0 && Object.prototype.hasOwnProperty.call(values, f)) updates.push({ range: rangeA1(sheet, rowNumber - 1, idx[f]), values: [[values[f] ?? ""]] });
  if (!updates.length) return;
  await t.sheetsApi.spreadsheets.values.batchUpdate({ spreadsheetId: t.spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: updates } });
  await syncTenant(sexId, "base-row-update");
}
async function appendRow(sexId, sheet, values) {
  const t = await loadTenant(sexId);
  if (!t.sheetsApi) throw new Error("Sex konfiguratsiyasi topilmadi.");
  await validateRowValues(t, values);
  sheet = await getBaseSheetName(t);
  if (!t.statuses[sheet]?.indexMap) await loadSheet(t, { sheet });
  const idx = t.statuses[sheet]?.indexMap;
  if (!idx) throw new Error("База ustun xaritasi topilmadi.");
  const width = Math.max(...Object.values(idx).filter(n => n >= 0)) + 1;
  const row = Array(width).fill("");
  for (const f of FIELD_ORDER) if (idx[f] >= 0) row[idx[f]] = values[f] ?? "";
  await t.sheetsApi.spreadsheets.values.append({ spreadsheetId: t.spreadsheetId, range: `'${safeSheetTitle(sheet)}'!A:Z`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [row] } });
  await syncTenant(sexId, "base-row-append");
}


const STATIC_FALLBACK_METADATA = {
  installationPlaces: [
    "Аввал", "Аввал БВН", "В.Аввал", "Ворух", "Ворух сеп", "Ворух ст",
    "Хонкиз", "Хонкиз Газ", "Хонкиз УПН", "Центральный", "Цен. Аввал УППГ",
    "Кашкақир", "Кашкақир сеп", "Кашкақир ПРД", "УУГ ТЭС", "УУГ ФНПЗ", "Шурсув", "Шурсув сеп"
  ],
  deviceTypes: ["WIKA", "Физтех", "Полит", "Метран", "РОСМА", "ТЕМПУ", "TEMPU", "Vega", "VEGA", "НТФС"],
  workTypes: ["ТО-2", "АКТ", "ПОВЕРКА", "КАЛИБРОВКА"]
};

function uniqClean(values) {
  const seen = new Set();
  const out = [];
  for (const v of values || []) {
    const text = String(v ?? "").trim();
    if (!text) continue;
    const key = hardNorm(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}
function optionKey(v) { return hardNorm(v); }
function mergeOptions(...lists) { return uniqClean(lists.flat()).sort((a, b) => String(a).localeCompare(String(b), "ru")); }
function parseValidationRangeRef(raw) {
  let ref = String(raw || "").trim();
  if (!ref) return "";
  ref = ref.replace(/^=/, "").trim();
  const mQuoted = ref.match(/^'([^']+)'!([A-Z]+\d*(?::[A-Z]+\d*)?)$/i);
  if (mQuoted) return `'${safeSheetTitle(mQuoted[1])}'!${mQuoted[2]}`;
  const mPlain = ref.match(/^([^!]+)!([A-Z]+\d*(?::[A-Z]+\d*)?)$/i);
  if (mPlain) return `'${safeSheetTitle(mPlain[1])}'!${mPlain[2]}`;
  return "";
}
function validationListValues(cell) {
  const rule = cell?.dataValidation;
  const condition = rule?.condition;
  if (!condition) return { values: [], ranges: [] };
  const type = String(condition.type || "").toUpperCase();
  const rawValues = condition.values || [];
  if (type === "ONE_OF_LIST") {
    return { values: rawValues.map(v => v.userEnteredValue || v.relativeDate || ""), ranges: [] };
  }
  if (type === "ONE_OF_RANGE") {
    return { values: [], ranges: rawValues.map(v => parseValidationRangeRef(v.userEnteredValue)).filter(Boolean) };
  }
  return { values: rawValues.map(v => v.userEnteredValue || ""), ranges: [] };
}
async function readRangeValues(t, range) {
  const res = await t.sheetsApi.spreadsheets.values.get({
    spreadsheetId: t.spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
    majorDimension: "COLUMNS"
  });
  return (res.data.values || []).flat().map(v => String(v || "").trim()).filter(Boolean);
}
async function collectColumnMetadata(t, baseSheet, header, matrix, fieldKey) {
  const col = header.idx[fieldKey];
  if (col < 0) return [];
  const grid = await getGrid(t, baseSheet);
  const rowData = grid.data?.[0]?.rowData || [];
  const directOptions = [];
  const rangeRefs = new Set();
  for (let r = header.row + 1; r < rowData.length; r++) {
    const cell = rowData[r]?.values?.[col];
    const rule = validationListValues(cell);
    directOptions.push(...rule.values);
    for (const rr of rule.ranges) rangeRefs.add(rr);
  }
  const fromRanges = [];
  for (const rr of rangeRefs) {
    try { fromRanges.push(...await readRangeValues(t, rr)); }
    catch (e) { log(t, "error", `Dropdown source range o'qilmadi: ${rr} (${e.message})`); }
  }
  const existingValues = [];
  for (let r = header.row + 1; r < matrix.length; r++) existingValues.push(matrix[r]?.[col] || "");
  return mergeOptions(directOptions, fromRanges, existingValues);
}
async function loadMetadata(t) {
  const baseSheet = await getBaseSheetName(t);
  const grid = await getGrid(t, baseSheet);
  const matrix = valuesMatrixFromGrid(grid);
  const header = findHeaderRow(matrix);
  if (!isDataHeader(header)) throw new Error(`База varog'ida jurnal headerlari topilmadi.`);
  const [installationPlaces, deviceTypes, workTypes] = await Promise.all([
    collectColumnMetadata(t, baseSheet, header, matrix, "location"),
    collectColumnMetadata(t, baseSheet, header, matrix, "brand"),
    collectColumnMetadata(t, baseSheet, header, matrix, "work")
  ]);
  const result = {
    ok: true,
    baseSheet,
    source: "google-sheets-data-validation-with-fallback",
    installationPlaces: mergeOptions(installationPlaces, STATIC_FALLBACK_METADATA.installationPlaces),
    deviceTypes: mergeOptions(deviceTypes, STATIC_FALLBACK_METADATA.deviceTypes),
    workTypes: mergeOptions(workTypes, STATIC_FALLBACK_METADATA.workTypes),
    updatedAt: new Date().toISOString()
  };
  t.metadata = result;
  return result;
}
async function getTenantMetadata(t) {
  if (!t.metadata || (Date.now() - Date.parse(t.metadata.updatedAt || 0)) > 60_000) return await loadMetadata(t);
  return t.metadata;
}
async function validateRowValues(t, values = {}) {
  const md = await getTenantMetadata(t);
  const checks = [
    ["location", "installationPlaces", "Место установки"],
    ["brand", "deviceTypes", "Тип, марка"],
    ["work", "workTypes", "Перечень в/р"]
  ];
  for (const [field, listName, label] of checks) {
    if (!Object.prototype.hasOwnProperty.call(values, field)) continue;
    const value = String(values[field] || "").trim();
    if (!value) continue;
    const allowed = new Set((md[listName] || []).map(optionKey));
    if (allowed.size && !allowed.has(optionKey(value))) throw new Error(`${label} qiymati Google Sheets dropdown ro'yxatida yo'q: ${value}`);
  }
}
async function deleteRow(sexId, sheet, rowNumber) {
  const t = await loadTenant(sexId);
  const target = await findBaseRowNumber(t, sheet, rowNumber, {});
  sheet = target.baseSheet;
  rowNumber = target.rowNumber;
  const meta = await metadata(t);
  const sh = meta.sheets.find(s => s.properties.title === sheet);
  if (!sh) throw new Error(`"${sheet}" varog‘i topilmadi.`);
  await t.sheetsApi.spreadsheets.batchUpdate({ spreadsheetId: t.spreadsheetId, requestBody: { requests: [{ deleteDimension: { range: { sheetId: sh.properties.sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }] } });
  await syncTenant(sexId, "base-row-delete");
}

export function createKudukRouter(io) {
  IO = io;
  const router = express.Router();
  router.get("/health", async (req, res) => {
    const sexId = safeSexId(req.query.sexId || req.query.sex || "sex_default");
    const t = await loadTenant(sexId).catch(() => null);
    res.json({ ok: true, sexId, connected: Boolean(t?.connected), status: t?.connected ? "READY" : "OFFLINE" });
  });
  router.get("/state", async (req, res) => {
    try { res.json(publicState(await loadTenant(req.query.sexId || "sex_default"))); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  // Frontend/future compatibility aliases required by the project specification.
  router.post("/connect", async (req, res) => {
    try { res.json(await applyConfig(req.body.sexId, req.body, true)); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  router.get("/menu", async (req, res) => {
    try { const t = await loadTenant(req.query.sexId || "sex_default"); if (!t.connected && t.sheetsApi) await syncTenant(t.sexId, "menu-api"); res.json({ ok: true, routes: t.routes || [], menuRange: `'${t.menuSheet || "кудук руйхати"}'!${MENU_RANGE_A1}` }); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  router.get("/sheet", async (req, res) => {
    try { const t = await loadTenant(req.query.sexId || "sex_default"); const sheet = req.query.sheet || req.query.targetSheet; if (!sheet) throw new Error("sheet parametri kerak."); if (!t.sheets?.[sheet]) await loadSheet(t, { sheet }); res.json({ ok: true, sheet, rows: t.sheets[sheet] || [], status: t.statuses[sheet] || null }); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  router.post("/update", async (req, res) => {
    try { await updateRow(req.body.sexId, req.body.sheet, Number(req.body.rowNumber), req.body.values || {}); res.json(publicState(await loadTenant(req.body.sexId))); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  router.delete("/clear", async (req, res) => {
    const sexId = safeSexId(req.query.sexId || req.body?.sexId || "sex_default");
    const old = TIMERS.get(sexId); if (old) clearInterval(old); TIMERS.delete(sexId);
    TENANTS.delete(sexId);
    try { if (fs.existsSync(tenantFile(sexId))) fs.unlinkSync(tenantFile(sexId)); } catch {}
    const fresh = { sexId, connected: false, routes: [], sheets: {}, statuses: {}, logs: [{ level: "ok", message: "Faqat joriy sex xotirasi tozalandi.", ts: new Date().toISOString() }], version: Date.now() };
    TENANTS.set(sexId, fresh);
    io.to(`sex:${sexId}`).emit("kuduk-data-update", publicState(fresh));
    res.json(publicState(fresh));
  });
  router.get("/metadata", async (req, res) => {
    try {
      const t = await loadTenant(req.query.sexId || "sex_default");
      if (!t.sheetsApi) throw new Error("Sex konfiguratsiyasi topilmadi.");
      res.json(await loadMetadata(t));
    } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  router.get("/debug/mapping", async (req, res) => {
    try {
      const t = await loadTenant(req.query.sexId || "sex_default");
      res.json({ ok: true, sexId: t.sexId, spreadsheetId: t.spreadsheetId || "", menuSheet: t.menuSheet || "", routes: t.routes || [], statuses: t.statuses || {}, fields: FIELD_ORDER });
    } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  router.post("/config", async (req, res) => {
    try { res.json(await applyConfig(req.body.sexId, req.body, true)); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  router.delete("/config/:sexId", async (req, res) => {
    const sexId = safeSexId(req.params.sexId);
    const old = TIMERS.get(sexId); if (old) clearInterval(old); TIMERS.delete(sexId);
    TENANTS.delete(sexId);
    try { if (fs.existsSync(tenantFile(sexId))) fs.unlinkSync(tenantFile(sexId)); } catch {}
    const fresh = { sexId, connected: false, routes: [], sheets: {}, statuses: {}, logs: [{ level: "ok", message: "Faqat joriy sex xotirasi tozalandi.", ts: new Date().toISOString() }], version: Date.now() };
    TENANTS.set(sexId, fresh);
    io.to(`sex:${sexId}`).emit("kuduk-data-update", publicState(fresh));
    res.json(publicState(fresh));
  });
  router.post("/sync", async (req, res) => {
    try { res.json(await syncTenant(req.body.sexId || req.query.sexId || "sex_default", "manual-api")); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  router.post("/rows", async (req, res) => {
    try { await appendRow(req.body.sexId, req.body.sheet, req.body.values || {}); res.json(publicState(await loadTenant(req.body.sexId))); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  router.put("/rows", async (req, res) => {
    try { await updateRow(req.body.sexId, req.body.sheet, Number(req.body.rowNumber), req.body.values || {}); res.json(publicState(await loadTenant(req.body.sexId))); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  router.delete("/rows", async (req, res) => {
    try { await deleteRow(req.query.sexId, req.query.sheet, Number(req.query.rowNumber)); res.json(publicState(await loadTenant(req.query.sexId))); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  return router;
}

export function initKudukRealtime(io) {
  IO = io;
  io.on("connection", socket => {
    const sexId = safeSexId(socket.handshake.query.sexId || "sex_default");
    socket.join(`sex:${sexId}`);
    loadTenant(sexId).then(t => socket.emit("kuduk-data-update", publicState(t))).catch(e => socket.emit("kuduk-log", { level: "error", message: e.message, ts: new Date().toISOString() }));
  });
  for (const file of fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"))) {
    const sexId = path.basename(file, ".json");
    loadTenant(sexId).catch(e => console.error(`Tenant ${sexId} boot error:`, e.message));
  }
}
