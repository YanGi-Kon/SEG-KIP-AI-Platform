import express from "express";
import OpenAI from "openai";
import { buildProjectContext, listSafeProjectFiles, readSafeFile } from "../services/projectContextService.js";

const router = express.Router();

function getApiKey() {
  return String(
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY ||
    process.env.OPEN_AI_API_KEY ||
    ""
  ).trim().replace(/^['\"]|['\"]$/g, "");
}

function getModel() {
  return String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
}

function getClient() {
  const apiKey = getApiKey();
  return apiKey ? new OpenAI({ apiKey }) : null;
}

router.get("/files", async (_req, res) => {
  try {
    const files = await listSafeProjectFiles();
    res.json({ ok: true, files });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Fayllarni o‘qib bo‘lmadi." });
  }
});

router.get("/file", async (req, res) => {
  try {
    const filePath = String(req.query.path || "").trim();
    const content = await readSafeFile(filePath, 12000);
    res.json({ ok: true, path: filePath, content });
  } catch (error) {
    res.status(400).json({ ok: false, error: error?.message || "Fayl o‘qilmadi." });
  }
});

router.get("/context", async (_req, res) => {
  try {
    const context = await buildProjectContext({ maxFiles: 24, maxCharsPerFile: 1800 });
    res.json({
      ok: true,
      root: context.root,
      totalFiles: context.totalFiles,
      summary: context.summary,
      snippets: context.snippets.map((file) => ({
        path: file.path,
        type: file.type,
        bytes: file.bytes,
        preview: file.content ? file.content.slice(0, 600) : undefined,
        error: file.error,
      })),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Context yig‘ilmadi." });
  }
});

router.post("/analyze", async (req, res) => {
  const query = String(req.body?.query || req.body?.message || "").trim() ||
    "Loyihaning umumiy tuzilmasini, asosiy modullarini va xavfsizlik holatini tahlil qiling.";

  const client = getClient();
  if (!client) {
    return res.status(400).json({
      ok: false,
      error: "OPENAI_API_KEY topilmadi. Railway Variables ichiga OPENAI_API_KEY qo‘shing.",
    });
  }

  try {
    const context = await buildProjectContext({ maxFiles: 30, maxCharsPerFile: 2200 });
    const completion = await client.chat.completions.create({
      model: getModel(),
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "Siz SEG KIP Platform loyihasini tahlil qiluvchi senior Node.js/KIP AI yordamchisiz. " +
            "Fayllar ichidan maxfiy kalitlarni so‘ramang va ko‘rsatmang. Javobni qisqa, amaliy va aniq bering.",
        },
        {
          role: "user",
          content:
            `Foydalanuvchi so‘rovi: ${query}\n\n` +
            `Loyiha konteksti:\n${context.contextText}`,
        },
      ],
    });

    const analysis = completion.choices?.[0]?.message?.content || "Tahlil javobi olinmadi.";
    res.json({ ok: true, analysis, filesUsed: context.snippets.map((f) => f.path) });
  } catch (error) {
    console.error("PROJECT_ANALYZE_ERROR:", error?.message || error);
    res.status(500).json({ ok: false, error: error?.message || "Project analyze xatosi." });
  }
});

export default router;
