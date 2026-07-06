// Manual login mode guard.
// This file intentionally does not refresh sessions or bypass the login screen.
(function manualLoginOnly(){
  window.__segStableSessionRestoreLoaded = true;
  window.__segManualLoginRequired = true;
})();
