// SEG KIP modular frontend controller
const MODULES = {
  journal: 'modules/kuduk-journal.html',
  acts: 'modules/acts.html',
  faults: 'modules/faults.html',
  to: 'modules/to.html',
  replacement: 'modules/replacement.html',
  openai: 'modules/openai.html',
};

const SHEET_LINK_KEYS = [
  'seg_kip_sheet_url',
  'segKipSheetUrl',
  'spreadsheetUrl',
  'sheetUrl',
  'googleSheetUrl',
  'kuduk_spreadsheet_url'
];
const AI_HISTORY_KEY = 'seg_kip_ai_chat_history';
const AI_MAX_HISTORY_MESSAGES = 20;
let activeModuleName = 'journal';
let lastServerSheetUrl = '';
let aiHistory = loadAiHistory();

function normalizeSpreadsheetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https:\/\/docs\.google\.com\/spreadsheets\/d\//i.test(raw)) return raw;
  const idMatch = raw.match(/[-\w]{25,}/);
  return idMatch ? `https://docs.google.com/spreadsheets/d/${idMatch[0]}/edit` : '';
}

function readLocalSheetUrl() {
  for (const key of SHEET_LINK_KEYS) {
    try {
      const url = normalizeSpreadsheetUrl(localStorage.getItem(key));
      if (url) return url;
    } catch (_) {}
  }
  try {
    const state = JSON.parse(localStorage.getItem('seg_kip_config') || '{}');
    const url = normalizeSpreadsheetUrl(state.spreadsheetUrl || state.sheetUrl || state.url);
    if (url) return url;
  } catch (_) {}
  const input = document.getElementById('sheetUrl');
  return normalizeSpreadsheetUrl(input?.value);
}

async function readServerSheetUrl() {
  if (lastServerSheetUrl) return lastServerSheetUrl;
  const candidates = ['/api/kuduk/state?sexId=sex_4', '/api/kuduk/state?sexId=sex_default'];
  for (const endpoint of candidates) {
    try {
      const res = await fetch(endpoint);
      const data = await res.json().catch(() => ({}));
      const url = normalizeSpreadsheetUrl(data.spreadsheetUrl || data.spreadsheetId || data.url);
      if (url) { lastServerSheetUrl = url; return url; }
    } catch (_) {}
  }
  return '';
}

async function getConfiguredSheetUrl() {
  return readLocalSheetUrl() || await readServerSheetUrl();
}

async function openCurrentExcel() {
  const url = await getConfiguredSheetUrl();
  if (!url) {
    alert('Google Sheets ҳаволаси киритилмаган');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function showExcelButton(visible = true) {
  document.querySelectorAll('.seg-excel-button').forEach(btn => {
    btn.style.display = visible ? 'inline-flex' : 'none';
  });
}

function setGlobalOnlineStatus(status) {
  const normalized = String(status || '').toUpperCase();
  document.querySelectorAll('.status-pill, .online-badge, .status-online').forEach(el => {
    if (normalized === 'ONLINE') {
      el.textContent = '● ONLINE';
      el.style.color = '#86efac';
      el.style.borderColor = 'rgba(34,197,94,.45)';
    } else if (normalized === 'SYNCING') {
      el.textContent = '● SYNCING';
      el.style.color = '#fde68a';
      el.style.borderColor = 'rgba(245,158,11,.45)';
    } else if (normalized === 'OFFLINE') {
      el.textContent = '● OFFLINE';
      el.style.color = '#fca5a5';
      el.style.borderColor = 'rgba(239,68,68,.45)';
    }
  });
}

function setActiveMenu(label) {
  document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
  const target = Array.from(document.querySelectorAll('.menu-item')).find(item => item.textContent.includes(label));
  if (target) target.classList.add('active');
}

function setTopbar(title, subtitle) {
  const h = document.querySelector('.topbar h2');
  const p = document.querySelector('.topbar p');
  if (h) h.textContent = title || 'SEG KIP AI Platform';
  if (p) p.textContent = subtitle || 'Нефт-газ соҳаси учун журналлар ва КИП назорат интерфейси';
}

function hideAllPages() {
  const dash = document.getElementById('journalDashboard');
  const ulchov = document.getElementById('ulchovIntegratedPage');
  const generic = document.getElementById('genericModulePage');
  if (dash) dash.style.display = 'none';
  if (ulchov) ulchov.classList.remove('active');
  if (generic) generic.classList.remove('active');
}

function openDashboard() {
  return openModulePage('journal', 'SEG KIP AI Platform — Қудуқлар рўйхати журнали');
}

function openHomeDashboard() {
  activeModuleName = 'home';
  showExcelButton(false);
  const dash = document.getElementById('journalDashboard');
  const generic = document.getElementById('genericModulePage');
  const ulchov = document.getElementById('ulchovIntegratedPage');
  if (generic) generic.classList.remove('active');
  if (ulchov) ulchov.classList.remove('active');
  if (dash) dash.style.display = '';
  setActiveMenu('ЖУРНАЛ УЧЕТА');
  setTopbar('SEG KIP AI Platform', 'Нефт-газ соҳаси учун журналлар ва КИП назорат интерфейси');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openUlchovVositalari() {
  activeModuleName = 'ulchov';
  showExcelButton(true);
  hideAllPages();
  const page = document.getElementById('ulchovIntegratedPage');
  if (page) page.classList.add('active');
  setActiveMenu('УЛЧОВ ВОСИТАЛАРИ');
  setTopbar('SEG KIP AI Platform — Ўлчов воситалари', 'Алоҳида modules/ulchov.html файлидан юкланади');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeUlchovVositalari() {
  openHomeDashboard();
}

function openModulePage(moduleName, title) {
  activeModuleName = moduleName || 'journal';
  showExcelButton(true);
  const src = MODULES[moduleName];
  if (!src) return openDashboard();
  hideAllPages();
  const page = document.getElementById('genericModulePage');
  const frame = document.getElementById('genericModuleFrame');
  if (frame) frame.src = src;
  if (page) page.classList.add('active');
  const menuLabels = {journal:'ЖУРНАЛ УЧЕТА', acts:'АКТЛАР ЖУРНАЛИ', faults:'НОСОЗЛИКЛАР ЖУРНАЛИ', to:'ТО ЖУРНАЛ', replacement:'АЛМАШИШ ЖУРНАЛИ'};
  setActiveMenu(menuLabels[moduleName] || 'ЖУРНАЛ УЧЕТА');
  setTopbar(title || 'SEG KIP AI Platform — Модул', 'Модул алоҳида HTML файлдан юкланади');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadAiHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_HISTORY_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(msg => ['user', 'assistant'].includes(msg?.role) && String(msg?.content || '').trim())
      .slice(-AI_MAX_HISTORY_MESSAGES);
  } catch (_) {
    return [];
  }
}

function saveAiHistory() {
  try {
    localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(aiHistory.slice(-AI_MAX_HISTORY_MESSAGES)));
  } catch (_) {}
}

function pushAiHistory(role, content) {
  const text = String(content || '').trim();
  if (!text || !['user', 'assistant'].includes(role)) return;
  aiHistory.push({ role, content: text });
  aiHistory = aiHistory.slice(-AI_MAX_HISTORY_MESSAGES);
  saveAiHistory();
}

function clearAiHistory() {
  aiHistory = [];
  saveAiHistory();
  setAiMessage('Suhbat tarixi tozalandi. Yangi suhbat boshlashingiz mumkin.');
}

function getAiPanelMessage() {
  return document.querySelector('.seg-ai-msg');
}

function setAiMessage(text) {
  const panelMsg = getAiPanelMessage();
  if (panelMsg) panelMsg.textContent = text;
}

function setAiInputDisabled(disabled) {
  const aiInput = document.querySelector('.seg-ai-input input');
  const aiButton = document.querySelector('#segAiSendButton');
  const analyzeButton = document.querySelector('#segAiAnalyzeButton');
  if (aiInput) aiInput.disabled = disabled;
  if (aiButton) aiButton.disabled = disabled;
  if (analyzeButton) analyzeButton.disabled = disabled;
}

async function sendAiMessage(message) {
  const text = String(message || '').trim();
  if (!text) return;

  pushAiHistory('user', text);
  setAiInputDisabled(true);
  setAiMessage('AI жавоб тайёрлаяпти...');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        messages: aiHistory.slice(-AI_MAX_HISTORY_MESSAGES),
      }),
    });
    const data = await res.json().catch(() => ({}));
    const answer = data.answer || data.error || data.details || 'AI жавоб қайтармади.';
    pushAiHistory('assistant', answer);
    setAiMessage(answer);
  } catch (err) {
    setAiMessage('AI серверга уланишда хато: ' + (err?.message || 'номаълум хато'));
  } finally {
    setAiInputDisabled(false);
    const aiInput = document.querySelector('.seg-ai-input input');
    if (aiInput) {
      aiInput.value = '';
      aiInput.focus();
    }
  }
}

async function sendAiAnalysis(message) {
  const text = String(message || '').trim() ||
    'Iltimos, loyiha fayllari va Google Sheets ma\'lumotlari asosida umumiy tahlil va taklif bering.';
  setAiInputDisabled(true);
  setAiMessage('AI tahlil qilinyapti...');
  try {
    const res = await fetch('/api/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text, messages: aiHistory.slice(-AI_MAX_HISTORY_MESSAGES) }),
    });
    const data = await res.json().catch(() => ({}));
    setAiMessage(data.analysis || data.error || data.details || 'AI tahlil javobi kelmadi.');
  } catch (err) {
    setAiMessage('AI serverga ulanishda xato: ' + (err?.message || 'noma\'lum xato'));
  } finally {
    setAiInputDisabled(false);
  }
}

async function checkAiStatus() {
  try {
    const res = await fetch('/api/chat');
    const data = await res.json().catch(() => ({}));
    if (data.ai === 'missing_api_key') {
      setAiMessage('AI yordamchi ulandi, lekin Railway Variables ichida OPENAI_API_KEY hali yo‘q. Kalit qo‘shilgandan keyin real ChatGPT javob beradi.');
    } else if (data.ai === 'configured') {
      const historyNote = aiHistory.length ? ` Avvalgi suhbat tarixi: ${aiHistory.length} ta xabar.` : '';
      setAiMessage('AI yordamchi tayyor. Savolingizni yozing.' + historyNote);
    }
  } catch (_) {
    setAiMessage('AI yordamchi server bilan bog‘lana olmadi. Sahifani yangilang yoki deploy loglarini tekshiring.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const aiInput = document.querySelector('.seg-ai-input input');
  const aiButton = document.querySelector('#segAiSendButton');
  const analyzeButton = document.querySelector('#segAiAnalyzeButton');

  if (aiButton && aiInput) {
    aiButton.addEventListener('click', () => sendAiMessage(aiInput.value));
    aiInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') sendAiMessage(aiInput.value);
    });
  }

  if (analyzeButton && aiInput) {
    analyzeButton.addEventListener('click', () => sendAiAnalysis(aiInput.value));
  }

  checkAiStatus();
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'SEG_SHEET_URL' && event.data.url) {
    try { localStorage.setItem('seg_kip_sheet_url', event.data.url); } catch (_) {}
    lastServerSheetUrl = normalizeSpreadsheetUrl(event.data.url);
  }
  if (event.data?.type === 'SEG_ACTS_STATUS') {
    setGlobalOnlineStatus(event.data.status);
  }
  if (event.data?.type === 'SEG_CLOSE_ULCHOV' || event.data?.type === 'SEG_CLOSE_MODULE') {
    openDashboard();
  }
});

window.clearSegAiHistory = clearAiHistory;
