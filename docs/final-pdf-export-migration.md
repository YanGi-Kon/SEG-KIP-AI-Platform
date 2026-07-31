# Final PDF export migration

Migration `025_final_pdf_export_outbox.sql` extends `outbox_jobs` with the
`final_pdf_export` job type, retry/permanent failure states, a sanitized error
code, and a JSON result. The existing unique `idempotency_key` prevents repeated
approval requests from creating duplicate export jobs.

## Railway variables

- `DATABASE_URL`
- `OUTBOX_WORKER_ENABLED=true`
- `FINAL_PDF_WORKER_INTERVAL_MS=5000` (optional)
- `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_SERVICE_ACCOUNT_BASE64`
- `APPROVAL_JWT_SECRET` (at least 32 characters)
- `WORKSPACE_MODE_ENABLED=true`

The configured final-documents folder must belong to a Google Workspace Shared
Drive. Add the platform service account as a Content manager. An ordinary My
Drive folder shared as Editor is not supported.

Deploy the database migration before enabling the worker. Existing approval
tokens without `workspaceId` remain usable for approval, but no cross-workspace
search is performed and automatic final-PDF export is reported as unsupported.
