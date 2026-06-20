import express from "express";
import OpenAI from "openai";
import { buildProjectContext } from "../services/projectContextService.js";

const router = express.Router();
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

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

function systemPrompt() {
  return {
    role: "system",
    content: `Siz SEG KIP Platform ichidagi professional KIP AI yordamchisiz.
Til: foydalanuvchi qaysi tilda yozsa, shu tilda javob bering.
Soha: neft-gaz, KIP, o‘lchov vositalari, manometr, termometr, sarf o‘lchagich, bosim datchigi, EKM, ТО-1/ТО-2, qiyoslov, pasport, formular, texnik hujjatlar.
Korxona konteksti: СП ООО "SANOAT ENERGETIKA GURUHI", ТПП "АНДИЖАН".
Vazifa: foydalanuvchiga KIP platforma, Excel baza, PDF pasport, qidiruv, filtr, hisobot va texnik tahlilda aniq yordam berish.
Muhim qoida: foydalanuvchi bilan oldingi suhbat kontekstini hisobga oling. Agar foydalanuvchi "oldingi", "shu", "uni", "davom ettir" desa, oldingi xabarlar asosida javob bering.
Agar joriy oyna/modul contexti berilsa, foydalanuvchi qaysi oynada turganini hisobga olib javob bering.
Loyiha fayllari konteksti berilsa, uni tahlil qiling, lekin maxfiy kalit yoki .env mazmunini so‘ramang va ko‘rsatmang.
Javoblar qisqa, aniq, professional va amaliy bo‘lsin.`,
  };
}

function shouldAttachProjectContext(text, body) {
  if (body?.includeProjectContext === true) return true;
  if (body?.includeProjectContext === false) return false;
  const lower = String(text || "").toLowerCase();
  return [
    "loyiha", "loixa", "project", "fayl", "file", "kod", "code", "route", "server", "github",
    "tahlil", "analiz", "xato", "error", "module", "modul", "struktur", "api", "endpoint"
  ].some((word) => lower.includes(word));
}

async function projectContextMessage(text, body) {
  if (!shouldAttachProjectContext(text, body)) return null;
  try {
    const context = await buildProjectContext({ maxFiles: 18, maxCharsPerFile: 1400 });
    return {
      role: "system",
      content:
        "Quyida SEG KIP loyihasining xavfsiz project contexti berilgan. " +
        "Maxfiy fayllar (.env, service-account.json, node_modules) chiqarib tashlangan. " +
        "Foydalanuvchi loyihaga oid savol bersa, shu contextdan foydalaning.\n\n" +
        context.contextText,
    };
  } catch (error) {
    return {
      role: "system",
      content: `Project context olishda xatolik: ${error?.message || "noma’lum xato"}`,
    };
  }
}

function currentPageMessage(body) {
  const page = body?.currentPage || body?.pageContext;
  if (!page || typeof page !== "object") return null;
  const safe = {
    module: String(page.module || "").slice(0, 80),
    title: String(page.title || "").slice(0, 160),
    subtitle: String(page.subtitle || "").slice(0, 240),
    path: String(page.path || "").slice(0, 240),
    frameSrc: String(page.frameSrc || "").slice(0, 240),
    url: String(page.url || "").slice(0, 240),
  };
  return {
    role: "system",
    content:
      "Joriy foydalanuvchi oynasi/moduli contexti:\n" +
      `- module: ${safe.module || "unknown"}\n` +
      `- title: ${safe.title || "unknown"}\n` +
      `- subtitle: ${safe.subtitle || ""}\n` +
      `- iframe/module path: ${safe.frameSrc || safe.path || ""}\n` +
      `- browser url: ${safe.url || ""}\n` +
      "Agar foydalanuvchi 'shu oyna', 'bu bo‘lim', 'hozir qayerdaman' desa, shu ma’lumotga asoslaning.",
  };
}

function cleanMessage(item) {
  const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null;
  const content = String(item?.content || "").trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!role || !content) return null;
  return { role, content };
}

function buildConversationMessages(body, extraContext = null, pageContext = null) {
  const incomingHistory = Array.isArray(body?.messages)
    ? body.messages.map(cleanMessage).filter(Boolean)
    : [];

  const singleMessage = String(body?.message || "").trim().slice(0, MAX_MESSAGE_LENGTH);
  const history = incomingHistory.slice(-MAX_HISTORY_MESSAGES);

  if (!history.length && singleMessage) {
    history.push({ role: "user", content: singleMessage });
  }

  const lastUserMessage = [...history].reverse().find((msg) => msg.role === "user")?.content || "";
  const messages = [systemPrompt()];
  if (pageContext) messages.push(pageContext);
  if (extraContext) messages.push(extraContext);
  messages.push(...history);

  return {
    messages,
    lastUserMessage,
    contextMessages: history.length,
    projectContextAttached: Boolean(extraContext),
    pageContextAttached: Boolean(pageContext),
  };
}

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "SEG KIP AI Assistant",
    ai: getApiKey() ? "configured" : "missing_api_key",
    model: getModel(),
    context: "enabled",
    pageContext: "enabled",
    projectContext: "enabled",
    maxHistoryMessages: MAX_HISTORY_MESSAGES,
  });
});

router.post("/", async (req, res) => {
  const userText = String(req.body?.message || "").trim();
  const pageContext = currentPageMessage(req.body);
  const extraContext = await projectContextMessage(userText, req.body);
  const { messages, lastUserMessage, contextMessages, projectContextAttached, pageContextAttached } = buildConversationMessages(req.body, extraContext, pageContext);

  if (!lastUserMessage) {
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
      contextMessages,
      projectContextAttached,
      pageContextAttached,
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model: getModel(),
      temperature: 0.35,
      messages,
    });

    const answer = completion.choices?.[0]?.message?.content || "AI javob qaytarmadi.";
    res.json({ answer, mode: "ai", model: getModel(), contextMessages, projectContextAttached, pageContextAttached });
  } catch (error) {
    const status = error?.status || error?.response?.status || 500;
    const message = error?.message || "Noma’lum xato";
    console.error("OPENAI_ERROR:", status, message);
    res.status(500).json({
      error: "AI ulanishida xatolik. Railway Variables ichidagi OPENAI_API_KEY, OPENAI_MODEL va OpenAI billing holatini tekshiring.",
      details: message,
      status,
      contextMessages,
      projectContextAttached,
      pageContextAttached,
    });
  }
});

export default router;
