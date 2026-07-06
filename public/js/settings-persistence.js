// Manual Login Mode settings loader.
// Does not call auth refresh and does not bypass the login gate.
(function settingsPersistenceLoader(){
  if (window.__segSettingsPersistenceLoaded) return;
  window.__segSettingsPersistenceLoaded = true;
  window.__segManualLoginRequired = true;

  function appendScript(id, src){
    if (document.getElementById(id)) return;
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
  }

  function loadSettingsScripts(){
    appendScript('segWorkspaceUiScript', '/js/workspace-ui.js?v=settings2');
    appendScript('segWorkspaceSessionCleanupScript', '/js/workspace-session-cleanup.js?v=settings2');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSettingsScripts, { once: true });
  } else {
    loadSettingsScripts();
  }
})();
