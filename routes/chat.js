import express from "express";
import OpenAI from "openai";
import { buildProjectContext } from "../services/projectContextService.js";
import { getSheetsClient, getSpreadsheetId } from "../config/google.js";

const router = express.Router();
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_VISIBLE_TEXT_LENGTH = 10000;

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

function norm(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function colName(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetRange(name, rows = 1000, cols = 26) {
  return `'${String(name).replace(/'/g, "''")}'!A1:${colName(cols - 1)}${rows}`;
}

function getQuestionTerms(question) {
  const q = norm(question);
  const terms = [];
  if (q.includes("davlen") || q.includes("давлен") || q.includes("bosim") || q.includes("pressure")) {
    terms.push("датчик давления", "давления датчик", "датчик давлен", "bosim datchigi", "pressure sensor", "давлен", "bosim", "pressure");
  }
  for (const word of String(question).split(/\s+/)) {
    const w = word.replace(/[.,!?;:()\[\]{}]/g, "").trim();
    if (w.length >= 4) terms.push(w);
  }
  return [...new Set(terms.map(norm).filter(Boolean))].slice(0, 20);
}

function scoreSheet(name, question, page = {}) {
  const n = norm(name), q = norm(question), title = norm(page.title), menu = norm(page.activeMenu), module = norm(page.module);
  let score = 0;
  if (title.includes(n) || menu.includes(n)) score += 8;
  if (module && n.includes(module)) score += 4;
  if (q.includes("quduq") || q.includes("кудук") || q.includes("қудуқ") || module.includes("journal")) {
    if (n.includes("куд") || n.includes("қуд") || n.includes("quduq") || n.includes("база") || n.includes("обш")) score += 12;
  }
  if (q.includes("акт") || q.includes("akt") || module.includes("acts")) {
    if (n.includes("акт") || n.includes("akt")) score += 12;
  }
  if (q.includes("улч") || q.includes("ўлч") || q.includes("olchov") || module.includes("ulchov")) {
    if (n.includes("улч") || n.includes("ўлч") || n.includes("воситал") || n.includes("база") || n.includes("обш")) score += 12;
  }
  if (n.includes("база") || n.includes("обш") || n.includes("base")) score += 3;
  return score;
}

function rowHasTerms(row, terms) {
  const joined = norm(row.join(" | "));
  return terms.some((t) => joined.includes(t));
}

function shouldAttachSheetContext(text, body) {
  if (body?.includeSheetsContext === true) return true;
  if (body?.includeSheetsContext === false) return false;
  const q = norm(text);
  return [
    "nechta", "soni", "sanab", "hisobla", "count", "jadval", "sheet", "sheets", "excel", "baza", "malumot", "ma'lumot",
    "datchik", "датчик", "manometr", "манометр", "ulchov", "ўлчов", "qiyos", "акт", "akt", "quduq", "қудуқ", "кудук"
  ].some((x) => q.includes(x));
}

async function sheetsContextMessage(text, body) {
  if (!shouldAttachSheetContext(text, body)) return null;
  try {
    const page = body?.currentPage || {};
    const terms = getQuestionTerms(text);
    const sheets = await getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
    const names = (meta.data.sheets || []).map((s) => s.properties.title);
    const selected = names
      .map((name) => ({ name, score: scoreSheet(name, text, page) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 10);
    const ranges = selected.map((s) => sheetRange(s.name, 1000, 26));
    const data = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });

    const counts = [];
    const blocks = [];
    for (let i = 0; i < selected.length; i++) {
      const name = selected[i].name;
      const rows = data.data.valueRanges?.[i]?.values || [];
      let count = 0;
      const samples = [];
      rows.slice(1).forEach((row, idx) => {
        if (terms.length && rowHasTerms(row, terms)) {
          count += 1;
          if (samples.length < 20) samples.push(`R${idx + 2}: ${row.join(" | ")}`);
        }
      });
      counts.push(`- ${name}: ${count} / ${Math.max(0, rows.length - 1)}`);
      const preview = samples.length ? samples.join("\n") : rows.slice(0, 8).map((r, idx) => `R${idx + 1}: ${r.join(" | ")}`).join("\n");
      blocks.push(`### ${name}\n${preview}`);
    }

    return {
      role: "system",
      content:
        "Google Sheets real data contexti. Quyidagi ma’lumotlar server orqali spreadsheetdan o‘qildi. " +
        "Agar foydalanuvchi son so‘rasa, counts bo‘yicha aniq javob bering.\n" +
        `Savol: ${text}\n` +
        `Qidiruv terminlari: ${terms.join(", ")}\n` +
        `Tekshirilgan varoqlar: ${selected.map((s) => s.name).join(", ")}\n` +
        `Counts:\n${counts.join("\n")}\n\n` +
        blocks.join("\n\n").slice(0, 16000),
    };
  } catch (error) {
    return {
      role: "system",
      content: `Google Sheets context olinmadi: ${error?.message || "noma’lum xato"}. Agar Google Sheets savoli bo‘lsa, foydalanuvchiga Railway Variables va Sheet share sozlamalarini tekshirishni ayting.`,
    };
  }
}

function systemPrompt() {
  return {
    role: "system",
    content: `Siz SEG KIP Platform ichidagi professional KIP AI yordamchisiz.
Til: foydalanuvchi qaysi tilda yozsa, shu tilda javob bering.
Soha: neft-gaz, KIP, o‘lchov vositalari, manometr, termometr, sarf o‘lchagich, bosim datchigi, EKM, ТО-1/ТО-2, qiyoslov, pasport, formular, texnik hujjatlar.
Korxona konteksti: СП ООО "SANOAT ENERGETIKA GURUHI", ТПП "АНДИЖАН".
Vazifa: foydalanuvchiga KIP platforma, Excel baza, PDF pasport, qidiruv, filtr, hisobot va texnik tahlilda aniq yordam berish.
Muhim qoida: foydalanuvchi bilan oldingi suhbat kontekstini hisobga oling.
Agar Google Sheets contexti berilsa, uni asosiy manba deb oling va sonli savollarda counts bo‘yicha aniq javob bering.
Agar joriy oyna/modul contexti berilsa, foydalanuvchi qaysi oynada turganini va o‘sha oynadagi ko‘rinayotgan jadval/matn ma’lumotlarini hisobga olib javob bering.
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
    activeMenu: String(page.activeMenu || "").slice(0, 160),
    path: String(page.path || "").slice(0, 240),
    frameSrc: String(page.frameSrc || "").slice(0, 240),
    url: String(page.url || "").slice(0, 240),
    visibleText: String(page.visibleText || "").slice(0, MAX_VISIBLE_TEXT_LENGTH),
    tableText: String(page.tableText || "").slice(0, MAX_VISIBLE_TEXT_LENGTH),
  };
  return {
    role: "system",
    content:
      "Joriy foydalanuvchi oynasi/moduli contexti:\n" +
      `- module: ${safe.module || "unknown"}\n` +
      `- title: ${safe.title || "unknown"}\n` +
      `- subtitle: ${safe.subtitle || ""}\n` +
      `- active menu: ${safe.activeMenu || ""}\n` +
      `- iframe/module path: ${safe.frameSrc || safe.path || ""}\n` +
      `- browser url: ${safe.url || ""}\n\n` +
      "Joriy oynada ko‘rinayotgan jadval/matn snapshoti:\n" +
      `${safe.tableText || safe.visibleText || "[visible data topilmadi]"}\n\n` +
      "Agar foydalanuvchi 'shu oyna', 'bu bo‘lim', 'hozir qayerdaman', 'nechta datchik' desa, yuqoridagi snapshotdan foydalaning.",
  };
}

function cleanMessage(item) {
  const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null;
  const content = String(item?.content || "").trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!role || !content) return null;
  return { role, content };
}

function buildConversationMessages(body, extraContexts = []) {
  const incomingHistory = Array.isArray(body?.messages)
    ? body.messages.map(cleanMessage).filter(Boolean)
    : [];
  const singleMessage = String(body?.message || "").trim().slice(0, MAX_MESSAGE_LENGTH);
  const history = incomingHistory.slice(-MAX_HISTORY_MESSAGES);
  if (!history.length && singleMessage) history.push({ role: "user", content: singleMessage });
  const lastUserMessage = [...history].reverse().find((msg) => msg.role === "user")?.content || "";
  const contexts = extraContexts.filter(Boolean);
  return {
    messages: [systemPrompt(), ...contexts, ...history],
    lastUserMessage,
    contextMessages: history.length,
    projectContextAttached: contexts.some((m) => String(m.content || "").includes("project contexti")),
    pageContextAttached: contexts.some((m) => String(m.content || "").includes("Joriy foydalanuvchi")),
    sheetsContextAttached: contexts.some((m) => String(m.content || "").includes("Google Sheets real data")),
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
    visibleDataContext: "enabled",
    sheetsContext: "enabled",
    projectContext: "enabled",
    maxHistoryMessages: MAX_HISTORY_MESSAGES,
  });
});

router.post("/", async (req, res) => {
  const userText = String(req.body?.message || "").trim();
  const pageContext = currentPageMessage(req.body);
  const sheetContext = await sheetsContextMessage(userText, req.body);
  const projectContext = await projectContextMessage(userText, req.body);
  const { messages, lastUserMessage, contextMessages, projectContextAttached, pageContextAttached, sheetsContextAttached } = buildConversationMessages(req.body, [pageContext, sheetContext, projectContext]);

  if (!lastUserMessage) return res.status(400).json({ error: "Savol bo‘sh bo‘lmasin." });

  const client = getClient();
  if (!client) {
    return res.status(200).json({ answer: "AI yordamchi demo rejimda. Railway Variables ichiga OPENAI_API_KEY qo‘shing va Redeploy qiling.", mode: "demo" });
  }

  try {
    const completion = await client.chat.completions.create({ model: getModel(), temperature: 0.25, messages });
    const answer = completion.choices?.[0]?.message?.content || "AI javob qaytarmadi.";
    res.json({ answer, mode: "ai", model: getModel(), contextMessages, projectContextAttached, pageContextAttached, sheetsContextAttached });
  } catch (error) {
    const status = error?.status || error?.response?.status || 500;
    const message = error?.message || "Noma’lum xato";
    console.error("OPENAI_ERROR:", status, message);
    res.status(500).json({ error: "AI ulanishida xatolik. Railway Variables, Google Sheets share va billing holatini tekshiring.", details: message, status });
  }
});

export default router;
