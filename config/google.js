import { google } from "googleapis";
import fs from "fs";
import os from "os";
import path from "path";

const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

export function getSpreadsheetId() {
  const spreadsheetId = process.env.SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID yoki GOOGLE_SHEETS_ID environment variable is missing");
  }
  return spreadsheetId;
}

function getServiceAccountKeyFile() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const keyPath = path.join(os.tmpdir(), "seg-kip-google-service-account.json");
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
    const jsonText = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    fs.writeFileSync(keyPath, jsonText, { mode: 0o600 });
    return keyPath;
  }
  return process.env.GOOGLE_APPLICATION_CREDENTIALS || "service-account.json";
}

export async function getSheetsClient() {
  const keyFile = getServiceAccountKeyFile();
  const auth = new google.auth.GoogleAuth({ keyFile, scopes });
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

export async function readSheetRange(range) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range,
  });
  return response.data.values || [];
}
