# SEG-KIP-AI Multi-Workspace Progress Register

Last updated: 2026-06-27
Tracking issue: #2
Draft PR: #3
Working branch: `feature/multi-workspace-architecture`

## Status legend

- ✅ Completed
- 🟡 In progress
- ⬜ Not started
- ⛔ Blocked

## 10-stage delivery plan

### 1. Audit, backup and implementation plan — ✅ Completed

Completed:
- Created `backup/pre-multi-workspace-2026-06-24`.
- Created `feature/multi-workspace-architecture`.
- Audited current ACTS, Sheets, approval and credential flow.
- Documented migration, test, security and rollback plans.
- Preserved current production behavior.

### 2. Railway staging and PostgreSQL foundation — ✅ Completed

Completed:
- Created isolated Railway `staging` environment.
- Created staging PostgreSQL.
- Added `DATABASE_URL` reference.
- Added checksum-safe migration runner and pre-deploy migration command.
- Successfully created `schema_migrations`, `users`, `workspaces`, `workspace_members`, `refresh_sessions`, `signers`, `documents`, `approvals`, `audit_logs` and `outbox_jobs`.

### 3. Platform secrets and Google credential setup — ✅ Completed

Completed:
- Added independent access, refresh, approval and encryption secrets.
- Added staging feature flags.
- Added `GOOGLE_SERVICE_ACCOUNT_BASE64`.
- Removed conflicting `GOOGLE_SERVICE_ACCOUNT_JSON` from staging.
- Kept Workspace mode disabled until validation, then enabled it only in staging.

### 4. Workspace backend and Sheet isolation — ✅ Completed

Completed:
- Workspace domain validation.
- Workspace CRUD foundation.
- Membership and role permission matrix.
- Object-level Workspace authorization.
- Workspace-scoped Google Sheet test service.
- Fixed global `GOOGLE_SPREADSHEET_URL` from overriding `workspace.spreadsheetUrl`.
- Latest CI passed.
- Confirmed latest staging deployment uses the multi-workspace branch.
- Enabled `WORKSPACE_MODE_ENABLED=true` only in Railway staging.
- Verified `/api/health/readiness` returns `ok: true`, `mode: workspace`, `databaseRequired: true`, `database.configured: true`, `database.connected: true`.

### 5. Staging activation, bootstrap admin and API validation — 🟡 In progress

Started:
- Railway staging public domain is available.
- Workspace mode is enabled in staging.
- Readiness endpoint confirms Workspace mode and PostgreSQL connectivity.

Completed in stage 5:
- Enabled temporary self-registration in staging.
- Verified weak-password validation returns `INVALID_PASSWORD` instead of generic server failure.
- Created the first staging user through `/api/auth/register`.
- Corrected the staging user's `full_name` to Latin text: `Bobur Baxromovich`.
- Verified `/api/auth/me` with Bearer access token returns the authenticated active user.
- Verified `/api/auth/login` with the created staging user returns an access token and active user.
- Re-verified `/api/auth/me` after login returns `fullName: Bobur Baxromovich`, `platformRole: user`, and `status: active`.
- Verified `/api/auth/refresh` rotates the refresh session and returns a new access token plus active user.
- Verified `/api/auth/logout` returns `ok: true`, `revoked: true`.
- Verified refresh after logout is rejected with `REFRESH_TOKEN_REQUIRED`.
- Disabled temporary self-registration in staging and verified `/api/auth/register` rejects new registration with `SELF_REGISTRATION_DISABLED`.
- Created staging Workspace `KIP Staging Test` with slug `kip-staging-test`, status `draft`, and the authenticated user as `owner`.
- Corrected the Workspace main Sheet name after PowerShell encoding produced an invalid Cyrillic value.
- Verified `GET /api/workspaces` returns the created Workspace with `memberRole: owner` and `memberStatus: active`.
- Verified `GET /api/workspaces/:workspaceId` returns the created Workspace with `memberRole: owner` and `memberStatus: active`.
- Verified `GET /api/workspaces/:workspaceId/members` returns the owner membership with active user status.
- Added and deployed `POST /api/workspaces/:workspaceId/test` for Workspace Sheet connection checks.
- Verified Service Account read access to the real Workspace Google Sheet: `accessVerified: true`, `mainSheetExists: true`, and no missing required ACT tabs.

Required before completion:
- Activate the real test Workspace.
- Re-read the Workspace after activation.

### 6. Frontend login and Workspace settings UI — ⬜ Not started

Required:
- Login/logout UI.
- Workspace selector.
- Create/edit/archive Workspace.
- Sheet URL and Drive folder fields.
- Connection test and activation controls.
- Store no Service Account private key in browser storage.

### 7. Workspace-scoped signers and signature storage — ⬜ Not started

Required:
- Migrate signer source of truth to PostgreSQL.
- Scope signer CRUD by `workspaceId`.
- Use each Workspace Drive folder.
- Preserve current signer UI and Sheets mirror.
- Validate private PNG upload and secure read proxy.

### 8. Documents, approvals, email, audit and outbox migration — ⬜ Not started

Required:
- Workspace-scoped documents and approvals.
- Token payload with Workspace/document/approval/signer IDs.
- Approve, reject, resend and cancel flows.
- PostgreSQL audit trail.
- Durable outbox for email and Sheets synchronization.
- Preserve A4 HTML/JSON and current ACTS formatting.

### 9. Isolation, regression and end-to-end testing — ⬜ Not started

Required:
- User A / Workspace A / Sheet A.
- User B / Workspace B / Sheet B.
- Prove cross-Workspace read/write denial.
- Real Gmail, Drive and Sheets approval test.
- Regression test current ACTS, reports, A4 preview and duplicate behavior.
- Rehearse rollback.

### 10. Review, merge and production cutover — ⬜ Not started

Required:
- Complete code review.
- Resolve all CI/security findings.
- Mark PR #3 ready for review.
- Merge only after staging acceptance.
- Create production database backup.
- Run additive production migration.
- Enable Workspace mode gradually.
- Monitor and retain rollback flags.

## Mandatory progress announcements

For every stage, the working conversation and GitHub tracking must explicitly announce:

1. `🚀 N-bosqich boshlandi` before execution.
2. The exact work completed and any evidence/tests.
3. `✅ N-bosqich yakunlandi` only after its acceptance criteria pass.
4. The next stage must not be declared started until the previous stage is closed, except for clearly documented non-production preparation work.
5. Any blocker must be announced as `⛔ To‘siq` with cause, impact and recovery action.

## Current position

- Completed: stages 1, 2, 3 and 4.
- Active: stage 5.
- Next after stage 5: stage 6.
- Production remains unchanged; PR #3 is still draft and unmerged.
