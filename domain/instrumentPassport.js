import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

export const MAX_PASSPORT_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_PASSPORT_TOTAL_BYTES = 60 * 1024 * 1024;
export const MAX_PASSPORT_PAGES = 500;
export function passportError(message, code, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}
const normalized = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export function instrumentPassportKey(sheetName, instrument) {
  // Position and location can change; a serial-bearing instrument must survive row reordering.
  const identity = [normalized(sheetName), normalized(instrument.serial), normalized(instrument.brand), normalized(instrument.name)];
  if (!identity[1]) identity.push(normalized(instrument.pos));
  return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}
export const pdfChecksum = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export async function readPassportPdf(value, maxBytes = MAX_PASSPORT_UPLOAD_BYTES) {
  const bytes = Buffer.from(value || []);
  if (!bytes.length || bytes.length > maxBytes) throw passportError('PDF hajmi belgilangan chegaradan oshgan yoki fayl bo‘sh.', 'PASSPORT_PDF_SIZE_INVALID', 413);
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw passportError('Faqat haqiqiy PDF fayl yuklang.', 'PASSPORT_PDF_INVALID');
  let pdf;
  try { pdf = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch { throw passportError('PDF ochilmadi. Shifrlanmagan va buzilmagan fayl yuklang.', 'PASSPORT_PDF_UNREADABLE'); }
  const pages = pdf.getPageCount();
  if (!pages || pages > MAX_PASSPORT_PAGES) throw passportError('PDF 1–500 sahifadan iborat bo‘lishi kerak.', 'PASSPORT_PAGE_LIMIT');
  return { bytes, pdf, pageCount: pages, checksum: pdfChecksum(bytes) };
}
export async function mergePassportPdfs(documents) {
  const total = documents.reduce((sum, doc) => sum + doc.pdf.length, 0);
  if (total > MAX_PASSPORT_TOTAL_BYTES) throw passportError('Asbob hujjatlarining umumiy hajmi 60 MBdan oshgan.', 'PASSPORT_TOTAL_SIZE_LIMIT', 413);
  const output = await PDFDocument.create();
  for (const document of documents) {
    const { pdf } = await readPassportPdf(document.pdf);
    const pages = await output.copyPages(pdf, pdf.getPageIndices());
    for (const page of pages) output.addPage(page);
    if (output.getPageCount() > MAX_PASSPORT_PAGES) throw passportError('Yig‘ma pasport 500 sahifadan oshgan.', 'PASSPORT_PAGE_LIMIT');
  }
  const bytes = Buffer.from(await output.save());
  const verified = await readPassportPdf(bytes, MAX_PASSPORT_TOTAL_BYTES);
  return { bytes, pageCount: verified.pageCount, checksum: verified.checksum };
}
