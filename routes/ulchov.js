import express from 'express';
import multer from 'multer';
import { hasWorkspacePermission } from '../domain/permissions.js';
import { extractDriveFolderId } from '../domain/workspace.js';
import { instrumentPassportKey, normalizePassportFilename, preparePassportUpload, MAX_PASSPORT_UPLOAD_BYTES, MAX_PASSPORT_TOTAL_BYTES, MAX_PASSPORT_UPLOAD_FILES, passportError } from '../domain/instrumentPassport.js';
import * as passports from '../repositories/instrumentPassportRepository.js';
import { createWorkspaceDriveProvider } from '../services/workspaceDriveFolderService.js';
import { ulchovFolderId } from '../services/instrumentPassportService.js';
import { listSheets, readSheetRows, validateServiceAccount } from '../services/googleSheetsService.js';
import { requireWorkspaceRequestPermission } from '../middleware/workspaceAccess.js';
import { requireAccessToken } from '../middleware/auth.js';

const router = express.Router();

function workspaceGuards(permission) {
  const authorizeWorkspace = requireWorkspaceRequestPermission(permission);
  return (req, res, next) => requireAccessToken(req, res, () => authorizeWorkspace(req, res, next));
}

router.use(workspaceGuards('workspace:read'));

const boundedStorage={
  _handleFile(req,file,callback){
    const chunks=[];let size=0,finished=false;
    const done=(error,result)=>{if(!finished){finished=true;callback(error,result);}};
    file.stream.on('data',chunk=>{
      req.passportUploadBytes=(req.passportUploadBytes||0)+chunk.length;
      if(req.passportUploadBytes>MAX_PASSPORT_TOTAL_BYTES){chunks.length=0;done(passportError('Tanlangan fayllar jami 60 MBdan oshmasin.','PASSPORT_TOTAL_SIZE_LIMIT',413));return;}
      if(!finished){chunks.push(chunk);size+=chunk.length;}
    });
    file.stream.on('error',error=>done(error));
    file.stream.on('end',()=>done(null,{buffer:Buffer.concat(chunks),size}));
  },
  _removeFile(_req,file,callback){delete file.buffer;callback(null);},
};
const passportUpload = multer({storage:boundedStorage,limits:{fileSize:MAX_PASSPORT_UPLOAD_BYTES,files:MAX_PASSPORT_UPLOAD_FILES,fields:3}});
function passportResponseError(res,error) {
  const uploadErrors={
    LIMIT_FILE_SIZE:['Har bir JPG yoki PDF fayl 15 MBdan oshmasin.',413],
    LIMIT_FILE_COUNT:['Bir martada 20 tagacha JPG yoki PDF tanlang.',413],
    LIMIT_FIELD_COUNT:['Yuklash so‘rovida ortiqcha maydonlar bor.',400],
    LIMIT_UNEXPECTED_FILE:['Faqat hujjat tanlash maydonidan foydalaning.',400],
  };
  const mapped=uploadErrors[error.code];
  res.status(mapped?.[1] || error.statusCode || 400).json({
    ok:false,
    error:mapped?.[0] || error.message || 'Hujjatni yuklash amalga oshmadi.',
    code:error.code || 'PASSPORT_FAILED',
  });
}
function folderInfo(req) {
  const id = ulchovFolderId(req.workspace);
  return {folderId:id,folderUrl:id?`https://drive.google.com/drive/folders/${id}`:'',
    inherited:!req.workspace.moduleSettings?.ulchov_final_documents_folder_id,
    canConfigure:hasWorkspacePermission(req.workspaceRole,'workspace:update'),
    canUpload:true};
}
router.get('/final-folder',(req,res)=>res.json({ok:true,...folderInfo(req)}));
router.put('/final-folder',workspaceGuards('workspace:update'),async(req,res)=>{
  try {
    const id=extractDriveFolderId(req.body?.folderUrl || req.body?.folderId || '');
    if(!id)throw passportError('Google Drive papka URL yoki ID kiriting.','PASSPORT_FOLDER_REQUIRED');
    await passports.saveUlchovFolder(req.workspace.id,id);
    res.json({ok:true,folderId:id,folderUrl:`https://drive.google.com/drive/folders/${id}`});
  }catch(error){passportResponseError(res,error);}
});
router.post('/final-folder/test',workspaceGuards('workspace:test'),async(req,res)=>{
  try {
    const id=ulchovFolderId(req.workspace);
    if(!id)throw passportError('Avval yakuniy hujjatlar papkasini saqlang.','PASSPORT_FOLDER_REQUIRED');
    const provider=await createWorkspaceDriveProvider(req.workspace);
    const result=await provider.validateFolder(id,{writeTest:true});
    let passportReady=true,passportCode='',passportWarning='',passportRecommendedFix='';
    try {
      await provider.passportCapabilities();
    } catch (error) {
      if(!['PASSPORT_APPS_SCRIPT_UPDATE_REQUIRED','PASSPORT_ADVANCED_DRIVE_REQUIRED'].includes(error.code))throw error;
      passportReady=false;
      passportCode=error.code || '';
      passportWarning=error.message || 'Pasport Drive adapteri tayyor emas.';
      passportRecommendedFix=error.recommendedFix || '';
    }
    res.json({ok:true,result,passportReady,passportCode,passportWarning,passportRecommendedFix});
  }catch(error){passportResponseError(res,error);}
});
router.get('/passports/:key',workspaceGuards('documents:read'),async(req,res)=>{
  try {res.json({ok:true,...await passports.passportDetails(req.workspace.id,req.params.key),canUpload:true});}
  catch(error){passportResponseError(res,error);}
});
router.get('/passports/:key/pdf',workspaceGuards('documents:read'),async(req,res)=>{
  try {
    const passport=await passports.getPassport(req.workspace.id,req.params.key);
    if(!passport?.merged_pdf)throw passportError('Yagona pasport hali tayyor emas.','PASSPORT_NOT_READY',404);
    res.type('application/pdf').set('Cache-Control','private, no-store').set('Content-Disposition','inline; filename="pasport.pdf"').send(passport.merged_pdf);
  }catch(error){passportResponseError(res,error);}
});
router.post('/passports/:key/retry',workspaceGuards('workspace:read'),async(req,res)=>{
  try {
    const job=await passports.retryPassport(req.workspace.id,req.params.key,ulchovFolderId(req.workspace));
    if(!job)throw passportError('Qayta bajariladigan vazifa topilmadi.','PASSPORT_RETRY_NOT_FOUND',404);
    res.json({ok:true,jobId:job.id});
  }catch(error){passportResponseError(res,error);}
});
router.post('/passports/:key/documents',workspaceGuards('workspace:read'),(req,res)=>{
  passportUpload.array('file',MAX_PASSPORT_UPLOAD_FILES)(req,res,async uploadError=>{
    try {
      if(uploadError)throw uploadError;
      const rootFolderId=ulchovFolderId(req.workspace);
      if(!rootFolderId)throw passportError('6. ЯКУНИЙ ҲУЖЖАТЛАР oynasida Drive papkasini kiriting.','PASSPORT_FOLDER_REQUIRED');
      if(!req.files?.length)throw passportError('JPG yoki PDF fayllar tanlang.','PASSPORT_FILE_REQUIRED');
      const sheetName=clean(req.body.sheetName);
      let menuRows=req.workspace.moduleSettings?.ulchov_menu_sheet_map || [];
      if(typeof menuRows==='string'){try{menuRows=JSON.parse(menuRows);}catch{menuRows=[];}}
      const allowed=new Set([req.workspace.moduleSettings?.ulchov_sheet_name,...(Array.isArray(menuRows)?menuRows.map(row=>row.sheetName || row.sheet):[])]);
      if(!allowed.has(sheetName))throw passportError('Asbob sozlangan O‘lchov varag‘ida bo‘lishi kerak.','PASSPORT_SHEET_NOT_CONFIGURED');
      const config=resolveConfig(req);
      const rows=await readSheetRows({...config,range:'A:Z'});
      const matches=parseInstruments(rows).instruments.filter(item=>instrumentPassportKey(sheetName,item)===req.params.key);
      if(matches.length!==1)throw passportError(matches.length?'Asbob identifikatori takrorlangan. Reestrni tekshiring.':'Asbob reestrda topilmadi. Kartochkalarni yangilang.','PASSPORT_INSTRUMENT_AMBIGUOUS',409);
      const parsed=await preparePassportUpload(req.files);
      const filename=req.files.map(file=>normalizePassportFilename(file.originalname).replace(/[\\/\x00-\x1f]/g,'-')).join(' + ').slice(0,180) || 'hujjat.pdf';
      const result=await passports.savePassportDocument({workspaceId:req.workspace.id,key:req.params.key,sheetName,instrument:matches[0],filename,parsed,userId:req.auth.userId,rootFolderId});
      res.status(result.duplicate?200:202).json({ok:true,...result});
    }catch(error){passportResponseError(res,error);}
  });
});

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

function resolveConfig(req) {
  const input = req.body || req.query || {};
  const workspace = req.workspace || {};
  const spreadsheetUrl = clean(workspace.spreadsheetUrl || input.spreadsheetUrl || input.spreadsheetId);
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
  
  let serviceAccountRaw = input.serviceAccount;
  if (workspace.serviceAccountBase64) {
    try {
      serviceAccountRaw = JSON.parse(Buffer.from(workspace.serviceAccountBase64, 'base64').toString('utf8'));
    } catch (_) {}
  }
  
  return {
    spreadsheetUrl,
    sheetName,
    serviceAccount: validateServiceAccount(serviceAccountRaw),
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
    const config = resolveConfig(req);
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
    const config = resolveConfig(req);
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
    const keys=parsed.instruments.map(item=>instrumentPassportKey(config.sheetName,item));
    const summaries=await passports.passportSummaries(req.workspace.id,keys);
    res.json({
      ok: true,
      sheetName: config.sheetName,
      rowsRead: rows.length,
      instruments: parsed.instruments.map((item,index)=>({...item,passportKey:keys[index],passport:summaries.get(keys[index]) || null})),
      summary: summarize(parsed.instruments),
      missingColumns: parsed.missingColumns,
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message, code: error.code || 'ULCHOV_INSTRUMENTS_FAILED' });
  }
});

export default router;
