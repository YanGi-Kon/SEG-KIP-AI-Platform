import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

export const MAX_PASSPORT_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_PASSPORT_TOTAL_BYTES = 60 * 1024 * 1024;
export const MAX_PASSPORT_PAGES = 500;

const CP1252_REVERSE = new Map([
  ['€',0x80],['‚',0x82],['ƒ',0x83],['„',0x84],['…',0x85],['†',0x86],['‡',0x87],['ˆ',0x88],
  ['‰',0x89],['Š',0x8a],['‹',0x8b],['Œ',0x8c],['Ž',0x8e],['‘',0x91],['’',0x92],['“',0x93],
  ['”',0x94],['•',0x95],['–',0x96],['—',0x97],['˜',0x98],['™',0x99],['š',0x9a],['›',0x9b],
  ['œ',0x9c],['ž',0x9e],['Ÿ',0x9f],
]);
export function normalizePassportFilename(value) {
  const raw = String(value ?? '').trim();
  if (!raw || !/[ÃÂÐÑ]/.test(raw)) return raw;
  const bytes = [];
  for (const char of raw) {
    const point = char.codePointAt(0);
    if (point <= 255) bytes.push(point);
    else if (CP1252_REVERSE.has(char)) bytes.push(CP1252_REVERSE.get(char));
    else return raw;
  }
  const decoded = Buffer.from(bytes).toString('utf8');
  if (!decoded || decoded.includes('\uFFFD')) return raw;
  return decoded;
}
export const MAX_PASSPORT_UPLOAD_FILES = 20;
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
  if (documents.length === 1) {
    const source = await readPassportPdf(documents[0].pdf, MAX_PASSPORT_TOTAL_BYTES);
    return {bytes:source.bytes,pageCount:source.pageCount,checksum:source.checksum};
  }
  const output = await PDFDocument.create();
  output.setCreationDate(new Date(0));
  output.setModificationDate(new Date(0));
  for (const document of documents) {
    const { pdf } = await readPassportPdf(document.pdf, MAX_PASSPORT_TOTAL_BYTES);
    const pages = await output.copyPages(pdf, pdf.getPageIndices());
    for (const page of pages) output.addPage(page);
    if (output.getPageCount() > MAX_PASSPORT_PAGES) throw passportError('Yig‘ma pasport 500 sahifadan oshgan.', 'PASSPORT_PAGE_LIMIT');
  }
  const bytes = Buffer.from(await output.save());
  const verified = await readPassportPdf(bytes, MAX_PASSPORT_TOTAL_BYTES);
  return { bytes, pageCount: verified.pageCount, checksum: verified.checksum };
}

export async function preparePassportUpload(files) {
  if (!files?.length || files.length > MAX_PASSPORT_UPLOAD_FILES) throw passportError('1–20 ta JPG yoki PDF tanlang.', 'PASSPORT_FILES_REQUIRED');
  if (files.reduce((sum,file)=>sum+file.buffer.length,0)>MAX_PASSPORT_TOTAL_BYTES) throw passportError('Tanlangan fayllar jami 60 MBdan oshmasin.', 'PASSPORT_TOTAL_SIZE_LIMIT',413);
  const documents=[];
  for (const file of files) {
    const bytes=Buffer.from(file.buffer);
    if (!bytes.length || bytes.length>MAX_PASSPORT_UPLOAD_BYTES) throw passportError('Har bir fayl 15 MBgacha bo‘lsin.', 'PASSPORT_PDF_SIZE_INVALID',413);
    if (/\.pdf$/i.test(file.originalname)) {
      documents.push({pdf:(await readPassportPdf(bytes)).bytes});
    } else if (/\.jpe?g$/i.test(file.originalname)) {
      if (bytes[0]!==255 || bytes[1]!==216 || bytes[2]!==255) throw passportError('JPG fayli buzilgan.', 'PASSPORT_JPG_INVALID');
      try {
        const pdf=await PDFDocument.create();
        pdf.setCreationDate(new Date(0));pdf.setModificationDate(new Date(0));
        // pdf-lib reads JPEG data through its backing ArrayBuffer; avoid pooled Buffer offsets.
        const jpg=await pdf.embedJpg(Uint8Array.from(bytes));
        if (!jpg.width || !jpg.height || jpg.width*jpg.height>100000000) throw new Error('dimensions');
        const landscape=jpg.width>jpg.height;
        const page=pdf.addPage(landscape?[841.89,595.28]:[595.28,841.89]);
        const scale=Math.min((page.getWidth()-40)/jpg.width,(page.getHeight()-40)/jpg.height);
        const width=jpg.width*scale,height=jpg.height*scale;
        page.drawImage(jpg,{x:(page.getWidth()-width)/2,y:(page.getHeight()-height)/2,width,height});
        documents.push({pdf:Buffer.from(await pdf.save())});
      } catch {throw passportError('JPG ochilmadi. Buzilmagan JPG tanlang.', 'PASSPORT_JPG_INVALID');}
    } else throw passportError('Faqat JPG va PDF fayllar tanlang.', 'PASSPORT_FILE_TYPE_INVALID');
  }
  const merged=await mergePassportPdfs(documents);
  return readPassportPdf(merged.bytes,MAX_PASSPORT_TOTAL_BYTES);
}
