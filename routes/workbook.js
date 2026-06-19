import express from "express";
import { getSheetsClient, getSpreadsheetId } from "../config/google.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
    const sheetNames = meta.data.sheets.map((s) => s.properties.title);

    const values = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: sheetNames.map((n) => `'${n}'!A1:K120`),
    });

    res.json({
      ok: true,
      sheets: sheetNames,
      data: Object.fromEntries(values.data.valueRanges.map((r, i) => [sheetNames[i], r.values || []])),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
