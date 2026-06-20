import express from "express";
import OpenAI from "openai";

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

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "SEG KIP AI Assistant",
    ai: getApiKey() ? "configured" : "missing_api_key",
    model: getModel(),
  });
});

router.post("/", async (req, res) => {
  const userMessage = String(req.body?.message || "").trim();

  if (!userMessage) {
    return res.status(400).json({ error: "Savol bo‘sh bo‘lmasin." });
  }

  const client = getClient();
  if (!client) {
    return res.status(200).json({
      answer:
        "AI yordamchi hozir demo rejimda. Railway → Variables bo‘limiga OPENAI_API_KEY qo‘shilmagan yoki noto‘g‘ri nom bilan kiritilgan.\n\n" +
        "To‘g‘ri sozlash:\n" +
        "1) Railway → SEG-KIP-AI-Platform → Variables\n" +
        "2) OPENAI_API_KEY = sizning OpenAI API kalitingiz\n" +
        "3) OPENAI_MODEL = gpt-4o-mini yoki gpt-4.1-mini\n" +
        "4) Deploy/Redeploy qiling.",
      mode: "demo",
      missing: "OPENAI_API_KEY",
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model: getModel(),
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: `Siz SEG KIP Platform ichidagi professional KIP AI yordamchisiz.
Til: foydalanuvchi qaysi tilda yozsa, shu tilda javob bering.
Soha: neft-gaz, KIP, o‘lchov vositalari, manometr, termometr, sarf o‘lchagich, bosim datchigi, EKM, ТО-1/ТО-2, qiyoslov, pasport, formular, texnik hujjatlar.
Korxona konteksti: СП ООО "SANOAT ENERGETIKA GURUHI", ТПП "АНДИЖАН".
Vazifa: foydalanuvchiga KIP platforma, Excel baza, PDF pasport, qidiruv, filtr, hisobot va texnik tahlilda aniq yordam berish.
Javoblar qisqa, aniq, professional va amaliy bo‘lsin.`,
        },
        { role: "user", content: userMessage },
      ],
    });

    const answer = completion.choices?.[0]?.message?.content || "AI javob qaytarmadi.";
    res.json({ answer, mode: "ai", model: getModel() });
  } catch (error) {
    const status = error?.status || error?.response?.status || 500;
    const message = error?.message || "Noma’lum xato";
    console.error("OPENAI_ERROR:", status, message);
    res.status(500).json({
      error: "AI ulanishida xatolik. Railway Variables ichidagi OPENAI_API_KEY, OPENAI_MODEL va OpenAI billing holatini tekshiring.",
      details: message,
      status,
    });
  }
});

export default router;
