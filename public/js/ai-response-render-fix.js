(function installAiAnswerDisplayWindow(){
  const logId = 'segAiAnswerWindow';
  let lastText = '';

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, function(m){
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[m];
    });
  }

  function removeActions(){
    const button = document.getElementById('segAiAnalyzeButton');
    if (button) button.closest('.seg-ai-actions')?.remove();
    document.querySelectorAll('.seg-ai-actions').forEach(function(node){ node.remove(); });
  }

  function addStyle(){
    if (document.getElementById('segAiAnswerWindowStyle')) return;
    const style = document.createElement('style');
    style.id = 'segAiAnswerWindowStyle';
    style.textContent = '#'+logId+'{display:block!important;min-height:150px!important;max-height:360px!important;overflow-y:auto!important;color:#eaffff!important;}#'+logId+' .seg-ai-chat{display:flex!important;flex-direction:column!important;gap:10px!important;}#'+logId+' .seg-ai-bubble{display:block!important;opacity:1!important;visibility:visible!important;height:auto!important;white-space:pre-wrap!important;word-break:break-word!important;}#'+logId+' .seg-ai-bubble.assistant{align-self:flex-start!important;background:rgba(15,23,42,.82)!important;border:1px solid rgba(148,163,184,.28)!important;color:#f4fbff!important;}';
    document.head.appendChild(style);
  }

  function box(){
    addStyle();
    removeActions();
    let node = document.getElementById(logId);
    if (!node) {
      node = document.querySelector('.seg-ai-panel-body .seg-ai-msg') || document.querySelector('.seg-ai-msg');
      if (node) node.id = logId;
    }
    if (!node) {
      const body = document.querySelector('.seg-ai-panel-body');
      if (!body) return null;
      node = document.createElement('div');
      node.id = logId;
      node.className = 'seg-ai-msg';
      body.prepend(node);
    }
    return node;
  }

  function lastAssistant(){
    try {
      const history = JSON.parse(localStorage.getItem('seg_kip_ai_chat_history') || '[]');
      if (!Array.isArray(history)) return '';
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i]?.role === 'assistant' && String(history[i]?.content || '').trim()) return String(history[i].content).trim();
      }
    } catch (_) {}
    return '';
  }

  function showAnswer(text){
    const answer = String(text || '').trim();
    const node = box();
    if (!node || !answer) return;
    if (node.innerText && node.innerText.includes(answer.slice(0, 30))) return;
    const userText = Array.from(document.querySelectorAll('#'+logId+' .seg-ai-bubble.user')).pop()?.innerText || '';
    node.innerHTML = '<div class="seg-ai-chat">' + (userText ? '<div class="seg-ai-bubble user">'+esc(userText)+'</div>' : '') + '<div class="seg-ai-bubble assistant">'+esc(answer)+'</div></div>';
    node.scrollTop = node.scrollHeight;
  }

  function tick(){
    removeActions();
    const answer = lastAssistant();
    if (answer && answer !== lastText) {
      lastText = answer;
      showAnswer(answer);
      console.log('[AI_ANSWER_WINDOW]', { hasAnswer: true, length: answer.length });
    }
  }

  function setup(){
    box();
    tick();
    setInterval(tick, 600);
    new MutationObserver(function(){ box(); tick(); }).observe(document.body, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
