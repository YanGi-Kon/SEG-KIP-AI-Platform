import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { getSheetsClient, getSpreadsheetId } from "../config/google.js";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../");

function getOpenAiClient() {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-"));
  return hasApiKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
}

async function readProjectFiles() {
  const filePaths = [
    path.join(repoRoot, "config", "google.js"),
    path.join(repoRoot, "routes", "chat.js"),
    path.join(repoRoot, "routes", "workbook.js"),
    path.join(repoRoot, "public", "js", "app.js"),
    path.join(repoRoot, "docs", "TASK_ULCHOV_ACTS_EXCEL_FIX_REPORT.md"),
  ];

  const results = [];
  for (const filePath of filePaths) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const lines = text.split(/\r?\n/).slice(0, 80);
      results.push({
        path: path.relative(repoRoot, filePath),
        preview: lines.join("\n"),
      });
    } catch (error) {
      results.push({ path: path.relative(repoRoot, filePath), error: String(error) });
    }
  }

  return results;
}

async function readSheetPreview() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
  const sheetNames = meta.data.sheets.map((s) => s.properties.title).slice(0, 8);

  const ranges = sheetNames.map((title) => `'${title}'!A1:E8`);
  const values = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });

  return sheetNames.map((sheetName, index) => ({
    sheetName,
    range: ranges[index],
    values: values.data.valueRanges[index]?.values || [],
  }));
}

router.post("/", async (req, res) => {
  const query = String(req.body?.query || "").trim() ||
    "Iltimos, loyiha fayllari va Google Sheets ma'lumotlari asosida umumiy tahlil va taklif bering.";

  const client = getOpenAiClient();
  if (!client) {
    return res.status(400).json({
      ok: false,
      error:
        "OpenAI API kaliti yo'q. .env faylga OPENAI_API_KEY qo'shing yoki demo rejimda ishlang.",
    });
  }

  try {
    const fileSnippets = await readProjectFiles();
    const sheetPreview = await readSheetPreview();

    const systemPrompt = `Siz SEG KIP Platform loyihasiga mos AI yordamchisiz. Loyiha Node.js + Google Sheets + OpenAI asosida ishlaydi. Foydalanuvchi uchun qisqa, aniq va amaliy xulosalar bering.`;
    const userPrompt = `Quyidagi fayl snippetlari va Google Sheets preview ma'lumotlari asosida javob bering.\n\n` +
      `Foydalanuvchi so'rovi: ${query}\n\n` +
      `Fayllar:\n` +
      fileSnippets.map((file) => `-- ${file.path}:\n${file.error ? file.error : file.preview}`).join("\n\n") +
      `\n\nSheets preview:\n` +
      sheetPreview.map((sheet) => `-- ${sheet.sheetName} (${sheet.range}):\n${sheet.values.map((row) => row.join(" | ")).slice(0, 6).join("\n")}`).join("\n\n");

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.35,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const analysis = completion.choices?.[0]?.message?.content || "Tahlil javobi olinmadi.";
    res.json({ ok: true, analysis, fileSnippets, sheetPreview });
  } catch (error) {
    console.error("ANALYSIS_ERROR:", error?.message || error);
    res.status(500).json({ ok: false, error: error?.message || "Noma'lum xato." });
  }
});

export default router;
