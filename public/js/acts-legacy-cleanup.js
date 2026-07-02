// Stage 6 guard: prevent ACTS module from reusing legacy browser Sheet settings.
(function clearLegacyActsSheetCache() {
  const legacyKeys = [
    'acts_sheet_url',
    'acts_sheet_name',
    'acts_service_account',
    'seg_kip_admin_jwt'
  ];

  for (const key of legacyKeys) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (_) {}
  }
})();
