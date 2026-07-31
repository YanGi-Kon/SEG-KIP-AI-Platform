(function setupWorkspaceApiClient(global) {
  'use strict';
  if (global.WorkspaceApiClient) return;
  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  function parentStorage(name, key) { try { return parent?.[name]?.getItem(key) || ''; } catch (_) { return ''; } }
  function workspaceId() { return localStorage.getItem(SELECTED_WORKSPACE_KEY) || parentStorage('localStorage', SELECTED_WORKSPACE_KEY) || ''; }
  function token() { return sessionStorage.getItem(ACCESS_TOKEN_KEY) || parentStorage('sessionStorage', ACCESS_TOKEN_KEY) || ''; }
  async function parse(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }
  async function refresh() {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    });
    const data = await parse(response);
    if (!response.ok) throw new Error(data.error || 'Session yangilanmadi');
    if (data.accessToken) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      try { parent.sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken); } catch (_) {}
    }
  }
  async function request(path, options = {}, retry = true) {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const accessToken = token();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(path, { ...options, headers, credentials: 'include' });
    const data = await parse(response);
    if (response.status === 401 && retry) {
      await refresh();
      return request(path, options, false);
    }
    if (!response.ok || data.error) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.data = data;
      error.status = response.status;
      throw error;
    }
    return data;
  }
  global.WorkspaceApiClient = Object.freeze({ request, workspaceId, token });
})(window);
