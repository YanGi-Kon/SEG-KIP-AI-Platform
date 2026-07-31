import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { resolveEnvServiceAccount } from '../googleCredentialService.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function clean(value) {
  return String(value ?? '').trim();
}

function providerError(message, code, statusCode = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

function queryEscape(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function classifySharedDriveError(error) {
  if (/^(DRIVE_|GOOGLE_SERVICE_ACCOUNT_)/.test(String(error?.code || '')) && error?.statusCode) return error;
  const status = Number(error?.response?.status || error?.statusCode || error?.code || 0);
  const data = error?.response?.data || {};
  const reasons = Array.isArray(data?.error?.errors) ? data.error.errors : [];
  const reason = clean(reasons[0]?.reason);
  const text = `${error?.message || ''} ${JSON.stringify(data)}`;

  if (/drive api has not been used|accessNotConfigured|SERVICE_DISABLED|not enabled/i.test(text)) {
    return providerError(
      'Google Drive API yoqilmagan. Google Cloud Console’da Drive API’ni yoqing.',
      'DRIVE_API_DISABLED',
      400,
      { rawReason: reason },
    );
  }
  if (status === 404 || /File not found|notFound/i.test(text)) {
    return providerError(
      'Drive papka topilmadi yoki service account bilan ulashilmagan.',
      'DRIVE_FOLDER_NOT_FOUND',
      404,
      { rawReason: reason },
    );
  }
  if (status === 403 || /insufficientFilePermissions|forbidden|permission|denied/i.test(text)) {
    return providerError(
      'Service account Shared Drive papkasiga yozish huquqiga ega emas.',
      'DRIVE_WRITE_PERMISSION_DENIED',
      403,
      { rawReason: reason },
    );
  }
  if (/invalid_grant|invalid_credentials|private key|credential/i.test(text)) {
    return providerError(
      'Google service account credential noto‘g‘ri yoki eskirgan.',
      'GOOGLE_SERVICE_ACCOUNT_INVALID',
      400,
      { rawReason: reason },
    );
  }
  return providerError(
    'Google Shared Drive amali bajarilmadi.',
    'DRIVE_UPLOAD_FAILED',
    status >= 400 && status < 600 ? status : 400,
    { rawReason: reason },
  );
}

export class SharedDriveServiceAccountProvider {
  constructor({ drive, serviceAccount = {}, credentialSource = 'UNKNOWN' }) {
    this.drive = drive;
    this.serviceAccountEmail = clean(serviceAccount.client_email);
    this.serviceAccountProjectId = clean(serviceAccount.project_id);
    this.credentialSource = credentialSource;
  }

  async validateFolder(folderId, { writeTest = true } = {}) {
    try {
      const response = await this.drive.files.get({
        fileId: folderId,
        fields: 'id,name,mimeType,driveId,webViewLink,capabilities(canAddChildren,canEdit)',
        supportsAllDrives: true,
      });
      const folder = response.data || {};
      if (folder.mimeType !== FOLDER_MIME) {
        throw providerError('Kiritilgan ID Google Drive papka emas.', 'DRIVE_FOLDER_NOT_A_FOLDER');
      }
      if (!clean(folder.driveId)) {
        throw providerError(
          'Oddiy My Drive papkasi qo‘llab-quvvatlanmaydi. Service account bilan ishlash uchun Shared Drive papkasini tanlang.',
          'DRIVE_SHARED_DRIVE_REQUIRED',
          400,
          { recommendedFix: 'Google Workspace Shared Drive yarating va service account’ni Content manager sifatida qo‘shing.' },
        );
      }
      if (!folder.capabilities?.canAddChildren) {
        throw providerError(
          'Service account Shared Drive papkasiga fayl qo‘sha olmaydi.',
          'DRIVE_WRITE_PERMISSION_DENIED',
          403,
        );
      }

      let writeTestFileId = '';
      if (writeTest) {
        const created = await this.drive.files.create({
          requestBody: {
            name: `SEG-KIP-drive-test-${Date.now()}.txt`,
            mimeType: 'text/plain',
            parents: [folderId],
          },
          media: { mimeType: 'text/plain', body: Readable.from('SEG KIP Shared Drive write test') },
          fields: 'id',
          supportsAllDrives: true,
        });
        writeTestFileId = clean(created.data?.id);
        if (writeTestFileId) await this.deleteTemporaryFile(writeTestFileId);
      }

      return {
        ok: true,
        folderId: clean(folder.id) || folderId,
        folderName: clean(folder.name),
        folderUrl: clean(folder.webViewLink),
        driveId: clean(folder.driveId),
        canAddChildren: Boolean(folder.capabilities?.canAddChildren),
        canEdit: Boolean(folder.capabilities?.canEdit),
        provider: 'shared_drive_service_account',
        serviceAccountEmail: this.serviceAccountEmail,
        serviceAccountProjectId: this.serviceAccountProjectId,
        writeTestPassed: !writeTest || Boolean(writeTestFileId),
      };
    } catch (error) {
      throw classifySharedDriveError(error);
    }
  }

  async ensureSubfolder(rootFolderId, name) {
    const escaped = queryEscape(name);
    const listed = await this.drive.files.list({
      q: `'${rootFolderId}' in parents and trashed=false and mimeType='${FOLDER_MIME}' and name='${escaped}'`,
      fields: 'files(id,name,mimeType,driveId,webViewLink,parents)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
      pageSize: 10,
    });
    const existing = (listed.data.files || []).find((file) => clean(file.id));
    if (existing) return { folderId: clean(existing.id), folderName: clean(existing.name), created: false };

    const created = await this.drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [rootFolderId] },
      fields: 'id,name,driveId,webViewLink,parents',
      supportsAllDrives: true,
    });
    return { folderId: clean(created.data?.id), folderName: clean(created.data?.name) || name, created: true };
  }

  async uploadHtmlAsTemporaryDocument(parentFolderId, name, html) {
    const created = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.document',
        parents: [parentFolderId],
      },
      media: { mimeType: 'text/html', body: Readable.from(Buffer.from(html, 'utf8')) },
      fields: 'id',
      supportsAllDrives: true,
    });
    const fileId = clean(created.data?.id);
    if (!fileId) throw providerError('Vaqtinchalik Google Docs fayli yaratilmadi.', 'DRIVE_TEMP_DOCUMENT_FAILED');
    return fileId;
  }

  async exportDocumentToPdf(fileId) {
    const response = await this.drive.files.export(
      { fileId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(response.data || '');
  }

  async uploadPdf(parentFolderId, name, buffer) {
    const created = await this.drive.files.create({
      requestBody: { name, mimeType: 'application/pdf', parents: [parentFolderId] },
      media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
      fields: 'id,name,webViewLink,driveId,parents',
      supportsAllDrives: true,
    });
    const fileId = clean(created.data?.id);
    return {
      fileId,
      url: clean(created.data?.webViewLink) || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : ''),
    };
  }

  async deleteTemporaryFile(fileId) {
    if (!clean(fileId)) return;
    await this.drive.files.delete({ fileId, supportsAllDrives: true }).catch(() => {});
  }
}

export async function createSharedDriveProvider() {
  const { serviceAccount, credentialSource } = resolveEnvServiceAccount();
  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  await auth.authorize();
  const drive = google.drive({ version: 'v3', auth });
  return new SharedDriveServiceAccountProvider({ drive, serviceAccount, credentialSource });
}
