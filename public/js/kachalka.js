(function installKachalka(){
  'use strict';
  if (window.segKachalka) return;
  const busy = /yuklanmoqda|юкланмоқда|загрузка|загружается|загружаем|loading\.{0,3}|saqlanmoqda|сақланмоқда|сохранение|сохраняется|saving\.{0,3}|tayyorlanmoqda|тайёрланмоқда|подготовка|preparing\.{0,3}|sinxronlanmoqda|синхронланмоқда|синхронизация|syncing|kutilmoqda|кутилмоқда|ishlanmoqda|ишланмоқда|birlashtirilmoqda|бирлаштирилмоқда|tekshirilmoqda|обработка|processing\.{0,3}/i;
  const active = new Map();
  const pending = new Set();
  let scheduled = false;
  let hostWindow = window;
  try { if (window.top.document) hostWindow = window.top; } catch (_) {}
  const sources = hostWindow.__segKachalkaSources || (hostWindow.__segKachalkaSources = new Map());
  sources.set(document, active);
  function ownText(el){
    return Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' ');
  }
  function eligible(el){
    return !el.closest('[data-kachalka],#segAppLoader,script,style,textarea,input,[contenteditable="true"]') && !/загружается из отдельного HTML/i.test(ownText(el)) && (busy.test(ownText(el)) || el.getAttribute('aria-busy') === 'true');
  }
  function refresh(el){
    if (!el.isConnected || !eligible(el)) {
      active.delete(el);
      return;
    }
    const host = el.tagName === 'OPTION' ? el.closest('select') : el;
    if (!host) return;
    if (el.tagName === 'OPTION' && !el.selected) {
      active.delete(el); return;
    }
    active.set(el, host);
  }
  function renderSharedLoader(){
    let loading = false;
    for (const [source, targets] of sources) {
      if (source !== hostWindow.document) {
        const frame = source.defaultView?.frameElement;
        if (!frame?.isConnected || !frame.getClientRects().length) continue;
      }
      for (const element of targets.values()) {
        if (element.isConnected && element.getClientRects().length && source.defaultView.getComputedStyle(element).visibility !== 'hidden') {
          loading = true;
          break;
        }
      }
      if (loading) break;
    }
    if (hostWindow.segAppLoader?.setBusy) {
      hostWindow.segAppLoader.setBusy(loading);
    } else {
      const loader = hostWindow.document.getElementById('segSharedLoader');
      if (loader && loader.hidden === loading) loader.hidden = !loading;
    }
  }
  function collect(node){
    if (node.nodeType === 3) { if (node.parentElement) pending.add(node.parentElement); return; }
    if (node.nodeType !== 1 || node.closest('[data-kachalka],script,style')) return;
    pending.add(node);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) pending.add(walker.currentNode.parentElement);
  }
  function flush(){
    scheduled = false;
    for (const el of active.keys()) pending.add(el);
    const targets = Array.from(pending); pending.clear();
    for (const el of targets) refresh(el);
    renderSharedLoader();
  }
  function schedule(){
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
  }
  function init(){
    if (!document.getElementById('segLoaderBackgroundKey')) {
      const template = document.createElement('template');
      template.innerHTML = "<svg width=\"0\" height=\"0\" aria-hidden=\"true\" style=\"position:absolute;pointer-events:none\">\r\n  <defs>\r\n    <filter id=\"segLoaderBackgroundKey\" color-interpolation-filters=\"sRGB\" x=\"0\" y=\"0\" width=\"100%\" height=\"100%\">\r\n      <feComponentTransfer in=\"SourceGraphic\" result=\"lightChannels\">\r\n        <feFuncR type=\"discrete\" tableValues=\"0 0 0 0 0 0 0 0 1 1\"/>\r\n        <feFuncG type=\"discrete\" tableValues=\"0 0 0 0 0 0 0 0 1 1\"/>\r\n        <feFuncB type=\"discrete\" tableValues=\"0 0 0 0 0 0 0 0 1 1\"/>\r\n      </feComponentTransfer>\r\n      <feColorMatrix in=\"lightChannels\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0\" result=\"lightRed\"/>\r\n      <feColorMatrix in=\"lightChannels\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0\" result=\"lightGreen\"/>\r\n      <feColorMatrix in=\"lightChannels\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0\" result=\"lightBlue\"/>\r\n      <feComposite in=\"lightRed\" in2=\"lightGreen\" operator=\"in\" result=\"lightRedGreen\"/>\r\n      <feComposite in=\"lightRedGreen\" in2=\"lightBlue\" operator=\"in\" result=\"background\"/>\r\n      <feComposite in=\"SourceGraphic\" in2=\"background\" operator=\"out\"/>\r\n    </filter>\r\n  </defs>\r\n</svg>";
      document.body.prepend(template.content);
    }
    const style = document.createElement('style');
    style.textContent = '#segSharedLoader{position:fixed;inset:0;z-index:60000;display:grid;place-items:center;background:rgba(2,8,23,.10);font-family:Arial,sans-serif}#segSharedLoader[hidden]{display:none}#segSharedLoader>div{display:grid;justify-items:center;gap:8px;padding:8px 18px 12px}#segSharedLoader img{display:block;width:min(200px,45vw);height:auto;aspect-ratio:1;object-fit:contain;filter:url(#segLoaderBackgroundKey)}#segSharedLoader span{color:#f8fafc;font-size:14px;font-weight:900;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.72)}';
    if (!hostWindow.document.getElementById('segAppLoader') && !hostWindow.document.getElementById('segSharedLoader')) {
      hostWindow.document.head.append(style);
      const loader = hostWindow.document.createElement('div');
      loader.id = 'segSharedLoader';
      loader.dataset.kachalka = '';
      loader.hidden = true;
      loader.setAttribute('role', 'status');
      loader.innerHTML = '<div><img src="/assets/images/saneg-loading.gif" width="200" height="200" alt=""><span>Sanegplatform yuklanmoqda...</span></div>';
      hostWindow.document.body.append(loader);
    }
    collect(document.body); flush();
    const observer = new MutationObserver(records => {
      let changed = false;
      for (const record of records) {
        const el = record.target.nodeType === 3 ? record.target.parentElement : record.target;
        if (!el || el.closest('[data-kachalka],script,style')) continue;
        if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(n => n.nodeType === 1 && n.matches('[data-kachalka]'))) continue;
        collect(record.target);
        for (const node of record.addedNodes || []) collect(node);
        changed = true;
      }
      if (changed) schedule();
    });
    observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['aria-busy','class','style','hidden']});
    window.addEventListener('pagehide', () => { observer.disconnect(); sources.delete(document); renderSharedLoader(); }, {once:true});
    document.addEventListener('change', event => { if (event.target.tagName === 'SELECT') { collect(event.target); schedule(); } });
  }
  window.segKachalka = { refresh: () => { collect(document.body); schedule(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
