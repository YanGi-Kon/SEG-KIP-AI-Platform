import {
  completeFaultReport,
  deleteFaultReport as deleteFaultReportRecord,
  getFaultReport as getFaultReportRecord,
  listFaultReports as listFaultReportRecords,
  saveFaultReport as saveFaultReportRecord,
} from '../repositories/faultReportRepository.js';
import { getWorkspaceSignatureImageById } from '../repositories/workspaceSignatureRepository.js';
import {
  createWorkspaceDriveProvider,
  ensureWorkspaceDocumentsSubfolder,
} from './workspaceDriveFolderService.js';
import { renderHtmlToA4Pdf } from './pdfRendererService.js';

const MONTHS = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function clean(value) {
  return String(value ?? '').trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

export function normalizeFaultPeriod(yearRaw, monthRaw) {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    const error = new Error('Nosozliklar jurnali yili noto‘g‘ri');
    error.code = 'FAULT_REPORT_YEAR_INVALID';
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    const error = new Error('Nosozliklar jurnali oyi noto‘g‘ri');
    error.code = 'FAULT_REPORT_MONTH_INVALID';
    error.statusCode = 400;
    throw error;
  }
  return { year, month, monthName: MONTHS[month] };
}

function normalizeRow(row = {}) {
  return {
    sourceKey: clean(row.sourceKey),
    actNo: clean(row.actNo),
    date: clean(row.date),
    time: clean(row.time),
    deviceName: clean(row.deviceName || row.device),
    place: clean(row.place),
    positionNo: clean(row.positionNo),
    serialNo: clean(row.serialNo || row.serial),
    measureRange: clean(row.measureRange),
    reasonText: clean(row.reasonText),
    failureText: clean(row.failureText),
    actionText: clean(row.actionText),
    actionDate: clean(row.actionDate),
    actionTime: clean(row.actionTime),
    status: clean(row.status),
  };
}

function normalizeSigner(signer = {}) {
  return {
    id: clean(signer.id || signer.signerId),
    fio: clean(signer.fio || signer.fullName),
    position: clean(signer.position),
    email: clean(signer.email || signer.gmail),
    signatureFileId: clean(signer.signatureFileId),
  };
}

export async function saveFaultReport(input = {}) {
  const { year, month } = normalizeFaultPeriod(input.year, input.month);
  const rows = (Array.isArray(input.rows) ? input.rows : []).map(normalizeRow)
    .filter((row) => row.sourceKey || row.actNo || row.date || row.deviceName || row.actionText);
  const report = await saveFaultReportRecord({
    workspaceId: input.workspaceId,
    year,
    month,
    sourceSheetName: input.sourceSheetName,
    rows,
    signer: normalizeSigner(input.signer),
    createdBy: input.createdBy,
  });
  if (report) return report;

  const existing = await getFaultReportRecord(input.workspaceId, year, month);
  if (existing?.status === 'completed') {
    const error = new Error('Yakunlangan nosozliklar jurnalini tahrirlash mumkin emas.');
    error.code = 'FAULT_REPORT_COMPLETED';
    error.statusCode = 409;
    throw error;
  }
  const error = new Error('Nosozliklar jurnali saqlanmadi.');
  error.code = 'FAULT_REPORT_SAVE_FAILED';
  error.statusCode = 500;
  throw error;
}

export async function listFaultReportFolders(workspaceId) {
  const reports = await listFaultReportRecords(workspaceId);
  return reports.map((report) => ({
    id: report.id,
    year: report.year,
    month: report.month,
    label: `${MONTHS[report.month] || report.month} ${report.year}`,
    status: report.status,
    rowCount: report.rows.length,
    finalPdf: report.finalPdf,
    updatedAt: report.updatedAt,
  }));
}

export async function getFaultReport(workspaceId, yearRaw, monthRaw) {
  const { year, month } = normalizeFaultPeriod(yearRaw, monthRaw);
  return getFaultReportRecord(workspaceId, year, month);
}

export async function deleteFaultReport(workspaceId, yearRaw, monthRaw) {
  const { year, month } = normalizeFaultPeriod(yearRaw, monthRaw);
  const deleted = await deleteFaultReportRecord(workspaceId, year, month);
  if (deleted) return deleted;
  const existing = await getFaultReportRecord(workspaceId, year, month);
  if (!existing) {
    const error = new Error('Nosozliklar jurnali hisoboti topilmadi.');
    error.code = 'FAULT_REPORT_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  const error = new Error('Faqat draft holatdagi nosozliklar jurnalini o‘chirish mumkin.');
  error.code = 'FAULT_REPORT_DELETE_FORBIDDEN';
  error.statusCode = 409;
  throw error;
}

async function signerImageDataUri(signer = {}) {
  const fileId = clean(signer.signatureFileId);
  const internalId = fileId.match(/^db:([0-9a-f-]{36})$/i)?.[1] || '';
  if (!internalId) return '';
  const image = await getWorkspaceSignatureImageById(internalId);
  if (!image?.imageBase64) return '';
  const mimeType = clean(image.mimeType) || 'image/png';
  return `data:${mimeType};base64,${image.imageBase64}`;
}

export async function buildFaultReportHtml(report = {}, workspace = {}) {
  const signer = normalizeSigner(report.signer);
  const signatureDataUri = await signerImageDataUri(signer);
  const period = `${MONTHS[Number(report.month)] || report.month} ${report.year}`;
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const rowHtml = rows.map((row, index) => {
    const equipment = [clean(row.deviceName), clean(row.place), clean(row.positionNo) ? `поз. №${clean(row.positionNo)}` : ''].filter(Boolean).join(', ');
    const failure = [
      clean(row.serialNo) ? `Завод рақами: ${clean(row.serialNo)}` : '',
      clean(row.measureRange) ? `Ўлчаш чегараси: ${clean(row.measureRange)}` : '',
      clean(row.reasonText || row.failureText) ? `Рад этиш сабаби: ${clean(row.reasonText || row.failureText)}` : '',
    ].filter(Boolean).join('\n');
    const resolved = [clean(row.actionDate), clean(row.actionTime)].filter(Boolean).join(' ');
    return `<tr>
      <td>${esc(row.actNo || index + 1)}</td>
      <td>${esc([row.date, row.time].filter(Boolean).join(' '))}</td>
      <td>${esc(equipment)}</td>
      <td class="pre">${esc(failure)}</td>
      <td class="pre">${esc(row.actionText)}</td>
      <td>${esc(resolved)}</td>
      <td class="signature-cell">${signatureDataUri ? `<img src="${signatureDataUri}" alt="${esc(signer.fio || 'Imzo')}">` : esc(signer.fio || '')}</td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:9px}
h1{text-align:center;font-size:16px;margin:0 0 4mm}.meta{text-align:center;font-size:10px;margin-bottom:4mm}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #222;padding:4px;vertical-align:middle;word-break:break-word}
th{text-align:center;font-size:8px;background:#eef5f7}.pre{white-space:pre-wrap}.signature-cell{text-align:center}
.signature-cell img{max-width:31mm;max-height:14mm;object-fit:contain}
.footer{margin-top:5mm;font-size:9px}.footer b{font-size:10px}
</style></head><body>
<h1>ЖУРНАЛ НЕИСПРАВНОСТЕЙ</h1>
<div class="meta">${esc(workspace.name || '')} · ${esc(period)}</div>
<table>
<thead><tr>
<th style="width:7%">№ п/п</th>
<th style="width:12%">Дата, время возникновения неисправности</th>
<th style="width:15%">Наименование оборудования</th>
<th style="width:23%">Краткое описание неисправности</th>
<th style="width:22%">Принятые меры по ликвидации неисправности</th>
<th style="width:10%">Дата устранения неисправности</th>
<th style="width:11%">Подпись ответств. за устранение</th>
</tr></thead>
<tbody>${rowHtml || '<tr><td colspan="7">Ma’lumot mavjud emas.</td></tr>'}</tbody>
</table>
<div class="footer"><b>Ответственный:</b> ${esc(signer.position)} · ${esc(signer.fio)}</div>
</body></html>`;
}

export function buildFaultFinalPdfFileName(year, month) {
  return `NOSOZLIKLAR_JURNALI_${Number(year)}-${String(Number(month)).padStart(2, '0')}.pdf`;
}

export async function finalizeFaultReport({ workspace, year: yearRaw, month: monthRaw, completedBy = null } = {}) {
  const { year, month } = normalizeFaultPeriod(yearRaw, monthRaw);
  const report = await getFaultReportRecord(workspace?.id, year, month);
  if (!report) {
    const error = new Error('Avval joriy oy nosozliklar jurnalini 3. Хисоботлар uchun saqlang.');
    error.code = 'FAULT_REPORT_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const previous = report.finalPdf || {};
  if (report.status === 'completed' && clean(previous.fileId)) {
    return { report, finalPdf: previous, reused: true };
  }
  if (!clean(workspace?.finalDocumentsFolderId)) {
    const error = new Error('6. ЯКУНИЙ ҲУЖЖАТЛАР bo‘limida Google Drive papkasini sozlang.');
    error.code = 'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  const provider = await createWorkspaceDriveProvider(workspace);
  await provider.validateFolder(workspace.finalDocumentsFolderId, { writeTest: false });
  const targetFolder = await ensureWorkspaceDocumentsSubfolder(workspace, {
    folderName: 'ХУЖАТЛАР',
    provider,
  });
  const html = await buildFaultReportHtml(report, workspace);
  const pdfBuffer = await renderHtmlToA4Pdf(html, { allowMultiPage: true });
  const uploaded = await provider.uploadPdf(
    targetFolder.folderId,
    buildFaultFinalPdfFileName(year, month),
    pdfBuffer,
  );
  if (!clean(uploaded?.fileId)) {
    const error = new Error('Drive PDF upload haqiqiy fileId qaytarmadi.');
    error.code = 'DRIVE_UPLOAD_RESULT_INVALID';
    error.statusCode = 502;
    throw error;
  }

  const finalPdf = {
    status: 'EXPORTED',
    fileId: clean(uploaded.fileId),
    url: clean(uploaded.url),
    size: Number(uploaded.size || pdfBuffer.length),
    folderId: clean(workspace.finalDocumentsFolderId),
    documentsFolderId: clean(targetFolder.folderId),
    exportedAt: new Date().toISOString(),
    pageMode: 'A4-landscape-multipage',
  };
  const completed = await completeFaultReport(workspace.id, year, month, finalPdf, completedBy);
  return { report: completed, finalPdf, reused: false };
}
