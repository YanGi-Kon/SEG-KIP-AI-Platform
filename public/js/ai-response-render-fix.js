(function segKipAiChatOnly(){
  const key = 'seg_kip_ai_chat_history';
  const max = 20;

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function removeAnalysis(){
    document.getElementById('segAiAnalyzeButton')?.closest('.seg-ai-actions')?.remove();
    document.querySelectorAll('.seg-ai-actions').forEach(n => n.remove());
  }

  function hist(){
    try {
      const v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v.filter(m => ['user','assistant'].includes(m?.role) && String(m?.content || '').trim()).slice(-max) : [];
    } catch (_) { return []; }
  }

  function save(h){
    try { localStorage.setItem(key, JSON.stringify(h.slice(-max))); } catch (_) {}
  }

  function add(role, content){
    const h = hist();
    const text = String(content || '').trim();
    if (text) h.push({ role, content: text });
    const next = h.slice(-max);
    save(next);
    return next;
  }

  function draw(h, extra){
    const box = document.querySelector('.seg-ai-msg');
    if (!box) return;
    const rows = (h || hist()).slice(-10).map(m => '<div class="seg-ai-bubble '+esc(m.role)+'">'+esc(m.content)+'</div>').join('');
    box.innerHTML = '<div class="seg-ai-chat">' + rows + (extra || '') + '</div>';
    const chat = box.querySelector('.seg-ai-chat');
    if (chat) setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 20);
  }

  function card(d){
    const code = d?.code || 'AI_ERROR';
    const err = d?.error || d?.details || d?.message || 'AI javob qaytara olmadi.';
    const fix = d?.recommendedFix || 'Railway deploy loglari va AI sozlamalarini tekshiring.';
    return '<div class="ai-diagnostic-card"><div class="ai-diagnostic-title">AI yordamchi xatosi</div><div><b>Kod:</b> '+esc(code)+'</div><div><b>Sabab:</b> '+esc(err)+'</div><div class="ai-diagnostic-fix"><b>Yechim:</b> '+esc(fix)+'</div></div>';
  }

  function disabled(v){
    document.querySelectorAll('.seg-ai-input input, .assistant .input-row input').forEach(i => { i.disabled = v; });
    document.querySelectorAll('#segAiSendButton, .assistant .input-row button').forEach(b => { b.disabled = v; });
  }

  function badge(status, model){
    const b = document.querySelector('.seg-ai-status-badge');
    if (!b) return;
    b.textContent = status + (model ? ' · ' + model : '');
    b.classList.toggle('error', status.includes('ERROR'));
  }

  async function json(res){
    const t = await res.text();
    if (!t) return {};
    try { return JSON.parse(t); } catch (_) { return { ok:false, code:'AI_BAD_RESPONSE', error:t }; }
  }

  function ctx(){
    try { return window.getSegCurrentPageContext?.() || { title: document.title }; }
    catch (_) { return { title: document.title }; }
  }

  async function send(text){
    text = String(text || '').trim();
    if (!text) return;
    removeAnalysis();
    let h = add('user', text);
    draw(h, '<div class="seg-ai-bubble assistant">AI javob tayyorlayapti...</div>');
    disabled(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, messages: h.slice(-max), currentPage: ctx() })
      });
      const data = await json(res);
      console.log('[AI_CHAT_RESPONSE]', { status: res.status, ok: data.ok, hasAnswer: Boolean(data.answer), mode: data.mode, model: data.model, code: data.code });
      if (!res.ok || data.ok === false || data.error) {
        badge(data.code || 'AI_ERROR', data.model || '');
        draw(h, card(data));
        return;
      }
      h = add('assistant', String(data.answer || '').trim() || 'AI javob bo‘sh qaytdi.');
      badge('AI ONLINE', data.model || '');
      draw(h);
    } catch (e) {
      const d = { code:'AI_NETWORK_ERROR', error:'AI serverga ulanishda xato: ' + (e?.message || 'noma’lum xato') };
      badge(d.code, '');
      draw(h, card(d));
    } finally {
      disabled(false);
      document.querySelectorAll('.seg-ai-input input, .assistant .input-row input').forEach(i => { i.value = ''; });
      document.querySelector('.seg-ai-input input')?.focus();
      removeAnalysis();
    }
  }

  function onClick(e){
    removeAnalysis();
    if (e.target?.closest?.('#segAiAnalyzeButton, .seg-ai-actions')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      removeAnalysis();
      return;
    }
    const btn = e.target?.closest?.('#segAiSendButton, .assistant .input-row button');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const input = btn.closest('.seg-ai-input, .input-row')?.querySelector('input') || document.querySelector('.seg-ai-input input');
    send(input?.value || '');
  }

  function onKey(e){
    if (e.key !== 'Enter') return;
    const input = e.target?.closest?.('.seg-ai-input input, .assistant .input-row input');
    if (!input) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    send(input.value);
  }

  function setup(){
    removeAnalysis();
    if (!window.__segKipAiChatOnly) {
      window.__segKipAiChatOnly = true;
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
      new MutationObserver(removeAnalysis).observe(document.body, { childList:true, subtree:true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
