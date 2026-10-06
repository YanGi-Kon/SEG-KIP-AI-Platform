import { mergePassportPdfs, normalizePassportFilename, passportError } from '../domain/instrumentPassport.js';
import { createWorkspaceDriveProvider } from './workspaceDriveFolderService.js';
import { findWorkspaceById } from '../repositories/workspaceRepository.js';
import * as repository from '../repositories/instrumentPassportRepository.js';

export function ulchovFolderId(workspace) {
  return String(workspace?.moduleSettings?.ulchov_final_documents_folder_id || workspace?.finalDocumentsFolderId || '').trim();
}
export function passportFailureRetryable(error) {
  if (/^PASSPORT_|^WORKSPACE_SECRET_|^WORKSPACE_ENCRYPTION_KEY_|^GOOGLE_SERVICE_ACCOUNT_/.test(String(error.code || ''))) return false;
  const status = Number(error.statusCode || error.response?.status || error.code);
  if (status === 429 || status >= 500) return true;
  if (/^DRIVE_/.test(String(error.code || ''))) return error.code === 'DRIVE_APPS_SCRIPT_TIMEOUT' || error.code === 'DRIVE_UPLOAD_RESULT_INVALID';
  return true;
}
const safeName = value => String(value || 'Asbob').replace(/[\\/:*?"<>|]/g,'-').slice(0,70);

// Also used by behavior tests with a Drive adapter and durable repository double.
export async function buildPassportJob(job, { repo = repository, providerFactory = createWorkspaceDriveProvider, workspaceLoader = findWorkspaceById, folderLock = async fn => fn() } = {}) {
  const {passport,documents} = await repo.loadPassportBuild(job);
  if (passport.published_version >= job.payload.version) {
    await repo.completePassportJob(job,{obsolete:true});
    return {obsolete:true};
  }
  if (!documents.length || documents.length !== job.payload.version) throw passportError('Pasport hujjatlarining ketma-ketligi to‘liq emas.', 'PASSPORT_DOCUMENTS_INCOMPLETE');
  const workspace = await workspaceLoader(job.workspace_id);
  if (!workspace || workspace.status === 'archived') throw passportError('Workspace topilmadi.', 'PASSPORT_WORKSPACE_NOT_FOUND',404);
  const provider = await providerFactory(workspace);
  await provider.passportCapabilities();
  const root = job.payload.rootFolderId;
  if (!root) throw passportError('6. ЯКУНИЙ ҲУЖЖАТЛАР oynasida Drive papkasini kiriting.', 'PASSPORT_FOLDER_REQUIRED');
  await provider.validateFolder(root,{writeTest:false});
  // Avoid duplicate shared folders when workers on different servers start together.
  const folders = await folderLock(async () => {
    const base = await provider.ensureSubfolder(root,'PASPORTLAR');
    const instrument = await provider.ensureSubfolder(base.folderId,`${safeName(passport.instrument.serial || passport.instrument.name)}-${passport.id}`);
    const originals = await provider.ensureSubfolder(instrument.folderId,'ORIGINALS');
    const archive = await provider.ensureSubfolder(instrument.folderId,'ARCHIVE');
    const current = await provider.ensureSubfolder(instrument.folderId,'CURRENT');
    return {originals:originals.folderId,archive:archive.folderId,current:current.folderId};
  });
  const merged = await mergePassportPdfs(documents);
  for (const document of documents) {
    if (document.drive_file_id && passport.output_root_id === root) continue;
    const name=`${document.sequence}-${safeName(normalizePassportFilename(document.filename))}`;
    const saved = await provider.savePassportPdf(folders.originals,/\.pdf$/i.test(name)?name:`${name}.pdf`,document.pdf,`original:${document.id}`);
    await repo.recordPassportOriginal(document.id,saved.fileId);
  }
  if (passport.merged_pdf && passport.published_version > 0) {
    await provider.savePassportPdf(folders.archive,`pasport-v${passport.published_version}.pdf`,passport.merged_pdf,`archive:${passport.id}:${passport.published_version}`);
  }
  const saved = await provider.savePassportPdf(folders.current,'pasport.pdf',merged.bytes,`current:${passport.id}`);
  await repo.completePassportJob(job,{...saved,...merged,folderId:folders.current});
  return {fileId:saved.fileId,url:saved.url,pageCount:merged.pageCount};
}
