# SEG-KIP-AI Platform — AI Handoff va Texnik Dokumentatsiya

**Snapshot sanasi:** 2026-08-05  
**Repository:** `YanGi-Kon/SEG-KIP-AI-Platform`  
**Asosiy branch / source of truth:** `dev_ab`  
**Production domen:** `https://app.sanegplatform.uz`  
**Platform:** Node.js + Express + PostgreSQL + Google Sheets + Google Drive + Resend/SMTP + OpenAI

---

## 0. Boshqa AI uchun qat’iy ishlash qoidalari

1. Faqat `dev_ab` branchni authoritative source deb oling.
2. Yangi branch, Pull Request yoki merge yaratmang, foydalanuvchi aniq buyurmaguncha.
3. `main` mavjud deb taxmin qilmang.
4. Repo ichidagi boshqa `agent/*` yoki `codex/*` branchlarni source of truth sifatida ishlatmang.
5. Har qanday o‘zgarishdan oldin joriy `dev_ab` faylini qayta fetch qiling.
6. Login, auth, workspace isolation, Google credential, approval va Sheets oqimlariga tegishda cross-workspace xavfsizligini tekshiring.
7. Secretlarni hech qachon log, commit, screenshot yoki javobda ko‘rsatmang.
8. Service Account JSON frontend/localStorage’da saqlanmasligi kerak.
9. O‘zgarish minimal, professional va orqaga mos bo‘lsin.
10. Har bir fixdan keyin `npm run check`, `npm test`, zarur bo‘lsa `npm run db:migrate:dry` bajarilsin.
11. Production ishladi deb faqat real deploy/test bo‘lsa ayting.
12. Screenshotdagi joylashuv talabini koddan taxmin qilmang; user bilan aniq UX qarorini tasdiqlang.

---

## 1. Loyihaning biznes maqsadi

SEG-KIP-AI Platform sanoat KIP va o‘lchov vositalari uchun ko‘p obyektli raqamli platforma.

Asosiy funksiyalar:

- jurnal uchyoti;
- o‘lchov vositalari reyestri;
- ACT / dalolatnoma yaratish;
- nosozliklar jurnali;
- texnik xizmat ko‘rsatish jurnali;
- almashtirish jurnali;
- foydalanuvchilar va rollar;
- Google Sheets asosidagi operatsion ma’lumotlar;
- hujjatga tayinlangan tasdiqlovchilarga email yuborish;
- elektron imzo PNG rasmini hujjatga joylash;
- barcha tasdiqlovchilar rozilik bildirgach final PDF yaratish;
- PDF’ni workspace uchun sozlangan Google Drive papkasiga saqlash.

---

## 2. Repository holati

Repository default branch: `dev_ab`.

Branch qidiruvida ko‘ringan branchlar:

- `dev_ab`
- `agent/free-personal-drive-export`
- `codex/fix-drive-unicode-approval-confirmation`
- `codex/load-workspace-ui`
- `codex/workspace-member-management`

**Muhim:** boshqa AI faqat `dev_ab` bilan ishlashi kerak. Qolgan branchlar tajriba yoki agent branchlari bo‘lishi mumkin.

Root `README.md` hozir topilmadi. Shu hujjat vaqtincha asosiy AI handoff dokumentatsiyasi hisoblanadi.

---

## 3. Texnologik stack

### Backend

- Node.js ESM (`"type": "module"`)
- Express
- PostgreSQL (`pg`)
- Socket.IO
- Google APIs (`googleapis`)
- JWT (`jsonwebtoken`)
- Nodemailer
- Resend HTTP API
- Multer
- Helmet
- CORS
- OpenAI SDK

### Frontend

- Vanilla HTML/CSS/JavaScript
- asosiy shell: `public/index.html`
- modul iframe’lari: `public/modules/*.html`
- modul JS: `public/js/*.js`
- ACT moduli alohida HTML/JS orqali yuklanadi.

### Runtime

- Railway
- `PORT` environment variable
- production domen: `app.sanegplatform.uz`

---

## 4. Ishga tushirish va tekshirish komandalar

```bash
npm install
npm start
npm run check
npm test
npm run ci
npm run db:migrate:dry
npm run db:migrate
```

### `npm run check`

Syntax check quyidagi qatlamlarni tekshiradi:

- server/config/domain;
- DB/migrations;
- auth/workspace middleware;
- repositories;
- workspace/signature/Drive/PDF services;
- routes;
- frontend JS.

### Server start

```bash
node server.js
```

Server start jarayoni:

1. `.env` o‘qiladi.
2. DB sozlangan bo‘lsa migrationlar avtomatik ishlaydi.
3. final PDF worker start qilishga urinadi.
4. HTTP server `PORT` da ishga tushadi.

Worker faqat `OUTBOX_WORKER_ENABLED=true` bo‘lsa ishlaydi.

---

## 5. Yuqori darajadagi arxitektura

```text
Browser UI
   |
   | Access JWT + workspaceId
   v
Express API
   |
   +--> PostgreSQL
   |      - users
   |      - sessions
   |      - workspaces
   |      - workspace_members
   |      - workspace signers/signatures
   |      - encrypted Personal Drive config
   |      - outbox_jobs
   |
   +--> Google Sheets
   |      - asosiy operatsion varoq
   |      - АКТЛАР_КУНЛИК
   |      - АКТЛАР_РЕЕСТР
   |      - ИМЗО_ЧЕКУВЧИЛАР
   |      - ҲУЖЖАТ_ТАСДИҚЛАШ
   |      - АУДИТ_ЛОГ
   |
   +--> Email
   |      - Resend HTTP, afzal
   |      - SMTP/Nodemailer fallback
   |
   +--> Google Drive
          - Shared Drive + Service Account
          - yoki Personal Drive + Apps Script provider
          - PNG imzolar
          - final PDF hujjatlar
```

---

## 6. Hozirgi “source of truth” taqsimoti

### PostgreSQL

- platform foydalanuvchilari;
- access/refresh sessionlar;
- workspace konfiguratsiyasi;
- workspace membership va rollar;
- workspace signer metadata;
- signature metadata yoki binary storage qatlamlari;
- Personal Drive Apps Script URL va encrypted secret;
- final PDF outbox joblar;
- retry/idempotency holatlari.

### Google Sheets

- operatsion asosiy varoq;
- ACT blank ko‘rinishi;
- ACT registry;
- approval rows;
- signer compatibility mirror;
- status va linklar;
- `a4Html` va `a4Json`.

### Google Drive

- signer PNG fayllari;
- final tasdiqlangan PDF;
- final PDF uchun `ХУЖАТЛАР` subfolder;
- Shared Drive yoki Apps Script orqali Personal Drive.

---

## 7. Asosiy folder/fayl xaritasi

```text
server.js
config/
  env.js

db/
  pool.js
  migrate.js
  migrations/

domain/
  workspace.js
  workspaceMember.js
  permissions.js

middleware/
  auth.js
  featureGate.js
  workspaceAccess.js

repositories/
  userRepository.js
  sessionRepository.js
  workspaceRepository.js
  workspaceSignerRepository.js
  workspaceSignatureRepository.js
  outboxRepository.js

services/
  authService.js
  workspaceService.js
  workspaceGoogleService.js
  workspaceSignerService.js
  workspaceSignatureService.js
  workspaceDriveFolderService.js
  workspaceApprovalBridgeService.js
  signatureApprovalService.js
  actBlankSheetService.js
  finalPdfExportService.js
  finalPdfExportWorker.js
  emailDiagnosticsService.js
  httpEmailService.js
  googleSheetsService.js
  googleCredentialService.js
  workspaceSecretService.js
  driveProviders/
    sharedDriveServiceAccountProvider.js
    appsScriptPersonalDriveProvider.js

routes/
  health.js
  auth.js
  roles.js
  users.js
  workspaces.js
  acts.js
  signatures.js
  chat.js
  project.js
  base.js
  workbook.js
  menu.js
  ulchov.js
  kuduk.js
  backup.js

public/
  index.html
  css/style.css
  modules/
    acts.html
    ulchov.html
    ...
  js/
    workspace-api-client.js
    workspace-ui.js
    acts.js
    acts-final-documents-folder.js
    acts-personal-drive-settings.js
    acts-workspace-signers.js
    acts-workspace-documents.js
    ...
```

---

## 8. `server.js` vazifasi

`server.js`:

- Express va Socket.IO yaratadi;
- Helmet’ni CSP o‘chirilgan holda ulaydi;
- CORS’ni hozircha ochiq ulaydi;
- JSON limitni 30 MB qiladi;
- HTML va JS uchun `no-store/no-cache` header qo‘yadi;
- `/` sahifaga login gate va settings persistence scriptlarini inject qiladi;
- public assets va static frontendni beradi;
- route guruhlarini mount qiladi;
- DB migrationni start paytda bajaradi;
- final PDF worker start qiladi;
- global API error handler ishlatadi.

### Mount qilingan route guruhlari

```text
/api/health
/api/auth
/api/roles
/api/users
/api/workspaces
/api/chat
/api/project
/api/base
/api/workbook
/api/menu
/api/acts
/api/ulchov
/api
/api/kuduk
/api/backup
```

`routes/signatures.js` `/api` rootga mount qilingan.

---

## 9. Muhit o‘zgaruvchilari

### Runtime

```env
NODE_ENV=production
PORT=8080
PUBLIC_BASE_URL=https://app.sanegplatform.uz
APP_TIME_ZONE=Asia/Tashkent
CORS_ALLOWED_ORIGINS=https://app.sanegplatform.uz
```

### Feature flags

```env
WORKSPACE_MODE_ENABLED=true
LEGACY_CONFIG_ENABLED=true
AUTH_REQUIRED=true
OUTBOX_WORKER_ENABLED=true
FINAL_PDF_WORKER_INTERVAL_MS=5000
```

**Kritik:** `OUTBOX_WORKER_ENABLED=false` bo‘lsa approval tugagandan keyin job queue’ga tushadi, ammo final PDF worker uni ishlamaydi.

### PostgreSQL

```env
DATABASE_URL=
DATABASE_SSL=
DATABASE_POOL_MAX=10
DATABASE_IDLE_TIMEOUT_MS=30000
DATABASE_CONNECTION_TIMEOUT_MS=10000
DATABASE_STATEMENT_TIMEOUT_MS=30000
```

### Google platform credential

```env
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_SERVICE_ACCOUNT_BASE64=
```

Workspace mode yoqilganda platform Service Account talab qilinadi.

### Legacy Google fallback

```env
GOOGLE_SPREADSHEET_URL=
GOOGLE_SHEETS_ID=
SIGNATURE_DRIVE_FOLDER_ID=
```

Bu qiymatlar yangi multi-workspace flow uchun asosiy source bo‘lmasligi kerak.

### JWT va encryption

```env
ACCESS_TOKEN_SECRET=
REFRESH_TOKEN_SECRET=
APPROVAL_JWT_SECRET=
ADMIN_JWT_SECRET=
WORKSPACE_ENCRYPTION_KEY=
APPROVAL_TOKEN_TTL=7d
SIGNATURE_IMAGE_TOKEN_TTL=365d
```

- Secretlar kamida 32 belgi.
- `WORKSPACE_ENCRYPTION_KEY` o‘zgartirilsa oldin encrypted qilingan Personal Drive secretlarini ochib bo‘lmaydi.

### Email — Resend

```env
RESEND_API_KEY=
EMAIL_FROM=no-reply@mail.sanegplatform.uz
```

**Dokumentatsiya bo‘shlig‘i:** joriy `.env.example` ichida Resend qiymatlari ko‘rsatilmagan, lekin kod ularni qo‘llaydi.

### Email — SMTP fallback

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

### OpenAI

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

---

## 10. Authentication va session arxitekturasi

### Endpointlar

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
```

### Session modeli

- Access token Authorization Bearer orqali.
- Refresh token `seg_kip_refresh` HttpOnly cookie.
- Productionda `secure=true`.
- `sameSite=strict`.
- Refresh token rotation ishlatiladi.

### Frontend

`public/js/workspace-api-client.js`:

- `seg_kip_workspace_access_token` ni sessionStorage’dan oladi;
- `seg_kip_selected_workspace_id` ni localStorage’dan oladi;
- 401 bo‘lsa `/api/auth/refresh` orqali tokenni yangilaydi;
- requestni bir marta retry qiladi.

---

## 11. Workspace modeli

```js
{
  id,
  ownerId,
  name,
  slug,
  spreadsheetId,
  spreadsheetUrl,
  mainSheetName,
  driveFolderId,
  finalDocumentsFolderId,
  timeZone,
  status,
  isDefault,
  memberRole,
  memberStatus,
  createdAt,
  updatedAt
}
```

### Status

```text
draft
active
disabled
archived
```

### Workspace rollari

```text
owner
administrator
operator
engineer
department_manager
viewer
```

### Permission xulosasi

- owner: workspace/members/signers/documents/audit to‘liq;
- administrator: ownerga yaqin, archive yo‘q;
- operator: document read/create/send;
- engineer: document read/create;
- department_manager: document read/send va audit;
- viewer: read-only.

---

## 12. Workspace API

### Workspace CRUD

```text
POST   /api/workspaces
GET    /api/workspaces
GET    /api/workspaces/:workspaceId
PUT    /api/workspaces/:workspaceId
DELETE /api/workspaces/:workspaceId
POST   /api/workspaces/:workspaceId/test
```

### Membership

```text
GET    /api/workspaces/:workspaceId/members
POST   /api/workspaces/:workspaceId/members
PUT    /api/workspaces/:workspaceId/members/:memberId
DELETE /api/workspaces/:workspaceId/members/:memberId
```

### Signer

```text
GET    /api/workspaces/:workspaceId/signers
POST   /api/workspaces/:workspaceId/signers
PUT    /api/workspaces/:workspaceId/signers/:signerId
DELETE /api/workspaces/:workspaceId/signers/:signerId
```

### Signature folder va PNG

```text
PUT  /api/workspaces/:workspaceId/signers/signature-folder
POST /api/workspaces/:workspaceId/signers/signature-folder/test
POST /api/workspaces/:workspaceId/signers/signature
GET  /api/workspaces/:workspaceId/signers/signature/:signatureId
```

PNG:

- haqiqiy PNG magic bytes bilan tekshiriladi;
- maksimal 2 MB;
- workspace permission bilan himoyalangan.

### Document approval send

```text
POST /api/workspaces/:workspaceId/documents/send
POST /api/workspaces/:workspaceId/documents/email/test
```

### Final documents folder

```text
PUT  /api/workspaces/:workspaceId/documents/final-folder
POST /api/workspaces/:workspaceId/documents/final-folder/test
```

### Personal Drive

```text
GET /api/workspaces/:workspaceId/documents/personal-drive
PUT /api/workspaces/:workspaceId/documents/personal-drive
```

### Final PDF retry

```text
POST /api/workspaces/:workspaceId/documents/final-pdf-jobs/:jobId/retry
```

---

## 13. ACT API

```text
POST /api/acts/settings/test
POST /api/acts/monthly-analysis
POST /api/acts/create
POST /api/acts/reports/daily
```

### Monthly analysis

- workspace main sheet’dan `A:J` o‘qiydi;
- I ustundagi `ТО-2`, `ТО2`, `ACT`, `AKT` qiymatlarini target deb oladi;
- `sourceKey` bo‘yicha yaratilgan ACT bilan solishtiradi;
- KPI: totalRows, plannedDocuments, createdDocuments, completionPercentage.

### ACT create

1. `АКТЛАР_КУНЛИК` ga blank blok yozadi;
2. `АКТЛАР_РЕЕСТР` ga metadata yozadi;
3. `a4Html` va `a4Json` saqlaydi;
4. `sourceKey` bilan complete holatini boshqaradi.

---

## 14. Google Sheets varaqlari

### `АКТЛАР_КУНЛИК`

- foydalanuvchiga ko‘rinadigan rasmiy blank blok;
- header;
- ACT raqami;
- signer placeholder;
- 1–5 bandlar;
- xulosa;
- approval summary uchun K:O maydonlari.

### `АКТЛАР_РЕЕСТР`

Bazaviy maydonlar:

```text
actNo
sourceSheet
sourceRowNumber
sourceKey
status
rowStart
createdAt
date
deviceName
serialNo
place
executor
a4Html
a4Json
```

Final PDF maydonlari:

```text
finalPdfFileId
finalPdfUrl
finalApprovedAt
finalPdfStatus
```

Final maydonlar O:R ustunlarda saqlanadi.

### `ИМЗО_ЧЕКУВЧИЛАР`

```text
ID
Lavozimi
FIO
ImzoPNG
Gmail
CreatedAt
```

Workspace DB signer registry’dan Sheetga sync qilinadi.

### `ҲУЖЖАТ_ТАСДИҚЛАШ`

```text
ID
ActNo
SignerID
Lavozimi
FIO
Gmail
Status
ApprovalLink
TokenHash
CreatedAt
OpenedAt
ApprovedAt
IP
UserAgent
SignatureFileId
```

### `АУДИТ_ЛОГ`

Legacy signer va approval audit hodisalari.

---

## 15. ACT frontend

Asosiy fayllar:

```text
public/modules/acts.html
public/js/acts.js
public/js/workspace-api-client.js
public/js/acts-final-documents-folder.js
public/js/acts-personal-drive-settings.js
```

### Current `dev_ab` top tabs

```text
1. Ойлик анализ
2. Хужат яратиш
3. Хисоботлар
4. Excel
5. ИМЗО ЧЕКУВЧИЛАР
6. ЯКУНИЙ ҲУЖЖАТЛАР
```

Current kod final folder sozlamasini alohida modalda ko‘rsatadi:

```text
#finalDocumentsFolderModal
#finalDocumentsFolderPanel
```

### Muhim ochiq UX ziddiyati

Foydalanuvchi oldingi screenshotda final Drive folder inputini ACT bosh sahifasining yuqori o‘ng bo‘sh joyida ko‘rishni xohlagan.

Joriy `dev_ab` esa:

- `6. ЯКУНИЙ ҲУЖЖАТЛАР` tugmasi;
- alohida modal;
- modal ichida folder input

modelini ishlatadi.

**Boshqa AI o‘zgarish kiritishdan oldin userdan qaysi UX final ekanini aniq tasdiqlashi kerak.**

### Production mismatch

Foydalanuvchining oxirgi production screenshotida `6. ЯКУНИЙ ҲУЖЖАТЛАР` tugmasi ko‘rinmagan.

Ammo current `dev_ab` `acts.html` ichida bu tugma mavjud.

Ehtimollar:

1. Railway eski commitni deploy qilgan;
2. Railway boshqa branchni kuzatyapti;
3. deployment waiting/failed;
4. production module HTML joriy branchdan kelmayapti.

Server HTML/JS uchun no-cache beradi. Shu sabab faqat browser cache deb taxmin qilish yetarli emas.

### Final folder JS mount

`acts-final-documents-folder.js` panelni dinamik yaratmaydi. U `#finalDocumentsFolderPanel` HTML ichida mavjud bo‘lishini kutadi.

Agar productiondagi `acts.html` eski bo‘lsa:

```js
if (!panel) return { mounted:false, created:false };
```

bo‘lib UI chiqmaydi.

---

## 16. Approver assignment biznes qoidasi

Email workspace’dagi barcha signerga yuborilmasligi kerak.

Faqat hujjat metadata’sidagi:

```js
assignedApprovers: [
  {
    slot,
    signerId,
    fio,
    position,
    gmail,
    department
  }
]
```

ro‘yxatidan resolve qilingan signerlar target bo‘ladi.

Resolve tartibi:

1. signerId;
2. email;
3. FIO + position;
4. FIO.

Dedupe signer ID yoki email bo‘yicha.

Valid approver bo‘lmasa:

```text
Hujjatga approver biriktirilmagan
```

---

## 17. Email arxitekturasi

### Provider tanlash

1. `RESEND_API_KEY` mavjud bo‘lsa Resend HTTP;
2. aks holda SMTP/Nodemailer.

### Resend

```env
RESEND_API_KEY=
EMAIL_FROM=
```

`EMAIL_FROM` verified domain email bo‘lishi kerak.

### SMTP diagnostika

```text
POST /api/workspaces/:workspaceId/documents/email/test
```

Safe fields:

- rawCode;
- rawErrno;
- rawSyscall;
- responseCode;
- recommendedFix.

Secret log qilinmaydi.

### Approval email

Subject unique:

```text
Tasdiqlash talab qilinadi — actNo — workspace — approver — deliveryTag
```

HTML:

- `Hujjatni ochish va tasdiqlash` tugmasi;
- tugma ko‘rinmasa plain URL;
- obyekt;
- hujjat;
- imzolovchi.

---

## 18. Approval workflow

### Send

```text
POST /api/workspaces/:workspaceId/documents/send
```

Oqim:

1. Email provider tayyorligini tekshiradi.
2. Final documents folderni tekshiradi.
3. DB signer registry’ni `ИМЗО_ЧЕКУВЧИЛАР` Sheetga sync qiladi.
4. `АКТЛАР_РЕЕСТР` dan hujjatni topadi.
5. `a4Json.assignedApprovers` ni resolve qiladi.
6. Har approver uchun JWT link yaratadi.
7. `ҲУЖЖАТ_ТАСДИҚЛАШ` ga row yozadi/update qiladi.
8. Email yuboradi.
9. Registry va daily statusni yangilaydi.

### Muhim current behavior

`sendWorkspaceDocumentForApproval()` email yuborishdan oldin:

```js
testWorkspaceFinalDocumentsFolder(workspace, { writeTest: false })
```

chaqiradi.

Demak final folder sozlanmagan yoki noto‘g‘ri bo‘lsa approval email ham to‘xtashi mumkin.

Bu oldingi “approval folder bo‘lmasa ham ishlasin” talabiga zid bo‘lishi mumkin. Product qarori user bilan tekshirilishi kerak.

### Public approval

```text
GET  /api/document/approve/:token
POST /api/document/approve
```

GET A4 preview render qiladi.

POST:

- CSRF/token tekshiradi;
- approvalni tasdiqlaydi;
- hujjat HTML’ini signer section bilan yangilaydi;
- barcha approvallar tugasa final PDF outbox job enqueue qiladi.

---

## 19. Final PDF export

### Trigger

Approval natijasi `Тасдиқланди` bo‘lsa va token `workspaceId` saqlasa outbox job yaratiladi.

Legacy token workspaceId saqlamasa tenantlar bo‘yicha global qidiruv qilinmaydi.

### Queue

Idempotency key:

```text
final-pdf:{workspaceId}:{actNo}:v1
```

Job:

```text
job_type = final_pdf_export
max_attempts = 6
```

Statuslar:

```text
pending
processing
completed
failed_retryable
failed_permanent
```

Retry exponential backoff, maksimal 3600 sekund.

### Worker

Worker faqat:

```text
DATABASE_URL mavjud
OUTBOX_WORKER_ENABLED=true
```

bo‘lsa ishlaydi.

### Export service oqimi

1. workspaceId bilan workspace topadi;
2. `АКТЛАР_РЕЕСТР` dan actNo bo‘yicha hujjatni topadi;
3. `finalDocumentsFolderId` ni tekshiradi;
4. oldin `EXPORTED + fileId` bo‘lsa skip qiladi;
5. Drive provider tanlaydi;
6. root papka ichida `ХУЖАТЛАР` subfolder topadi/yaratadi;
7. `updatedHtml` yoki `a4Html` dan PDF tayyorlaydi;
8. PDF upload qiladi;
9. registry O:R ni update qiladi.

### Registry final statuslari

```text
EXPORTED
EXPORT_SKIPPED_NO_FOLDER
EXPORT_FAILED
```

---

## 20. Google Drive providerlar

### A. Shared Drive + Service Account

Default provider.

Talab:

- Google Workspace Shared Drive;
- Service Account Shared Drive’da Content manager;
- root folder ID;
- `supportsAllDrives=true`.

Oddiy My Drive papkasi rad qilinadi:

```text
DRIVE_SHARED_DRIVE_REQUIRED
```

### B. Personal Drive + Apps Script

Workspace uchun Personal Drive config mavjud bo‘lsa shu provider ustun keladi.

Workspace’da:

- Apps Script `/exec` URL;
- encrypted webhook secret.

Secret:

- kamida 32 belgi;
- `WORKSPACE_ENCRYPTION_KEY` bilan encrypted;
- frontendga qayta chiqarilmaydi.

Request HMAC SHA-256 bilan imzolanadi.

Actions:

```text
validate_folder
ensure_subfolder
render_and_upload_pdf
```

### Frontend Personal Drive panel

`acts-personal-drive-settings.js`:

- `finalDocumentsFolderPanel` dan keyin mount bo‘ladi;
- owner/administrator sozlaydi;
- Apps Script URL;
- secret;
- ulash/uzish.

---

## 21. A4 hujjat template

ACT preview:

- Times New Roman;
- A4 210 × 297 mm;
- ko‘k service header;
- markaziy `ДАЛОЛАТНОМА №`;
- subtitle;
- signer placeholder;
- 1–5 bandlar;
- xulosa;
- electronic approver section alohida inject qilinadi.

### Legacy manual signature cleanup

Eski bloklar sanitizer bilan tozalanadi:

```text
Имзолар:
_____
(Лавозими)
(Имзо)
(Ф.И.Ш.)
```

### Muhim

ACT template bir nechta qatlamda mavjud:

- frontend preview;
- Google Sheets blank generator;
- approval preview CSS;
- saved `a4Html`.

Template fix hammasida regression test talab qiladi.

---

## 22. Frontend asosiy shell

`public/index.html`:

- chap sidebar;
- 8 ta modul;
- `openModulePage()` orqali iframe;
- ACT module `modules/acts.html`;
- O‘lchov vositalari `modules/ulchov.html`;
- AI assistant panel;
- users/roles modullari.

ACT module parent iframe ichida workspace ID/tokenni parent storage’dan ham o‘qiy oladi.

---

## 23. Health va readiness

```text
GET /api/health
GET /api/health/readiness
```

`/api/health` OpenAI connected yoki demo-mode qaytaradi.

`/api/health/readiness` DB required/configured/connected va latency holatini qaytaradi.

---

## 24. DB migration tizimi

- `db/migrations/` ichidagi raqam bilan boshlanadigan `.sql` fayllar tartib bilan ishlaydi.
- `schema_migrations` table filename/checksum/applied_at saqlaydi.
- Applied migration edit qilinsa checksum mismatch bilan start to‘xtaydi.
- PostgreSQL advisory lock ishlatiladi.
- Har migration alohida transaction.

Qoidalar:

- Applied migrationni edit qilmang.
- Yangi additive migration yarating.
- Avval dry-run.
- Destructive migration user tasdig‘isiz yo‘q.

---

## 25. Xavfsizlik qoidalari

1. Service Account private key browserga yuborilmasin.
2. `GOOGLE_SERVICE_ACCOUNT_*` faqat backend/Railway.
3. Workspace authenticated membership orqali resolve qilinsin.
4. Approval token workspaceId saqlashi kerak.
5. Cross-workspace fallback search taqiqlangan.
6. PNG MIME + magic bytes + size tekshiriladi.
7. Access/refresh token log qilinmasin.
8. Refresh token HttpOnly cookie.
9. Personal Drive secret encrypted.
10. Error response safe bo‘lsin.
11. File URL/ID normalized ID sifatida saqlansin.

### Current security caveat

`server.js` hozir:

```js
app.use(cors())
```

va Socket.IO:

```js
cors: { origin: "*" }
```

ishlatadi.

`CORS_ALLOWED_ORIGINS` parse qilinadi, lekin enforce qilinmayapti.

Helmet CSP ham o‘chirilgan.

---

## 26. Muhim error kodlari

### Drive

```text
FINAL_DOCUMENTS_FOLDER_ID_REQUIRED
DRIVE_SHARED_DRIVE_REQUIRED
SERVICE_ACCOUNT_NO_STORAGE_QUOTA
DRIVE_API_DISABLED
DRIVE_FOLDER_NOT_FOUND
DRIVE_FOLDER_NOT_A_FOLDER
DRIVE_WRITE_PERMISSION_DENIED
GOOGLE_SERVICE_ACCOUNT_INVALID
DRIVE_UPLOAD_FAILED
DRIVE_APPS_SCRIPT_CONFIG_REQUIRED
DRIVE_APPS_SCRIPT_AUTH_FAILED
DRIVE_APPS_SCRIPT_TIMEOUT
```

### Email

```text
EMAIL_CONFIG_MISSING
EMAIL_AUTH_FAILED
EMAIL_CONNECTION_FAILED
EMAIL_SEND_TIMEOUT
EMAIL_SEND_FAILED
EMAIL_DOMAIN_NOT_VERIFIED
EMAIL_PROVIDER_RECIPIENT_NOT_ALLOWED
EMAIL_INVALID_RECIPIENT
EMAIL_RATE_LIMITED
EMAIL_HTTP_FAILED
```

### Workspace/Auth

```text
WORKSPACE_ID_REQUIRED
INVALID_WORKSPACE_ID
WORKSPACE_NOT_FOUND
WORKSPACE_PERMISSION_DENIED
ACCESS_TOKEN_REQUIRED
INVALID_ACCESS_TOKEN
```

### Final PDF

```text
APPROVAL_WORKSPACE_CONTEXT_REQUIRED
FINAL_PDF_OUTBOX_DATABASE_REQUIRED
FINAL_PDF_QUEUE_FAILED
FINAL_PDF_EXPORT_FAILED
FINAL_PDF_JOB_NOT_FOUND
```

---

## 27. Hozirgi ochiq muammolar

### 1. Production deployment drift

Current `dev_ab` `acts.html` da `6. ЯКУНИЙ ҲУЖЖАТЛАР` bor.

Foydalanuvchi production screenshotida u yo‘q.

Tekshiruv:

1. Railway active deployment commit;
2. Railway source branch;
3. deployment waiting/failed;
4. Network:
   - `/modules/acts.html`
   - `/js/acts-final-documents-folder.js`
   - `/js/acts-personal-drive-settings.js`
5. Response ichida `finalDocumentsFolderSettingsBtn`.

### 2. UX qarori ochiq

Current repo modal ishlatadi.

Foydalanuvchi yuqori o‘ng bo‘sh maydonda doimiy input xohlagan.

User tasdig‘isiz joylashuvni o‘zgartirmang.

### 3. Worker flag

Final PDF uchun `OUTBOX_WORKER_ENABLED=true` shart.

### 4. Final folder precondition

Current send approval flow email yuborishdan oldin Drive folderni test qiladi.

Folder yo‘q bo‘lsa email ham ketmasligi mumkin.

### 5. Resend `.env.example` gap

Code `RESEND_API_KEY` va `EMAIL_FROM` ishlatadi, ammo `.env.example` ularni hujjatlashtirmagan.

### 6. CORS

Config mavjud, lekin allowlist enforce qilinmagan.

### 7. Template duplication

ACT template CSS/markup frontend, Sheets va approval route’da takrorlangan.

---

## 28. Production diagnostika checklist

### Railway

- source branch = `dev_ab`;
- active commit current GitHub HEAD bilan mos;
- deployment successful;
- migrations up to date;
- server PORT;
- `OUTBOX_WORKER_ENABLED`;
- `DATABASE_URL`;
- required secrets;
- Google credential;
- email provider vars.

### Browser Network

```text
/modules/acts.html                       200
/js/workspace-api-client.js              200
/js/acts.js                              200
/js/acts-final-documents-folder.js       200
/js/acts-personal-drive-settings.js      200
```

Console:

```text
[acts-final-documents-folder] loaded
[acts-final-documents-folder] mounted
```

### API

```text
GET  /api/health/readiness
GET  /api/workspaces/:id
POST /api/workspaces/:id/documents/email/test
POST /api/workspaces/:id/documents/final-folder/test
```

### Sheets

- `АКТЛАР_РЕЕСТР` O:R;
- `ҲУЖЖАТ_ТАСДИҚЛАШ`;
- statuslar;
- assigned approvers;
- final PDF URL.

### Drive

- root folder;
- `ХУЖАТЛАР`;
- PDF file;
- duplicate yo‘q;
- service account/Apps Script permission.

---

## 29. O‘zgarish kiritish tartibi

1. User talabini bitta gapda qayta yozing.
2. Joriy `dev_ab` fayllarini fetch qiling.
3. Production screenshot bilan repo holatini solishtiring.
4. Root causeni dalil bilan aniqlang.
5. Minimal fayllarni belgilang.
6. Backend contractni buzmasdan patch qiling.
7. Syntax va testlar.
8. Commit.
9. Railway active commitni tekshirish.
10. Browser/API/Sheets/Drive qo‘lda test.
11. Yakuniy hisobot: root cause, fayllar, commit SHA, test, bajarilmagan real-world test.

---

## 30. Boshqa AI uchun tayyor boshlang‘ich prompt

```text
Siz SEG-KIP-AI Platform repository bilan ishlayapsiz.

Repository:
YanGi-Kon/SEG-KIP-AI-Platform

Authoritative branch:
dev_ab

Qoidalar:
- Faqat dev_ab.
- Yangi branch, PR yoki merge yo‘q.
- Har o‘zgarishdan oldin joriy fayllarni qayta fetch qiling.
- Secretlarni ko‘rsatmang.
- Cross-workspace isolationni buzmang.
- Login/auth/Sheets/approval/Drive oqimlariga keraksiz tegmang.
- Avval root cause, keyin minimal fix.
- npm run check va npm test.
- Production ishladi deb real deploy/test bo‘lmasa aytmang.

Arxitektura:
- Node.js ESM + Express.
- PostgreSQL: users, workspaces, memberships, signer metadata, encrypted Drive config, outbox.
- Google Sheets: ACT operational data, АКТЛАР_КУНЛИК, АКТЛАР_РЕЕСТР, ИМЗО_ЧЕКУВЧИЛАР, ҲУЖЖАТ_ТАСДИҚЛАШ.
- Google Drive: PNG signatures va final PDF.
- Resend HTTP afzal, SMTP fallback.
- Approval email faqat a4Json.assignedApprovers ga.
- Barcha approvallar tugagach outbox orqali final PDF.
- Worker uchun OUTBOX_WORKER_ENABLED=true.
- Shared Drive Service Account yoki per-workspace Apps Script Personal Drive.

Current critical discrepancy:
dev_ab acts.html ichida “6. ЯКУНИЙ ҲУЖЖАТЛАР” button/modal bor, ammo production screenshotda ko‘rinmayapti.
Avval Railway active commit va Network response’ni tekshiring.
User oldin inputni bosh sahifadagi yuqori o‘ng bo‘sh joyda xohlagan, current repo esa modal ishlatadi. UX’ni user bilan tasdiqlamasdan o‘zgartirmang.
```

---

## 31. Birinchi navbatdagi tavsiya etilgan ish

Boshqa AI darhol kod o‘zgartirmasin.

Avval:

1. `dev_ab` HEAD holatini aniqlasin;
2. Railway production active commitni aniqlasin;
3. `/modules/acts.html` production response’ni ochsin;
4. `finalDocumentsFolderSettingsBtn` bor-yo‘qligini tekshirsin;
5. `OUTBOX_WORKER_ENABLED` ni tekshirsin;
6. current UX modalmi yoki inline panelmi — userdan tasdiqlasin.

Shundan keyingina fix kiritilsin.
