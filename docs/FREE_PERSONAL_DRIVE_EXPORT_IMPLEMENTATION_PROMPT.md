# Professional implementation prompt: free Personal Drive PDF export

## Role

Act as a senior Node.js, Google Apps Script, Google Drive, and security engineer.
Work in the existing `SEG-KIP-AI-Platform` architecture. Preserve the current
approval, outbox, workspace isolation, idempotency, and Google Sheets registry
flows.

## Objective

Add a zero-subscription final-PDF storage path that saves approved documents to
an ordinary Google account's **My Drive** through a user-owned Google Apps Script
web app. Keep the existing service-account + Shared Drive provider as a fallback.
Do not require Google Workspace Shared Drive or paid Google storage.

## Repository facts that must guide the implementation

- `routes/signatures.js` enqueues an idempotent `final_pdf_export` job after the
  final approval.
- `services/finalPdfExportWorker.js` drains the PostgreSQL outbox.
- `services/finalPdfExportService.js` reads `a4Html` from `АКТЛАР_РЕЕСТР`, renders
  and uploads the PDF, then writes columns `O:R`.
- `services/workspaceDriveFolderService.js` is the provider boundary.
- `services/driveProviders/sharedDriveServiceAccountProvider.js` intentionally
  rejects My Drive because service accounts have no personal storage quota.
- Workspace isolation and the existing export idempotency key must remain intact.

## Required design

1. Add an Apps Script Personal Drive provider implementing the existing provider
   responsibilities: folder validation, `ХУЖАТЛАР` subfolder creation, HTML to PDF
   conversion, PDF upload, and a stable Drive URL response.
2. Store Apps Script URL and encrypted secret per workspace. Provider selection
   must use the current workspace configuration, never a global account. Otherwise
   retain the Shared Drive provider.
3. Authenticate every webhook request. Never place the secret in browser code,
   Sheets cells, logs, or returned diagnostics. Include a timestamp and nonce;
   reject expired or replayed requests.
4. The Apps Script must execute as the deploying Google user so files consume
   that user's free My Drive quota. Store the secret in Apps Script Properties.
5. Keep PDF export idempotent. A completed export with `finalPdfFileId` must not
   create another file.
6. Preserve current error classification and outbox retry behavior. Configuration,
   authentication, and permission errors must be permanent; network/5xx errors
   must remain retryable.
7. Add automated unit tests for provider selection, signed request format,
   response mapping, authentication errors, and retry classification.
8. Update `.env.example`, `npm run check`, and deployment documentation without
   committing credentials.

## Quality and security gates

- No hardcoded folder IDs, URLs, account emails, or secrets.
- No anonymous unauthenticated upload endpoint.
- No cross-workspace folder lookup.
- Workspace members may access documents according to role permissions; users
  outside the workspace must not receive document access.
- No raw HTML, signature image token, secret, or full provider response in logs.
- Use request timeouts and bounded response parsing.
- Clean temporary Google Docs files in a `finally` block.
- Return stable machine-readable error codes.
- Existing tests must continue to pass.
- Run `npm run check` and `npm test` before declaring completion.

## Delivery order

1. Provider contract and configuration.
2. Apps Script receiver with authentication and replay protection.
3. Export-service integration.
4. Unit tests.
5. Deployment guide and manual verification checklist.
6. Full static and automated test suite.
