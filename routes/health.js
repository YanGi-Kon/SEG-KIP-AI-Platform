import express from "express";
import { getAppConfig } from "../config/env.js";
import { checkDatabase } from "../db/pool.js";

const router = express.Router();

router.get("/", (req, res) => {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-"));
  res.json({
    ok: true,
    ai: hasApiKey ? "connected" : "demo-mode",
    message: hasApiKey
      ? "OpenAI API key topildi. AI rejim ishlaydi."
      : "OPENAI_API_KEY topilmadi. Platforma demo rejimda ishlayapti.",
  });
});

router.get("/readiness", async (req, res) => {
  try {
    const config = getAppConfig();
    const database = await checkDatabase();
    const databaseRequired = config.features.workspaceModeEnabled;
    const ready = !databaseRequired || database.connected;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      mode: databaseRequired ? "workspace" : "legacy",
      databaseRequired,
      database: {
        configured: database.configured,
        connected: database.connected,
        latencyMs: database.latencyMs,
      },
    });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

export default router;
