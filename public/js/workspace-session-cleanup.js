// Clears visible Workspace test details after logout.
(function setupWorkspaceSessionCleanup() {
  function clearLogoutSensitiveUi() {
    const result = document.getElementById('workspaceTestResult');
    if (result) result.textContent = 'Logoutdan keyin Sheet testi natijasi tozalandi.';
  }

  function bindLogoutCleanup() {
    const logoutButton = document.getElementById('workspaceLogoutButton');
    if (!logoutButton || logoutButton.dataset.workspaceLogoutCleanupInstalled === 'true') return;
    logoutButton.dataset.workspaceLogoutCleanupInstalled = 'true';
    logoutButton.addEventListener('click', () => {
      window.setTimeout(clearLogoutSensitiveUi, 400);
    });
  }

  function setup() {
    bindLogoutCleanup();
    const observer = new MutationObserver(bindLogoutCleanup);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
