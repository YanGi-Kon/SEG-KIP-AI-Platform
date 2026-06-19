import { google } from "googleapis";

const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

export function getSpreadsheetId() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID environment variable is missing");
  }
  return spreadsheetId;
}

export async function getSheetsClient() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || "service-account.json";
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
