import express from "express";

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

export default router;
