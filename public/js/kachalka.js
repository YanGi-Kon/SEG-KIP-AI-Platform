(function installKachalka(){
  'use strict';
  if (window.segKachalka) return;
  const busy = /yuklanmoqda|юкланмоқда|загрузка|загружается|загружаем|loading\.{0,3}|saqlanmoqda|сақланмоқда|сохранение|сохраняется|saving\.{0,3}|tayyorlanmoqda|тайёрланмоқда|подготовка|preparing\.{0,3}|sinxronlanmoqda|синхронланмоқда|синхронизация|syncing|kutilmoqda|кутилмоқда|ishlanmoqda|ишланмоқда|birlashtirilmoqda|бирлаштирилмоқда|tekshirilmoqda|обработка|processing\.{0,3}/i;
  const active = new Map();
  const pending = new Set();
  let scheduled = false;
  function ownText(el){
    return Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' ');
  }
  function eligible(el){
    return !el.closest('[data-kachalka],#segAppLoader,script,style,textarea,input,[contenteditable="true"]') && (busy.test(ownText(el)) || el.getAttribute('aria-busy') === 'true');
  }
  function refresh(el){
    if (!el.isConnected || !eligible(el)) {
      active.get(el)?.remove();
      active.delete(el);
      return;
    }
    const host = el.tagName === 'OPTION' ? el.closest('select') : el;
    if (!host) return;
    if (el.tagName === 'OPTION' && !el.selected) {
      active.get(el)?.remove(); active.delete(el); return;
    }
    if (active.get(el)?.isConnected) return;
    const indicator = document.createElement('span');
    indicator.dataset.kachalka = '';
    indicator.className = 'seg-kachalka';
    indicator.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.src = '/assets/images/saneg-loading.gif';
    img.alt = '';
    img.width = 56; img.height = 56;
    const label = document.createElement('span');
    label.textContent = 'Sanegplatform yuklanmoqda...';
    indicator.append(img, label);
    if (el.tagName === 'OPTION') host.after(indicator);
    else host.append(indicator);
    active.set(el, indicator);
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
    style.textContent = '.seg-kachalka{display:inline-flex;vertical-align:middle;flex-direction:column;align-items:center;justify-content:center;gap:3px;margin:4px 8px;max-width:100%;pointer-events:none}.seg-kachalka img{display:block;width:56px;height:56px;object-fit:contain;filter:url(#segLoaderBackgroundKey)}.seg-kachalka>span{font:700 10px/1.3 Arial,sans-serif;color:inherit;text-align:center;white-space:normal}';
    document.head.append(style);
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
    observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['aria-busy']});
    document.addEventListener('change', event => { if (event.target.tagName === 'SELECT') { collect(event.target); schedule(); } });
  }
  window.segKachalka = { refresh: () => { collect(document.body); schedule(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
