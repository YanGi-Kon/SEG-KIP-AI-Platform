(function removeAiAnalysisAction(){
  function remove(){
    const button = document.getElementById('segAiAnalyzeButton');
    if (button) button.closest('.seg-ai-actions')?.remove();
    document.querySelectorAll('.seg-ai-actions').forEach((node) => node.remove());
  }

  function block(event){
    const target = event.target;
    if (target?.closest?.('#segAiAnalyzeButton, .seg-ai-actions')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      remove();
    }
  }

  function setup(){
    remove();
    document.addEventListener('click', block, true);
    const observer = new MutationObserver(remove);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
