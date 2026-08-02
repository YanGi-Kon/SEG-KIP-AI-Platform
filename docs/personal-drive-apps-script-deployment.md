# Free Personal Drive final-PDF export

This path stores approved PDFs in an ordinary Google account's free My Drive
quota. It does not require Google Workspace Shared Drive.

## 1. Prepare Drive

1. Sign in with the Google account that should own the approved PDFs.
2. Create a folder such as `SEG KIP FINAL DOCUMENTS`.
3. Copy the folder ID from its URL.

## 2. Deploy Apps Script

1. Open <https://script.google.com> and create a standalone project.
2. Copy `apps-script/Code.gs` into the project.
3. In **Project Settings > Script properties**, add
   `SEG_KIP_WEBHOOK_SECRET` with a random value of at least 32 characters.
4. Under **Services**, add the advanced **Drive API** service (v3).
5. Choose **Deploy > New deployment > Web app**.
6. Set **Execute as: Me** and access to the narrowest option available to the
   deployment account. The webhook still rejects requests without a valid HMAC,
   timestamp, and unused nonce.
7. Authorize Drive access and copy the `/exec` deployment URL.

## 3. Configure Railway

Set the platform encryption key and timeout, then redeploy:

```env
WORKSPACE_ENCRYPTION_KEY=<platform-wide random encryption key, at least 32 characters>
PERSONAL_DRIVE_APPS_SCRIPT_TIMEOUT_MS=30000
```

Save the `/exec` URL and matching webhook secret through the selected workspace's
Personal Drive settings. They are stored per workspace; the secret is encrypted
before it reaches PostgreSQL and is never returned by the API.

Keep the service-account variables because the backend still uses them to read
and update the workspace Google Sheet. The Personal Drive provider is used only
for final-document folder operations and PDF storage.

## 4. Configure and verify the workspace

1. Open the final-documents folder settings in the Acts module.
2. Paste the ordinary My Drive folder URL and save it.
3. Run the write test. The result must report provider
   `apps_script_personal_drive`.
4. Approve a test act. Verify:
   - a `ХУЖАТЛАР` subfolder exists;
   - one PDF is present;
   - the temporary Google Doc is trashed;
   - `АКТЛАР_РЕЕСТР!O:R` contains file ID, URL, approval time, and `EXPORTED`;
   - the outbox job is `completed`.

## Security notes

- Never put the webhook secret in GitHub, Sheets, frontend JavaScript, or logs.
- Rotate both Script Property and Railway variable if exposure is suspected.
- Redeploy Apps Script after code changes; the `/dev` URL is only for testing.
- The Apps Script owner account controls the stored files and consumes its Drive
  storage quota.
