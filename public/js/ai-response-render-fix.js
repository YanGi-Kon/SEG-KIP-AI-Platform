(function installReliableAiResponseRenderer(){
  const HISTORY_KEY = 'seg_kip_ai_chat_history';
  const MAX_HISTORY = 20;
  const VISIBLE_LIMIT = 10000;

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  }

  function readHistory(){
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((msg) => ['user', 'assistant'].includes(msg?.role) && String(msg?.content || '').trim()).slice(-MAX_HISTORY);
    } catch (_) {
      return [];
    }
  }

  function writeHistory(history){
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY))); } catch (_) {}
  }

  function pushHistory(role, content){
    const text = String(content || '').trim();
    if (!text) return readHistory();
    const history = readHistory();
    history.push({ role, content: text });
    const next = history.slice(-MAX_HISTORY);
    writeHistory(next);
    return next;
  }

  function getPanelMessage(){
    return document.querySelector('.seg-ai-msg');
  }

  function render(history, extraHtml = ''){
    const panel = getPanelMessage();
    if (!panel) return;
    const recent = (history || readHistory()).slice(-10);
    const bubbles = recent.map((msg) => `<div class="seg-ai-bubble ${escapeHtml(msg.role)}">${escapeHtml(msg.content)}</div>`).join('');
    panel.innerHTML = `<div class="seg-ai-chat">${bubbles}${extraHtml}</div>`;
    const chat = panel.querySelector('.seg-ai-chat');
    if (chat) requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
  }

  function diagnosticCard(data){
    const code = data?.code || data?.status || 'AI_RESPONSE_ERROR';
    const error = data?.error || data?.details || data?.message || 'AI javobini ko‘rsatib bo‘lmadi.';
    const fix = data?.recommendedFix || 'Backend response, Railway deploy loglari va browser console xabarlarini tekshiring.';
    return `<div class="ai-diagnostic-card"><div class="ai-diagnostic-title">AI yordamchi xatosi</div><div><b>Kod:</b> ${escapeHtml(code)}</div><div><b>Sabab:</b> ${escapeHtml(error)}</div><div class="ai-diagnostic-fix"><b>Yechim:</b> ${escapeHtml(fix)}</div></div>`;
  }

  function setDisabled(disabled){
    document.querySelectorAll('.seg-ai-input input, .assistant .input-row input').forEach((input) => { input.disabled = disabled; });
    document.querySelectorAll('#segAiSendButton, #segAiAnalyzeButton, .assistant .input-row button').forEach((button) => { button.disabled = disabled; });
  }

  function setBadge(status, model){
    const badge = document.querySelector('.seg-ai-status-badge');
    if (!badge) return;
    const text = status === 'online' ? 'AI ONLINE' : status || 'AI CHECKING';
    badge.textContent = text + (model ? ' · ' + model : '');
    badge.classList.toggle('error', Boolean(status && String(status).includes('ERROR')));
    badge.classList.toggle('demo', status !== 'AI ONLINE' && status !== 'online' && !String(status || '').includes('ERROR'));
  }

  function visibleContext(){
    try {
      const frame = document.getElementById('genericModulePage')?.classList.contains('active')
        ? document.getElementById('genericModuleFrame')
        : document.getElementById('ulchovIntegratedPage')?.classList.contains('active')
          ? document.getElementById('claUlchovFrame')
          : null;
      const frameDoc = frame?.contentDocument || frame?.contentWindow?.document;
      const tableText = frameDoc ? Array.from(frameDoc.querySelectorAll('table tr')).slice(0, 120).map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => cell.textContent.trim()).filter(Boolean).join(' | ')).filter(Boolean).join('\n') : '';
      return {
        module: window.getSegCurrentPageContext?.().module || 'unknown',
        title: document.querySelector('.topbar h2')?.textContent?.trim() || document.title || '',
        activeMenu: document.querySelector('.menu-item.active .menu-title')?.textContent?.trim() || '',
        visibleText: String(frameDoc?.body?.innerText || document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, VISIBLE_LIMIT),
        tableText: String(tableText || '').slice(0, VISIBLE_LIMIT),
      };
    } catch (_) {
      return { module: 'unknown', title: document.title || '', visibleText: '' };
    }
  }

  async function readJson(res){
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { ok:false, code:'AI_BAD_JSON', error:text }; }
  }

  function extractAnswer(data){
    return String(data?.answer || data?.message?.content || data?.content || data?.output_text || '').trim();
  }

  async function sendMessage(raw){
    const text = String(raw || '').trim();
    if (!text) return;
    let history = pushHistory('user', text);
    setDisabled(true);
    render(history, '<div class="seg-ai-bubble assistant">AI javob tayyorlayapti...</div>');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          messages: history.slice(-MAX_HISTORY),
          currentPage: visibleContext(),
        }),
      });
      const data = await readJson(res);
      console.log('[AI_CHAT_RESPONSE]', {
        status: res.status,
        ok: data.ok,
        hasAnswer: Boolean(extractAnswer(data)),
        mode: data.mode,
        model: data.model,
        code: data.code,
      });

      if (!res.ok || data.ok === false || data.error) {
        setBadge(data.code || 'AI_RESPONSE_ERROR', data.model);
        render(history, diagnosticCard(data));
        return;
      }

      const answer = extractAnswer(data) || 'AI javob bo‘sh qaytdi.';
      history = pushHistory('assistant', answer);
      setBadge('online', data.model || '');
      render(history);
    } catch (error) {
      const data = { code:'AI_NETWORK_ERROR', error:'AI serverga ulanishda xato: ' + (error?.message || 'noma’lum xato'), recommendedFix:'Sahifani yangilang yoki Railway deploy loglarini tekshiring.' };
      setBadge(data.code, '');
      render(history, diagnosticCard(data));
    } finally {
      setDisabled(false);
      document.querySelectorAll('.seg-ai-input input, .assistant .input-row input').forEach((input) => { input.value = ''; });
      document.querySelector('.seg-ai-input input')?.focus();
    }
  }

  function captureSend(event){
    const target = event.target;
    const sendButton = target.closest?.('#segAiSendButton, .assistant .input-row button');
    if (!sendButton) return;
    if (sendButton.id === 'segAiAnalyzeButton') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = sendButton.closest('.seg-ai-input, .input-row')?.querySelector('input') || document.querySelector('.seg-ai-input input');
    sendMessage(input?.value || '');
  }

  function captureEnter(event){
    if (event.key !== 'Enter') return;
    const input = event.target?.closest?.('.seg-ai-input input, .assistant .input-row input');
    if (!input) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendMessage(input.value);
  }

  function install(){
    if (window.__segReliableAiRendererInstalled) return;
    window.__segReliableAiRendererInstalled = true;
    document.addEventListener('click', captureSend, true);
    document.addEventListener('keydown', captureEnter, true);
    window.segKipSendAiMessageReliable = sendMessage;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
