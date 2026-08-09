// SEG KIP modular frontend controller
const MODULES = {
  journal: 'modules/kuduk-journal.html',
  acts: 'modules/acts.html',
  faults: 'modules/faults.html',
  to: 'modules/to.html',
  replacement: 'modules/replacement.html',
  openai: 'modules/openai.html',
  users: 'modules/users.html',
  settings: 'modules/settings.html',
  kuduk: 'modules/kuduk.html'
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
const AI_VISIBLE_TEXT_LIMIT = 10000;
let activeModuleName = 'journal';
let lastServerSheetUrl = '';
let aiHistory = loadAiHistory();
let aiStatus = { ai: 'checking', model: '', code: '' };
let aiControllerBound = false;
let aiRequestInFlight = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}

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
  // First try to get the URL from the currently selected workspace
  let url = '';
  try {
    const ws = window.segWorkspaceUi?.selectedWorkspace?.();
    if (ws?.spreadsheetUrl) {
      url = normalizeSpreadsheetUrl(ws.spreadsheetUrl);
    }
  } catch (_) {}
  
  // Fallback: read from localStorage or server
  if (!url) url = readLocalSheetUrl() || await readServerSheetUrl();
  
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
  document.querySelectorAll('.menu-item, .menu-item-settings').forEach(item => item.classList.remove('active'));
  const target = Array.from(document.querySelectorAll('.menu-item, .menu-item-settings')).find(item => {
    const titleEl = item.querySelector('.menu-title');
    const original = titleEl?.getAttribute('data-i18n') || '';
    return item.textContent.includes(label) || original.includes(label);
  });
  if (target) target.classList.add('active');
}

function setTopbar(title, subtitle) {
  const h = document.querySelector('.topbar h2');
  const p = document.querySelector('.topbar p');
  const t = title || 'SEG KIP AI Platform';
  const s = subtitle || 'Нефт-газ соҳаси учун журналлар ва КИП назорат интерфейси';
  if (h) {
    h.setAttribute('data-i18n', t);
    h.textContent = t;
  }
  if (p) {
    p.setAttribute('data-i18n', s);
    p.textContent = s;
  }
  if (typeof window.applyTranslations === 'function') {
    window.applyTranslations(document.querySelector('.topbar'));
  }
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
  const menuLabels = { journal:'ЖУРНАЛ УЧЕТА', acts:'АКТЛАР ЖУРНАЛИ', faults:'НОСОЗЛИКЛАР ЖУРНАЛИ', to:'ТО ЖУРНАЛ', replacement:'АЛМАШИШ ЖУРНАЛИ', users:'ПОЛЬЗОВАТЕЛИ', roles:'РОЛИ', settings:'НАСТРОЙКИ' };
  setActiveMenu(menuLabels[moduleName] || 'ЖУРНАЛ УЧЕТА');
  setTopbar(title || 'SEG KIP AI Platform — Модул', 'Модул алоҳида HTML файлдан юкланади');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadAiHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_HISTORY_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(msg => ['user', 'assistant'].includes(msg?.role) && String(msg?.content || '').trim()).slice(-AI_MAX_HISTORY_MESSAGES);
  } catch (_) {
    return [];
  }
}

function saveAiHistory() {
  try { localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(aiHistory.slice(-AI_MAX_HISTORY_MESSAGES))); } catch (_) {}
}

function pushAiHistory(role, content) {
  const text = String(content || '').trim();
  if (!text || !['user', 'assistant'].includes(role)) return;
  aiHistory.push({ role, content: text });
  aiHistory = aiHistory.slice(-AI_MAX_HISTORY_MESSAGES);
  saveAiHistory();
}

function getAiPanelMessage() {
  return document.querySelector('.seg-ai-msg');
}

function removeAiAnalysisUi() {
  document.getElementById('segAiAnalyzeButton')?.closest('.seg-ai-actions')?.remove();
  document.querySelectorAll('.seg-ai-actions').forEach(node => node.remove());
}

function injectAiUiStyles() {
  if (document.getElementById('segAiAssistantUxStyles')) return;
  const style = document.createElement('style');
  style.id = 'segAiAssistantUxStyles';
  style.textContent = `
    .seg-ai-status-badge{display:inline-flex;margin-top:8px;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:900;border:1px solid rgba(34,211,238,.35);color:#67e8f9;background:rgba(34,211,238,.12)}
    .seg-ai-status-badge.demo{color:#fde68a;border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.12)}
    .seg-ai-status-badge.error{color:#fecaca;border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.14)}
    .seg-ai-msg{max-height:360px;overflow-y:auto;scroll-behavior:smooth;min-height:90px}
    .seg-ai-chat{display:flex;flex-direction:column;gap:10px;min-height:70px;padding-right:4px}
    .seg-ai-bubble{border-radius:14px;padding:10px 12px;font-size:13px;line-height:1.45;white-space:pre-wrap;display:block;opacity:1;visibility:visible;word-break:break-word}
    .seg-ai-bubble.user{align-self:flex-end;background:rgba(34,211,238,.16);border:1px solid rgba(34,211,238,.3);color:#dffbff;max-width:92%}
    .seg-ai-bubble.assistant{align-self:flex-start;background:rgba(15,23,42,.75);border:1px solid rgba(148,163,184,.25);color:#e5f4ff;max-width:96%}
    .seg-ai-bubble.loading{opacity:.78;color:#bfdbfe}
    .ai-diagnostic-card{border:1px solid rgba(239,68,68,.35);background:rgba(127,29,29,.18);border-radius:14px;padding:12px;color:#fecaca;font-size:13px;line-height:1.45}
    .ai-diagnostic-title{font-weight:900;color:#fff;margin-bottom:7px}
    .ai-diagnostic-fix{margin-top:9px;padding:9px;border-radius:10px;background:rgba(15,23,42,.6);color:#fde68a}
    .seg-ai-clear{margin-left:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#dffbff;border-radius:9px;padding:5px 8px;font-size:11px;font-weight:800;cursor:pointer}
    .assistant .ai-message.ready{border-color:rgba(34,211,238,.25);background:rgba(34,211,238,.08)}
  `;
  document.head.appendChild(style);
}

function aiStatusLabel() {
  if (aiStatus.ai === 'online') return { text: 'AI ONLINE', cls: '' };
  if (aiStatus.ai === 'configured') return { text: 'AI KEY PRESENT', cls: 'demo' };
  if (aiStatus.ai === 'missing_api_key') return { text: 'DEMO MODE', cls: 'demo' };
  if (aiStatus.code) return { text: aiStatus.code, cls: 'error' };
  return { text: 'AI CHECKING', cls: 'demo' };
}

function updateAiStatusBadge() {
  const head = document.querySelector('.seg-ai-panel-head');
  if (!head) return;
  let badge = head.querySelector('.seg-ai-status-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'seg-ai-status-badge';
    head.appendChild(badge);
  }
  const label = aiStatusLabel();
  badge.className = 'seg-ai-status-badge ' + label.cls;
  badge.textContent = label.text + (aiStatus.model ? ' · ' + aiStatus.model : '');
}

function markAiProviderError(data = {}) {
  aiStatus = { ai: 'error', code: data.code || 'AI_PROVIDER_ERROR', model: data.model || aiStatus.model || '' };
  updateAiStatusBadge();
  if (data.code === 'AI_AUTH_FAILED') setDashboardAssistantText('AI key mavjud, lekin OpenAI uni qabul qilmadi. Railway Variables ichidagi OPENAI_API_KEY qiymatini yangilang.');
}

function markAiOnline(data = {}) {
  aiStatus = { ai: 'online', model: data.model || aiStatus.model || '', code: '' };
  updateAiStatusBadge();
}

function setDashboardAssistantText(text) {
  const dashboardMsg = document.querySelector('.assistant .ai-message');
  if (!dashboardMsg) return;
  dashboardMsg.classList.add('ready');
  dashboardMsg.textContent = text;
}

function setAiMessage(text) {
  const panelMsg = getAiPanelMessage();
  if (panelMsg) panelMsg.textContent = text;
}

function ensureAiChat() {
  const panelMsg = getAiPanelMessage();
  if (!panelMsg) return null;
  let chat = panelMsg.querySelector('.seg-ai-chat');
  if (!chat) {
    panelMsg.innerHTML = '<div class="seg-ai-chat"></div>';
    chat = panelMsg.querySelector('.seg-ai-chat');
  }
  return chat;
}

function scrollAiChat() {
  const panelMsg = getAiPanelMessage();
  if (panelMsg) requestAnimationFrame(() => { panelMsg.scrollTop = panelMsg.scrollHeight; });
}

function renderAiMessage(role, content, options = {}) {
  const chat = ensureAiChat();
  if (!chat) return null;
  const bubble = document.createElement('div');
  bubble.className = `seg-ai-bubble ${role}${options.loading ? ' loading' : ''}`;
  bubble.textContent = String(content || '').trim();
  if (options.loading) bubble.dataset.loading = 'true';
  chat.appendChild(bubble);
  scrollAiChat();
  return bubble;
}

function removeAiLoading() {
  document.querySelectorAll('.seg-ai-bubble[data-loading="true"]').forEach(node => node.remove());
}

function renderAiDiagnostic(data) {
  const chat = ensureAiChat();
  if (!chat) return;
  const code = data?.code || data?.status || 'AI_PROVIDER_ERROR';
  const error = data?.error || data?.details || data?.message || 'AI yordamchi javob qaytara olmadi.';
  const fix = data?.recommendedFix || 'Railway Variables, OpenAI API key, billing/quota va deploy loglarini tekshiring.';
  const card = document.createElement('div');
  card.className = 'ai-diagnostic-card';
  card.innerHTML = '<div class="ai-diagnostic-title">AI yordamchi xatosi</div><div><b>Kod:</b> '+escapeHtml(code)+'</div><div><b>Sabab:</b> '+escapeHtml(error)+'</div><div class="ai-diagnostic-fix"><b>Yechim:</b> '+escapeHtml(fix)+'</div></div>';
  chat.appendChild(card);
  scrollAiChat();
}

function renderAiHistory() {
  const panelMsg = getAiPanelMessage();
  if (!panelMsg) return;
  const recent = aiHistory.slice(-8);
  if (!recent.length) return;
  panelMsg.innerHTML = '<div class="seg-ai-chat"></div>';
  recent.forEach(msg => renderAiMessage(msg.role, msg.content));
}

function clearAiHistory() {
  aiHistory = [];
  saveAiHistory();
  const panelMsg = getAiPanelMessage();
  if (panelMsg) panelMsg.innerHTML = '<div class="seg-ai-chat"><div class="seg-ai-bubble assistant">Suhbat tarixi tozalandi. Yangi savol yozishingiz mumkin.</div></div>';
}

function setAiInputDisabled(disabled) {
  const inputs = document.querySelectorAll('.seg-ai-input input, .assistant .input-row input');
  const buttons = document.querySelectorAll('#segAiSendButton, .assistant .input-row button');
  inputs.forEach(input => { input.disabled = disabled; });
  buttons.forEach(button => { button.disabled = disabled; });
}

function getVisibleFrame() {
  const genericPage = document.getElementById('genericModulePage');
  const ulchovPage = document.getElementById('ulchovIntegratedPage');
  if (genericPage?.classList.contains('active')) return document.getElementById('genericModuleFrame');
  if (ulchovPage?.classList.contains('active')) return document.getElementById('claUlchovFrame');
  return null;
}

function normalizeVisibleText(text, limit = AI_VISIBLE_TEXT_LIMIT) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function getFrameSnapshot(frame) {
  try {
    const doc = frame?.contentDocument || frame?.contentWindow?.document;
    if (!doc) return { visibleText: '', tableText: '' };
    const tableRows = Array.from(doc.querySelectorAll('table tr')).slice(0, 250).map(row => Array.from(row.querySelectorAll('th,td')).map(cell => cell.textContent.trim()).filter(Boolean).join(' | ')).filter(Boolean);
    const cardTexts = Array.from(doc.querySelectorAll('[data-ai-context], .card, .module-card, .stat, .row, .item, .device, .table-row')).slice(0, 120).map(el => el.textContent.trim()).filter(Boolean);
    return { visibleText: normalizeVisibleText(doc.body?.innerText || ''), tableText: normalizeVisibleText([...tableRows, ...cardTexts].join('\n')) };
  } catch (_) {
    return { visibleText: '', tableText: '' };
  }
}

function readWorkspaceMeta() {
  const get = (key) => {
    try { return localStorage.getItem(key) || sessionStorage.getItem(key) || ''; } catch (_) { return ''; }
  };
  return { workspaceId: get('seg_kip_selected_workspace_id').slice(0, 80), workspaceName: get('seg_kip_selected_workspace_name').slice(0, 160) };
}

function getCurrentPageContext() {
  const topTitle = document.querySelector('.topbar h2')?.textContent?.trim() || document.title || '';
  const topSubtitle = document.querySelector('.topbar p')?.textContent?.trim() || '';
  const activeMenu = document.querySelector('.menu-item.active .menu-title')?.textContent?.trim() || '';
  const visibleFrame = getVisibleFrame();
  const snapshot = getFrameSnapshot(visibleFrame);
  return { module: activeModuleName || 'unknown', title: topTitle, subtitle: topSubtitle, activeMenu, frameSrc: visibleFrame?.getAttribute('src') || '', url: window.location.href, path: window.location.pathname, visibleText: snapshot.visibleText, tableText: snapshot.tableText, ...readWorkspaceMeta() };
}

async function readJsonResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch (_) { return { error: text }; }
}

async function sendAiMessage(message) {
  const text = String(message || '').trim();
  if (!text || aiRequestInFlight) return;
  removeAiAnalysisUi();
  aiRequestInFlight = true;
  pushAiHistory('user', text);
  renderAiMessage('user', text);
  renderAiMessage('assistant', 'AI javob tayyorlayapti...', { loading: true });
  setAiInputDisabled(true);
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, messages: aiHistory.slice(-AI_MAX_HISTORY_MESSAGES), currentPage: getCurrentPageContext() }),
    });
    const data = await readJsonResponse(res);
    console.log('[AI_CHAT_RESPONSE]', { status: res.status, ok: data.ok, hasAnswer: Boolean(data.answer), mode: data.mode, model: data.model, code: data.code });
    removeAiLoading();
    if (!res.ok || data.ok === false || data.error) {
      markAiProviderError(data);
      renderAiDiagnostic(data);
      return;
    }
    markAiOnline(data);
    const answer = String(data.answer || '').trim() || 'AI javob bo‘sh qaytdi.';
    pushAiHistory('assistant', answer);
    renderAiMessage('assistant', answer);
    console.log('[AI_RENDER_AFTER]', { innerText: getAiPanelMessage()?.innerText?.slice(0, 160), assistantBubbles: document.querySelectorAll('.seg-ai-bubble.assistant').length });
  } catch (err) {
    removeAiLoading();
    const diagnostic = { code: 'AI_NETWORK_ERROR', error: 'AI serverga ulanishda xato: ' + (err?.message || 'noma\'lum xato'), recommendedFix: 'Sahifani yangilang yoki Railway deploy loglarini tekshiring.' };
    markAiProviderError(diagnostic);
    renderAiDiagnostic(diagnostic);
  } finally {
    aiRequestInFlight = false;
    setAiInputDisabled(false);
    document.querySelectorAll('.seg-ai-input input, .assistant .input-row input').forEach(input => { input.value = ''; });
    document.querySelector('.seg-ai-input input')?.focus();
    removeAiAnalysisUi();
  }
}

async function checkAiStatus() {
  try {
    const res = await fetch('/api/chat');
    const data = await readJsonResponse(res);
    aiStatus = { ai: data.ai || 'unknown', model: data.model || '', code: data.code || '' };
    updateAiStatusBadge();
    if (data.ai === 'missing_api_key') {
      const msg = data.message || 'AI yordamchi demo rejimda. Railway Variables ichida OPENAI_API_KEY qo‘shing va Redeploy qiling.';
      setAiMessage(msg);
      setDashboardAssistantText('AI yordamchi demo rejimda. OPENAI_API_KEY qo‘shilgandan keyin real javob beradi.');
    } else if (data.ai === 'configured') {
      if (aiHistory.length) renderAiHistory(); else setAiMessage('AI key mavjud. Tekshirish uchun savol yozing.');
      setDashboardAssistantText('AI yordamchi platforma modullari, Google Sheets va joriy oyna konteksti asosida yordam beradi. Savolingizni yozing.');
    } else {
      setAiMessage(data.message || 'AI holati tekshirilmoqda.');
    }
  } catch (_) {
    aiStatus = { ai: 'error', code: 'AI_STATUS_ERROR', model: '' };
    updateAiStatusBadge();
    setAiMessage('AI yordamchi server bilan bog‘lana olmadi. Sahifani yangilang yoki deploy loglarini tekshiring.');
  }
}

function readAiInputFromTrigger(trigger) {
  const local = trigger?.closest?.('.seg-ai-input, .input-row')?.querySelector('input');
  return local || document.querySelector('.seg-ai-input input') || document.querySelector('.assistant .input-row input');
}

function bindAiUi() {
  injectAiUiStyles();
  removeAiAnalysisUi();
  if (aiControllerBound) return;
  aiControllerBound = true;
  document.addEventListener('click', (event) => {
    removeAiAnalysisUi();
    const blocked = event.target.closest?.('#segAiAnalyzeButton, .seg-ai-actions');
    if (blocked) {
      event.preventDefault();
      event.stopImmediatePropagation();
      removeAiAnalysisUi();
      return;
    }
    const sendButton = event.target.closest?.('#segAiSendButton, .assistant .input-row button, .assistant .quick button');
    if (!sendButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = readAiInputFromTrigger(sendButton);
    const message = sendButton.matches('.assistant .quick button') ? sendButton.textContent.trim() : input?.value;
    sendAiMessage(message);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const input = event.target.closest?.('.seg-ai-input input, .assistant .input-row input');
    if (!input) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendAiMessage(input.value);
  }, true);

  const head = document.querySelector('.seg-ai-panel-head');
  if (head && !head.querySelector('.seg-ai-clear')) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'seg-ai-clear';
    clear.textContent = 'Tarixni tozalash';
    clear.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); clearAiHistory(); });
    head.appendChild(clear);
  }

  const observer = new MutationObserver(removeAiAnalysisUi);
  observer.observe(document.body, { childList: true, subtree: true });
}

document.addEventListener('DOMContentLoaded', () => {
  bindAiUi();
  checkAiStatus();
  if (localStorage.getItem('sidebarCollapsed') === 'true') {
    const app = document.querySelector('.app');
    if (app) app.classList.add('sidebar-collapsed');
  }
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'SEG_SHEET_URL' && event.data.url) {
    try { localStorage.setItem('seg_kip_sheet_url', event.data.url); } catch (_) {}
    lastServerSheetUrl = normalizeSpreadsheetUrl(event.data.url);
  }
  if (event.data?.type === 'SEG_ACTS_STATUS') setGlobalOnlineStatus(event.data.status);
  if (event.data?.type === 'SEG_CLOSE_ULCHOV' || event.data?.type === 'SEG_CLOSE_MODULE') openDashboard();
});

window.clearSegAiHistory = clearAiHistory;
window.getSegCurrentPageContext = getCurrentPageContext;
window.segKipSendAiMessage = sendAiMessage;

window.toggleSidebar = function() {
  const app = document.querySelector('.app');
  if (app) {
    app.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', app.classList.contains('sidebar-collapsed'));
  }
};


window.addEventListener('seg-kip:workspace-change', (e) => {
  const wsName = e.detail?.workspace?.name;
  if (wsName) {
    const sidebarName = document.getElementById('activeWorkspaceNameSidebar');
    if (sidebarName) sidebarName.textContent = wsName;
  }
  
  const genericPage = document.getElementById('genericModulePage');
  if (genericPage?.classList.contains('active')) {
    const frame = document.getElementById('genericModuleFrame');
    if (frame && frame.src) {
      const currentSrc = frame.src;
      frame.src = 'about:blank';
      setTimeout(() => { frame.src = currentSrc; }, 50);
    }
  }

  const ulchovPage = document.getElementById('ulchovIntegratedPage');
  if (ulchovPage?.classList.contains('active')) {
    const frame = document.getElementById('claUlchovFrame');
    if (frame && frame.src) {
      const currentSrc = frame.src;
      frame.src = 'about:blank';
      setTimeout(() => { frame.src = currentSrc; }, 50);
    }
  }
});

