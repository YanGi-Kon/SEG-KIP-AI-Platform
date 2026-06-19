import express from "express";
import OpenAI from "openai";

const router = express.Router();

function getClient() {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-"));
  return hasApiKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
}

router.post("/", async (req, res) => {
  const userMessage = String(req.body?.message || "").trim();

  if (!userMessage) {
    return res.status(400).json({ error: "Savol bo‘sh bo‘lmasin." });
  }

  const client = getClient();
  if (!client) {
    return res.json({
      answer:
        "Demo rejim: OpenAI API key .env faylga kiritilmagan.\n\n" +
        "AI to‘liq ishlashi uchun .env fayl yarating yoki Railway Variables ichiga OPENAI_API_KEY qo‘shing.\n" +
        "Hozircha TAG qidiruv va lokal baza ishlaydi.",
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
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
    res.json({ answer });
  } catch (error) {
    console.error("OPENAI_ERROR:", error?.message || error);
    res.status(500).json({
      error: "AI ulanishida xatolik. OPENAI_API_KEY, internet, billing yoki model nomini tekshiring.",
      details: error?.message || "Noma’lum xato",
    });
  }
});

export default router;
