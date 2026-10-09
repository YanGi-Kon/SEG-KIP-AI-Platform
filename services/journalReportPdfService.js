import { getJournalReport, normalizeJournalReportPeriod } from './journalReportService.js';
import { getWorkspaceSignerList } from './workspaceSignerService.js';
import { getWorkspaceSignaturePng } from './workspaceSignatureService.js';
import { assertPdfBuffer, inlinePdfSignatureImages, renderHtmlToA4Pdf } from './pdfRendererService.js';
import { createWorkspaceDriveProvider, classifyWorkspaceDriveError } from './workspaceDriveFolderService.js';

const MONTHS = ['', 'Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const clean = value => String(value ?? '').trim();
const esc = value => clean(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function reportError(message, code, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}
export function isJournalMaster(signer) {
  const position = clean(signer.position).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  return ['мастеркипиа','нўввааустаси','нуввааустаси','masterkipia','novvaaustasi','instrumentationmaster'].includes(position);
}
function rowMaster(row, masters) {
  const matching = masters.filter(signer => clean(signer.fullName || signer.fio).toLowerCase() === clean(row.executor).toLowerCase());
  return matching.length === 1 ? matching[0] : masters.length === 1 ? masters[0] : null;
}
function documentDate(value) {
  const raw = value instanceof Date ? value.toISOString() : clean(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[3] + '.' + match[2] + '.' + match[1] : raw;
}
export function buildJournalReportPdfHtml(bundle, masters = [], signatureImages = new Map()) {
  const report = bundle.report;
  const batches = new Map((bundle.batches || []).map(batch => [batch.id, batch]));
  const rows = (bundle.items || []).map((row, index) => {
    const master = rowMaster(row, masters);
    const image = master && signatureImages.get(master.id);
    const executor = image ? clean(master.fullName || master.fio) : row.executor;
    const values = [index + 1, documentDate(batches.get(row.batchId)?.documentDate) || row.date, row.pos, row.name, row.brand, row.serial, row.range, row.location, row.skv, row.work, executor];
    const signature = image ? '<img src="' + esc(image) + '" alt="Имзо">' : esc(row.signature);
    return '<tr>' + values.map(value => '<td>' + esc(value) + '</td>').join('') + '<td>' + signature + '</td></tr>';
  }).join('');
  const columns = ['№','Дата','Поз номер','Наименование СИ','Тип, марка','Заводской номер','Предел измерения','Место установки','СКВ','Перечень в/р','Исполнитель','Подпись'];
  return '<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>ЖУРНАЛ УЧЕТА</title><style>' +
    '@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:"Times New Roman","Liberation Serif",serif}' +
    'h1{text-align:center;font-size:16pt;margin:0 0 4mm}.period{text-align:center;font-size:12pt;margin:0 0 5mm}' +
    'table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:9pt}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}' +
    'th,td{border:.25mm solid #000;padding:.8mm;vertical-align:middle;overflow-wrap:anywhere}th{text-align:center;background:#fff;color:#111}' +
    'img{display:block;width:100%;max-width:20mm;height:8mm;object-fit:contain;margin:auto}' +
    '</style></head><body><h1>ЖУРНАЛ УЧЕТА</h1><div class="period">' + esc(MONTHS[Number(report.month)] || report.month) + ' ' + esc(report.year) +
    '</div><table><thead><tr>' + columns.map(value => '<th>' + esc(value) + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></body></html>';
}

export async function exportJournalReportPdf(workspace, yearRaw, monthRaw, dependencies = {}) {
  const { year, month } = normalizeJournalReportPeriod(yearRaw, monthRaw);
  if (!workspace?.id) throw reportError('Workspace топилмади.', 'WORKSPACE_NOT_FOUND', 404);
  const folderId = clean(workspace.finalDocumentsFolderId);
  if (!folderId) throw reportError('6. ЯКУНИЙ ҲУЖЖАТЛАР бўлимида PDF сақланадиган папкани киритинг.', 'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED');
  const readReport = dependencies.getReport || getJournalReport;
  const readSigners = dependencies.getSigners || getWorkspaceSignerList;
  const readSignature = dependencies.getSignature || getWorkspaceSignaturePng;
  const makeProvider = dependencies.createProvider || createWorkspaceDriveProvider;
  const renderPdf = dependencies.renderPdf || renderHtmlToA4Pdf;
  const bundle = await readReport(workspace.id, year, month);
  if (!bundle) throw reportError('Бу ой учун ҳисобот топилмади.', 'JOURNAL_REPORT_NOT_FOUND', 404);
  if (!bundle.items?.length) throw reportError('Ҳужжатда сақлаш учун ёзувлар йўқ.', 'JOURNAL_REPORT_ROWS_REQUIRED');
  const masters = (await readSigners(workspace.id)).filter(signer => clean(signer.status || 'active') === 'active' && isJournalMaster(signer));
  const usedMasters = new Map();
  for (const row of bundle.items) {
    const master = rowMaster(row, masters);
    if (!master && masters.length > 1) throw reportError('Қаторнинг «Исполнитель» қийматига мос устани белгиланг.', 'JOURNAL_SIGNER_AMBIGUOUS');
    if (master) usedMasters.set(master.id, master);
  }
  const signatures = new Map();
  for (const master of usedMasters.values()) {
    const signatureId = clean(master.signatureFileId).match(/^db:([0-9a-f-]{36})$/i)?.[1];
    if (signatureId) {
      const image = await readSignature(workspace.id, signatureId);
      if (image.mimeType !== 'image/png') throw reportError('Имзо PNG форматида бўлиши керак.', 'JOURNAL_SIGNATURE_INVALID');
      signatures.set(master.id, 'data:image/png;base64,' + image.buffer.toString('base64'));
    } else if (/^data:image\/png;base64,/i.test(clean(master.signatureUrl))) {
      signatures.set(master.id, clean(master.signatureUrl));
    } else if (master.signatureUrl || master.signatureFileId) {
      throw reportError('Уста имзосини PNG шаклида қайта юкланг.', 'JOURNAL_SIGNATURE_REUPLOAD_REQUIRED');
    }
  }
  const inlined = await inlinePdfSignatureImages(buildJournalReportPdfHtml(bundle, masters, signatures));
  try {
    const provider = await makeProvider(workspace);
    await provider.validateFolder(folderId, { writeTest: false });
    const pdf = assertPdfBuffer(await renderPdf(inlined.html, { landscape: true, allowMultiPage: true }));
    const fileName = 'ЖУРНАЛ УЧЕТА - ' + year + '-' + String(month).padStart(2, '0') + '.pdf';
    const uploaded = await provider.uploadPdf(folderId, fileName, pdf);
    if (!clean(uploaded.fileId) || !(Number(uploaded.size) > 0) || (uploaded.parentFolderId && uploaded.parentFolderId !== folderId)) throw reportError('Drive PDF сақланганини тасдиқламади.', 'DRIVE_UPLOAD_RESULT_INVALID', 502);
    return { ...uploaded, fileName, folderId, year, month, rowCount: bundle.items.length };
  } catch (error) {
    const classified = classifyWorkspaceDriveError(error);
    throw Object.assign(new Error(classified.message), { code: classified.code, statusCode: classified.statusCode, recommendedFix: classified.recommendedFix });
  }
}
