# SEG-KIP-AI Multi-Workspace Implementation Plan

Date: 2026-06-24
Tracking issue: #2
Working branch: `feature/multi-workspace-architecture`

## 1. Target architecture

### Platform-level services

Railway keeps only platform secrets and infrastructure configuration:

- `DATABASE_URL`
- `GOOGLE_SERVICE_ACCOUNT_JSON` or encrypted equivalent
- `APPROVAL_JWT_SECRET`
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`
- `WORKSPACE_ENCRYPTION_KEY`
- SMTP credentials
- CORS allowlist
- public base URL

The platform Service Account is shared by V1. Every customer shares their own Google Sheet and Drive folder with the platform Service Account email.

### Workspace boundary

Each Workspace owns:

- spreadsheet ID/URL
- main sheet name
- Drive folder ID
- members and roles
- signers and signature file references
- documents and approval workflow
- audit events

Every protected object and API operation must be scoped by `workspaceId` and verified against membership.

### Sources of truth

- PostgreSQL: identity, authorization, workspace configuration, document metadata, signer metadata, approval state, token hashes, refresh sessions, audit and delivery/sync jobs.
- Google Sheets: operational document view, A4 blank, reports and compatibility/export representation.
- Google Drive: private PNG signatures and later immutable document artifacts.

## 2. Database design

Use PostgreSQL with UUID primary keys and additive SQL migrations.

### `users`

- `id uuid primary key`
- `full_name text not null`
- `email citext unique not null`
- `password_hash text not null`
- `platform_role text not null default 'user'`
- `status text not null default 'active'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `workspaces`

- `id uuid primary key`
- `owner_id uuid not null references users(id)`
- `name text not null`
- `slug text unique not null`
- `spreadsheet_id text not null`
- `spreadsheet_url text not null`
- `main_sheet_name text not null`
- `drive_folder_id text`
- `time_zone text not null default 'Asia/Tashkent'`
- `status text not null default 'active'`
- `is_default boolean not null default false`
- timestamps

### `workspace_members`

- `workspace_id uuid references workspaces(id)`
- `user_id uuid references users(id)`
- `role text not null`
- `status text not null default 'active'`
- unique `(workspace_id, user_id)`

### `signers`

- `id uuid primary key`
- `workspace_id uuid not null`
- `position text not null`
- `fio text not null`
- `gmail citext not null`
- `signature_file_id text`
- `signature_file_name text`
- `status text not null default 'active'`
- timestamps
- unique active Gmail rule per workspace

### `documents`

- `id uuid primary key`
- `workspace_id uuid not null`
- `act_no text not null`
- `source_sheet text`
- `source_row integer`
- `source_key_v1 text`
- `source_key_v2 text`
- `status text not null`
- `sheet_row_start integer`
- `a4_html text`
- `a4_json jsonb`
- `document_hash text`
- `created_by uuid`
- timestamps
- unique `(workspace_id, act_no)`
- unique partial/indexed normalized source key

### `approvals`

- `id uuid primary key`
- `workspace_id uuid not null`
- `document_id uuid not null`
- `signer_id uuid not null`
- signer position/FIO/Gmail snapshots
- `status text not null`
- `token_hash text not null`
- `token_version integer not null default 1`
- `opened_at timestamptz`
- `approved_at timestamptz`
- `rejected_at timestamptz`
- `ip_address inet`
- `user_agent text`
- timestamps
- unique `(document_id, signer_id)`

### `audit_logs`

Append-only table with workspace, actor, action, entity, IP, user agent, timestamp and JSON details. No update/delete through application APIs.

### `refresh_sessions`

Store hashed refresh tokens, device metadata, expiry, rotation and revocation state.

### `outbox_jobs`

Durable jobs for email delivery, Sheets synchronization and Drive operations. Supports retry count, next attempt, last error and idempotency key.

## 3. API architecture

### Authentication

- `POST /api/auth/register` — controlled/optional by environment.
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Access tokens are short-lived. Refresh tokens are rotated, stored hashed and delivered using secure HttpOnly cookies where deployment permits.

### Workspace APIs

- `POST /api/workspaces`
- `GET /api/workspaces`
- `GET /api/workspaces/:workspaceId`
- `PUT /api/workspaces/:workspaceId`
- `DELETE /api/workspaces/:workspaceId`
- `POST /api/workspaces/:workspaceId/test`
- `POST /api/workspaces/:workspaceId/activate`

### Membership APIs

Workspace Owner/Admin only:

- create/list/update/remove members
- enforce role matrix

### Scoped signer APIs

- `GET /api/workspaces/:workspaceId/signers`
- `POST /api/workspaces/:workspaceId/signers`
- `PUT /api/workspaces/:workspaceId/signers/:signerId`
- `DELETE /api/workspaces/:workspaceId/signers/:signerId`
- `POST /api/workspaces/:workspaceId/signatures/upload`

### Scoped document APIs

- create/list/read documents
- send/resend/cancel document
- inspect approval status
- read audit timeline

### Public approval APIs

JWT payload includes Workspace, document, approval, signer, email, token version, JTI and expiry.

- `GET /api/approval/:token`
- `POST /api/approval/:token/approve`
- `POST /api/approval/:token/reject`

The server resolves all Google and database resources using the token Workspace; no browser-provided Sheet credential is trusted.

## 4. Compatibility strategy

### Legacy adapter

Keep current endpoints operational initially:

- `/api/acts/settings/test`
- `/api/acts/monthly-analysis`
- `/api/acts/create`
- `/api/acts/reports/daily`
- `/api/signers`
- `/api/document/send`

Internally, route calls will be adapted to a default Workspace when workspace mode is enabled.

### Feature flags

- `WORKSPACE_MODE_ENABLED=false` initially
- `LEGACY_CONFIG_ENABLED=true` initially
- `AUTH_REQUIRED=false` only in staging during migration; production cutover changes it to true
- `OUTBOX_WORKER_ENABLED=false` until database migration is verified

### Default Workspace migration

Create one database Workspace pointing to the current production Spreadsheet and current signature Drive folder. Existing Sheets data is not copied, moved or rewritten. Database metadata is backfilled by read-only import scripts.

## 5. Migration plan

### Migration 001 — database extensions and core identity

- enable `pgcrypto` and `citext`
- users
- workspaces
- workspace members
- refresh sessions

### Migration 002 — workflow models

- signers
- documents
- approvals
- audit logs
- outbox jobs

### Migration 003 — indexes and constraints

- Workspace isolation indexes
- unique document/approval constraints
- status checks
- append-only audit permissions/triggers if suitable

### Data backfill

1. Create default platform owner.
2. Create default Workspace mapped to current Sheet.
3. Import `ИМЗО_ЧЕКУВЧИЛАР` rows as signer metadata without modifying the Sheet.
4. Import `АКТЛАР_РЕЕСТР` rows as document metadata.
5. Preserve `sourceKey` as v1 and compute a corrected v2 key.
6. Generate reconciliation report; do not delete duplicate or malformed historical rows automatically.

All import commands must support `--dry-run` and be idempotent.

## 6. Security plan

- Remove Service Account JSON from frontend localStorage and request headers.
- Add `.gitignore` protections immediately.
- Fail closed when auth secrets/configuration are missing in production.
- Use password hashing with Argon2id or scrypt and safe parameters.
- Use role and object authorization middleware.
- Add CORS allowlist for HTTP and Socket.IO.
- Add endpoint-specific rate limits for login, approval and file upload.
- Restore a restrictive Content Security Policy incrementally.
- Validate inputs with schemas.
- Validate PNG MIME plus magic bytes and image dimensions.
- Sanitize stored A4 HTML before preview.
- Redact secrets, tokens and personal data from logs.
- Use constant-time comparisons where applicable.
- Add audit events for security-sensitive operations.
- Use server-generated UTC timestamps and display in Workspace time zone.

## 7. Implementation phases

### Phase 0 — audit and backup

Status: started.

Deliverables:

- backup branch
- audit document
- implementation/migration/security/test/rollback plan
- no production changes

### Phase 1 — foundation with no production behavior change

- PostgreSQL connection module
- migration runner and SQL migrations
- configuration validation
- repository/service structure
- feature flag module
- health readiness including optional DB status
- unit tests for config and Workspace model

### Phase 2 — identity and Workspace

- login/access/refresh sessions
- Workspace CRUD
- membership/RBAC middleware
- Workspace connection test
- frontend Workspace selector/settings

### Phase 3 — Google resolver and credential cleanup

- platform Service Account only
- Workspace-scoped Sheet/Drive clients
- remove raw Service Account from new frontend flow
- maintain legacy adapter behind flag

### Phase 4 — signer migration

- PostgreSQL signer source of truth
- Sheets compatibility mirror
- workspace Drive folder uploads
- preview and CRUD regression tests

### Phase 5 — document and approval migration

- database documents/approvals
- Workspace JWTs
- approve/reject/cancel/resend
- outbox and idempotent Sheets sync
- document signature blocks and immutable version/hash

### Phase 6 — security, migration and cutover

- CORS/rate limit/CSP hardening
- dry-run import and reconciliation
- two-Workspace isolation test
- production default Workspace cutover
- disable legacy credential transmission

## 8. Test plan

### Unit

- config validation and secret redaction
- Workspace ID/slug/URL validation
- role permission matrix
- JWT and CSRF/token-version validation
- password hashing and refresh rotation
- source key v1/v2 behavior
- Gmail validation
- PNG magic bytes and size
- HTML sanitization
- outbox retry/idempotency

### Integration

Use a dedicated test database and mocked/fake Google adapters:

- auth lifecycle
- Workspace CRUD and membership
- cross-Workspace access denial
- signer CRUD
- document create/send
- approval open/approve/reject
- audit creation
- outbox execution

### Google staging

Use a separate staging Sheet and Drive folder:

- connection permissions
- automatic required-tab creation
- A4 formatting regression
- private PNG upload/read
- email link workflow

### Regression

Snapshot and behavior tests for current ACTS routes, A4 HTML, registry fields, daily reports and duplicate detection.

## 9. Rollback plan

1. Never perform destructive Sheet migration.
2. Keep `main` deployable and the backup branch immutable.
3. Database migrations are additive; rollback primarily disables feature flags.
4. `WORKSPACE_MODE_ENABLED=false` returns traffic to legacy behavior.
5. Legacy endpoints remain available until after a monitored production period.
6. Outbox workers can be stopped independently.
7. The default Workspace stores references only; deleting/reverting application records does not delete Google data.
8. Before cutover, export database backup and record Railway deployment ID/commit SHA.
9. If production errors occur, redeploy the last successful `main` commit and disable new workers.

## 10. Changed-file forecast

New directories/files:

- `config/`
- `db/`
- `db/migrations/`
- `middleware/auth.js`
- `middleware/workspaceAccess.js`
- `repositories/`
- `routes/auth.js`
- `routes/workspaces.js`
- `services/workspaceGoogleService.js`
- `services/outboxService.js`
- `scripts/migrate-default-workspace.js`
- `tests/`

Existing files expected to change incrementally:

- `server.js`
- `package.json`
- `.env.example`
- `.github/workflows/signers-ci.yml`
- `routes/acts.js`
- `routes/signatures.js`
- `services/googleSheetsService.js`
- `services/actBlankSheetService.js`
- `services/signatureApprovalService.js`
- `public/modules/acts.html`
- `public/js/acts.js`

## 11. Definition of done

- Two users can operate two different Workspaces and Sheets without cross-access.
- Browser storage contains no Google private key.
- Approval tokens resolve the exact Workspace/document/signer.
- Signatures remain private in Drive.
- PostgreSQL and Sheets reconcile successfully.
- Current ACTS workflow and formatting continue to work.
- CI, unit, integration, isolation and staging E2E tests pass.
- Rollback has been rehearsed before production cutover.
