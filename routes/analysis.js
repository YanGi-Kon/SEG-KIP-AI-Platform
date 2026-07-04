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
  const apiKey = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPEN_AI_API_KEY || "").trim().replace(/^[\'"]|[\'"]$/g, "");
  return apiKey ? new OpenAI({ apiKey }) : null;
}

function getModel() {
  return String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
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
      results.push({ path: path.relative(repoRoot, filePath), preview: lines.join("\n") });
    } catch (error) {
      results.push({ path: path.relative(repoRoot, filePath), error: String(error?.message || error) });
    }
  }
  return results;
}

async function readSheetPreviewSafe() {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
    const sheetNames = (meta.data.sheets || []).map((s) => s.properties.title).slice(0, 8);
    const ranges = sheetNames.map((title) => `'${title}'!A1:E8`);
    const values = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
    return {
      ok: true,
      warning: "",
      rows: sheetNames.map((sheetName, index) => ({
        sheetName,
        range: ranges[index],
        values: values.data.valueRanges[index]?.values || [],
      })),
    };
  } catch (error) {
    return {
      ok: false,
      warning: `Google Sheets preview olinmadi: ${error?.message || "noma'lum xato"}`,
      rows: [],
    };
  }
}

function pageSnapshot(page = {}) {
  return [
    `module: ${String(page.module || "").slice(0, 80)}`,
    `title: ${String(page.title || "").slice(0, 160)}`,
    `activeMenu: ${String(page.activeMenu || "").slice(0, 160)}`,
    `frameSrc: ${String(page.frameSrc || "").slice(0, 200)}`,
    `visible: ${String(page.tableText || page.visibleText || "").slice(0, 5000)}`,
  ].join("\n");
}

function classifyAnalysisError(error) {
  const status = error?.status || error?.response?.status || 500;
  const message = String(error?.message || "Noma'lum xato");
  const lower = message.toLowerCase();
  if (status === 401 || status === 403) return { code: "AI_AUTH_FAILED", error: "AI provider ruxsat bermadi.", recommendedFix: "AI kaliti va deploy variables holatini tekshiring." };
  if (status === 429 && (lower.includes("quota") || lower.includes("billing") || lower.includes("insufficient"))) return { code: "AI_QUOTA_EXCEEDED", error: "AI provider quota yoki billing cheklovi berdi.", recommendedFix: "Billing va usage limit holatini tekshiring." };
  if (status === 429) return { code: "AI_RATE_LIMITED", error: "AI provider vaqtincha rate limit berdi.", recommendedFix: "Birozdan keyin qayta urinib ko‘ring." };
  if (status === 404 || lower.includes("model")) return { code: "AI_MODEL_NOT_FOUND", error: "Tanlangan AI modeli topilmadi.", recommendedFix: "OPENAI_MODEL qiymatini tekshiring." };
  return { code: "AI_ANALYSIS_FAILED", error: "AI tahlil bajarilmadi.", details: message, recommendedFix: "Deploy loglari va AI sozlamalarini tekshiring." };
}

router.post("/", async (req, res) => {
  const query = String(req.body?.query || "").trim() || "Iltimos, loyiha fayllari va Google Sheets ma'lumotlari asosida umumiy tahlil va taklif bering.";

  const client = getOpenAiClient();
  if (!client) {
    return res.status(200).json({
      ok: false,
      code: "AI_MISSING_API_KEY",
      error: "AI provider sozlanmagan.",
      recommendedFix: "AI kalitini Railway Variables orqali kiriting va redeploy qiling.",
      secretsExposed: false,
    });
  }

  try {
    const fileSnippets = await readProjectFiles();
    const sheetPreview = await readSheetPreviewSafe();
    const warnings = sheetPreview.warning ? [sheetPreview.warning] : [];

    const systemPrompt = "Siz SEG KIP Platform loyihasiga mos AI yordamchisiz. Qisqa, aniq va amaliy xulosalar bering. Maxfiy qiymatlarni so‘ramang va ko‘rsatmang.";
    const sheetsBlock = sheetPreview.rows.length
      ? sheetPreview.rows.map((sheet) => `-- ${sheet.sheetName} (${sheet.range}):\n${sheet.values.map((row) => row.join(" | ")).slice(0, 6).join("\n")}`).join("\n\n")
      : "[Google Sheets preview mavjud emas]";
    const userPrompt = `Foydalanuvchi so'rovi: ${query}\n\nJoriy sahifa:\n${pageSnapshot(req.body?.currentPage || {})}\n\nFayllar:\n` +
      fileSnippets.map((file) => `-- ${file.path}:\n${file.error ? file.error : file.preview}`).join("\n\n") +
      `\n\nSheets preview:\n${sheetsBlock}\n\nWarnings:\n${warnings.join("\n") || "yo‘q"}`;

    const completion = await client.chat.completions.create({
      model: getModel(),
      temperature: 0.35,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const analysis = completion.choices?.[0]?.message?.content || "Tahlil javobi olinmadi.";
    res.json({
      ok: true,
      analysis,
      model: getModel(),
      fileSnippets,
      sheetPreview: sheetPreview.rows,
      warnings,
      sheetsContextAttached: sheetPreview.ok,
      secretsExposed: false,
    });
  } catch (error) {
    const classified = classifyAnalysisError(error);
    console.error("ANALYSIS_ERROR:", classified.code, error?.message || error);
    res.status(502).json({ ok: false, ...classified, secretsExposed: false });
  }
});

export default router;
