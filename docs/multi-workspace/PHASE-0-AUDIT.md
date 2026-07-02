# SEG-KIP-AI Multi-Workspace — Phase 0 Audit

Date: 2026-06-24
Branch: `feature/multi-workspace-architecture`
Production backup: `backup/pre-multi-workspace-2026-06-24`

## 1. Scope

This audit covers the current Node.js/Express application, ACTS approval module, Google Sheets/Drive integration, authentication controls, frontend credential handling, CI and the production Google Spreadsheet structure.

No production Sheet data or `main` branch behavior was changed during this audit.

## 2. Current architecture

- Backend: Node.js, Express, Socket.IO.
- Frontend: static HTML/CSS/Vanilla JavaScript.
- Google data: Sheets is both display storage and workflow metadata storage.
- Signature PNG: Google Drive.
- Approval email: Nodemailer/Gmail SMTP.
- Authentication: optional single administrator password/JWT.
- Tenant model: none; the system is effectively single-workspace.
- Database: none.
- Test framework: none; current CI performs syntax and dependency audit only.

## 3. Production Spreadsheet snapshot

Spreadsheet title: `КИП`

- Locale: `ru_RU`
- Time zone: `America/Los_Angeles`
- Existing tabs include `меню`, `кудук руйхати`, `База`, field/location sheets, `УЛЧОВ ВОСИТАЛАРИ`, `АКТЛАР_КУНЛИК`, `АКТЛАР_РЕЕСТР`, and `ИМЗО_ЧЕКУВЧИЛАР`.
- `АКТЛАР_КУНЛИК` currently has 28 columns and contains both legacy/tabular report rows and formatted A4-style document blocks.
- `АКТЛАР_РЕЕСТР` currently stores 14 columns: `actNo`, source metadata, status, row start, timestamps, device information, A4 HTML and A4 JSON.
- `ИМЗО_ЧЕКУВЧИЛАР` exists with headers `ID`, `Lavozimi`, `FIO`, `ImzoPNG`, `Gmail`, `CreatedAt`.
- Current A4 layout and merged/formatting structure must be preserved exactly during migration.

## 4. Critical findings

### 4.1 Single global Google connection

`resolveGoogleConfig()` prefers Railway environment values over request values. A configured global `GOOGLE_SPREADSHEET_URL` therefore overrides a user-selected Sheet. This prevents independent per-user workspaces.

### 4.2 Service Account private key in browser storage

The ACTS frontend stores the complete Service Account JSON in `localStorage` and serializes it into an `x-seg-kip-config` request header. This exposes a long-lived private key to browser JavaScript, browser extensions and XSS.

### 4.3 Legacy ACTS endpoints accept raw credentials

`/api/acts/settings/test`, `/api/acts/monthly-analysis`, `/api/acts/create` and `/api/acts/reports/daily` receive the Service Account JSON from the request body. This must remain temporarily for backward compatibility but must be removed from the final workspace flow.

### 4.4 Optional authentication bypass

`requireAdmin` allows all protected signer/send operations when `ADMIN_PASSWORD` is not configured. Production authorization must fail closed, not fail open.

### 4.5 No user/workspace authorization model

There are no users, workspaces, memberships, roles or object-level permission checks. Any authenticated administrator can operate on the only configured Sheet.

### 4.6 No PostgreSQL source of truth

Approval records, signer records, audit records and document metadata are stored only in Sheets. There is no transactional database, unique tenant boundary, migration system, retry queue or durable session store.

### 4.7 Broad HTTP/WebSocket exposure

- Express CORS currently allows all origins.
- Socket.IO CORS currently allows all origins.
- Helmet CSP is disabled.
- JSON request size is 30 MB globally.
- No rate limiting or brute-force protection is present.

### 4.8 Missing repository secret protections

No `.gitignore` file is present in the repository. Secret files, local `.env`, service-account JSON and generated uploads are not explicitly protected from accidental commit.

### 4.9 Approval consistency risk

The current send flow updates Google Sheets and sends email in one request without a database transaction/outbox. Partial failures can produce mismatched email, Sheet status and audit state.

### 4.10 Stored HTML security risk

A4 HTML is persisted in Sheets and later inserted into the DOM. Current generated fields are escaped, but imported or manually edited Sheet HTML must be sanitized before rendering.

### 4.11 Source key defect to preserve/fix carefully

`makeSourceKey()` expects `sheetName` and `rowNumber`, while mapped ACT rows contain `sourceSheet` and `sourceRowNumber`. Existing registry values show leading empty source-key segments. A compatibility migration must normalize future keys without breaking duplicate detection for historical records.

### 4.12 Spreadsheet time zone mismatch

The production Spreadsheet time zone is `America/Los_Angeles`, while business operations are in Uzbekistan. Server timestamps are ISO UTC, but formulas or Sheet-local date rendering may shift dates. Time-zone handling must be standardized to `Asia/Tashkent` at the application layer before any optional Sheet setting change.

## 5. Existing behavior that must not break

- `/api/acts/create`
- `/api/acts/monthly-analysis`
- `/api/acts/reports/daily`
- Current ACT number generation
- Existing `sourceKey` duplicate behavior for old rows
- `АКТЛАР_КУНЛИК` formatted document blocks
- `АКТЛАР_РЕЕСТР` records and A4 HTML/JSON
- A4 browser preview and print/PDF flow
- Existing signer UI and approval links during migration
- Existing Excel/Google Sheets navigation

## 6. Risk classification

| Risk | Severity | Immediate treatment |
|---|---:|---|
| Service Account in browser storage | Critical | Replace with server-side platform credential resolver |
| No tenant isolation | Critical | Add PostgreSQL Workspace and membership model |
| Optional auth bypass | Critical | Introduce fail-closed auth under feature flag |
| Global Sheet env override | High | Resolve Sheet/Drive by `workspaceId` |
| No transaction/outbox | High | Add DB transaction and delivery/sync jobs |
| CORS `*` and no rate limit | High | Add allowlist and endpoint-specific limiters |
| Stored HTML rendering | High | Add sanitization and content policy |
| No `.gitignore` | High | Add immediately on feature branch |
| Spreadsheet time zone mismatch | Medium | Normalize all application timestamps |
| Source key mismatch | Medium | Add normalized v2 key with legacy fallback |
| No automated tests | Medium | Add Node test suite and integration test harness |

## 7. Phase 0 decisions

1. Keep `main` unchanged until CI, migration and regression tests pass.
2. Use one platform Service Account for V1.
3. Store per-workspace `spreadsheetId`, `mainSheetName` and `driveFolderId` in PostgreSQL.
4. Do not store Service Account JSON in frontend storage.
5. Keep legacy ACT endpoints through an explicit compatibility adapter.
6. Migrate the existing production Sheet as a `default` Workspace without moving or rewriting its data.
7. Use feature flags so the workspace path can be disabled instantly.
8. Use additive/non-destructive database migrations only until final cutover.
9. Use PostgreSQL as security/workflow source of truth; Sheets remains document display/export and compatibility storage.
10. Do not alter the production Spreadsheet time zone or formatting during early phases.

## 8. Phase 0 completion criteria

- Backup branch exists.
- Feature branch exists.
- Current code and Sheets structure are documented.
- Security and compatibility risks are documented.
- Implementation, migration, test and rollback plans are committed.
- Production data remains unchanged.
