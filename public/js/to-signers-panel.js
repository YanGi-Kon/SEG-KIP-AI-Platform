(() => {
  'use strict';

  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const LANG_KEY = 'seg_kip_lang';
  const SUPPORTED_LANGS = new Set(['ru', 'uz_cyrl']);
  const state = { rows: [], loading: false, language: 'ru' };

  const POSITION_TRANSLATIONS = [
    { ru: 'Начальник участка', uz_cyrl: 'Участка бошлиғи', aliases: ['начальник участка', 'нач участка', 'нч участка', 'участка бошлиғи'] },
    { ru: 'Участок КИПиА', uz_cyrl: 'НЎВваА участка', aliases: ['участок кипиа', 'кипиа участка', 'нўвваа участка', 'нувваа участка'] },
    { ru: 'Начальник участка КИПиА', uz_cyrl: 'НЎВваА участка бошлиғи', aliases: ['начальник участка кипиа', 'нач участка кипиа', 'нч участка кипиа', 'нўвваа участка бошлиғи', 'нувваа участка бошлиги'] },
    { ru: 'Начальник КИПиА', uz_cyrl: 'НЎВваА бошлиғи', aliases: ['начальник кипиа', 'нач кипиа', 'нўвваа бошлиғи', 'нувваа бошлиги'] },
    { ru: 'Мастер КИПиА', uz_cyrl: 'НЎВваА устаси', aliases: ['мастер кипиа', 'нўвваа устаси', 'нувваа устаси'] },
    { ru: 'Слесарь КИПиА', uz_cyrl: 'НЎВваА чилангари', aliases: ['слесарь кипиа', 'нўвваа чилангари', 'нувваа чилангари'] },
    { ru: 'Инженер КИПиА', uz_cyrl: 'НЎВваА муҳандиси', aliases: ['инженер кипиа', 'нўвваа муҳандиси', 'нувваа мухандиси'] },
    { ru: 'Начальник отдела', uz_cyrl: 'Бўлим бошлиғи', aliases: ['начальник отдела', 'нач отдела', 'бўлим бошлиғи', 'булим бошлиги'] },
    { ru: 'Начальник цеха', uz_cyrl: 'Цех бошлиғи', aliases: ['начальник цеха', 'нач цеха', 'цех бошлиғи', 'цех бошлиги'] },
    { ru: 'Мастер участка', uz_cyrl: 'Участка устаси', aliases: ['мастер участка', 'участка устаси'] },
    { ru: 'Мастер добычи цех-1', uz_cyrl: 'Цех-1 қазиб чиқариш устаси', aliases: ['мастер добычи цех-1', 'мастер добычи цех 1', 'цех-1 қазиб чиқариш устаси', 'цех 1 қазиб чиқариш устаси'] },
    { ru: 'Мастер добычи', uz_cyrl: 'Қазиб чиқариш устаси', aliases: ['мастер добычи', 'қазиб чиқариш устаси', 'казиб чикариш устаси'] },
    { ru: 'Мастер ППН-1', uz_cyrl: 'ППН-1 устаси', aliases: ['мастер ппн-1', 'мастер ппн 1', 'ппн-1 устаси', 'ппн 1 устаси'] },
    { ru: 'Инженер', uz_cyrl: 'Муҳандис', aliases: ['инженер', 'муҳандис', 'мухандис'] },
    { ru: 'Слесарь', uz_cyrl: 'Чилангар', aliases: ['слесарь', 'чилангар'] },
  ];

  const $ = (id) => document.getElementById(id);
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function parentStorage(store, key) {
    try { return parent?.[store]?.getItem(key) || ''; } catch (_) { return ''; }
  }

  function workspaceId() {
    return clean(
      window.ToJournalWorkspace?.state?.workspaceId
      || localStorage.getItem(WORKSPACE_ID_KEY)
      || parentStorage('localStorage', WORKSPACE_ID_KEY),
    );
  }

  function token() {
    try {
      return sessionStorage.getItem(WORKSPACE_TOKEN_KEY)
        || parentStorage('sessionStorage', WORKSPACE_TOKEN_KEY)
        || sessionStorage.getItem(ADMIN_TOKEN_KEY)
        || parentStorage('sessionStorage', ADMIN_TOKEN_KEY)
        || '';
    } catch (_) {
      return parentStorage('sessionStorage', WORKSPACE_TOKEN_KEY)
        || parentStorage('sessionStorage', ADMIN_TOKEN_KEY)
        || '';
    }
  }

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-яўқғҳ0-9]+/giu, ' ')
      .trim();
  }

  function readLanguage() {
    let value = '';
    try {
      value = localStorage.getItem(LANG_KEY)
        || parentStorage('localStorage', LANG_KEY)
        || clean(parent?.currentLang);
    } catch (_) {
      value = parentStorage('localStorage', LANG_KEY);
    }
    return SUPPORTED_LANGS.has(value) ? value : 'ru';
  }

  function translatePosition(value, lang = state.language) {
    const raw = clean(value);
    if (!raw) return '—';
    const key = normalize(raw);
    const translation = POSITION_TRANSLATIONS.find((entry) => (
      normalize(entry.ru) === key
      || normalize(entry.uz_cyrl) === key
      || entry.aliases.some((alias) => normalize(alias) === key)
    ));
    return clean(translation?.[lang]) || raw;
  }

  function languageLabel(lang = state.language) {
    return lang === 'uz_cyrl' ? 'Ўзбекча (кирилл)' : 'Русский';
  }

  function updateLanguageUi() {
    const button = $('toSignersLangBtn');
    const menu = $('toSignersLangMenu');
    if (button) {
      button.title = 'Текущий язык: ' + languageLabel();
      button.setAttribute('aria-label', 'Язык интерфейса. ' + languageLabel());
    }
    menu?.querySelectorAll('[data-to-signers-lang]').forEach((option) => {
      const selected = option.dataset.toSignersLang === state.language;
      option.classList.toggle('active', selected);
      option.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
  }

  function closeLanguageMenu() {
    const menu = $('toSignersLangMenu');
    const button = $('toSignersLangBtn');
    menu?.classList.remove('show');
    button?.setAttribute('aria-expanded', 'false');
  }

  function toggleLanguageMenu() {
    const menu = $('toSignersLangMenu');
    const button = $('toSignersLangBtn');
    if (!menu || !button) return;
    const open = !menu.classList.contains('show');
    menu.classList.toggle('show', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function selectLanguage(lang) {
    if (!SUPPORTED_LANGS.has(lang)) return;
    state.language = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (_) {}
    try { parent?.localStorage?.setItem(LANG_KEY, lang); } catch (_) {}
    try { parent?.setLanguage?.(lang); } catch (_) {}
    updateLanguageUi();
    closeLanguageMenu();
    render();
  }

  function isKipMaster(row = {}) {
    const text = normalize(`${row.position || ''} ${row.fullName || row.fio || ''}`);
    return (text.includes('кип') && text.includes('мастер'))
      || (text.includes('kip') && text.includes('master'));
  }

  function injectStyle() {
    if ($('toSignersPanelStyle')) return;
    const style = document.createElement('style');
    style.id = 'toSignersPanelStyle';
    style.textContent = `
      .to-signers-modal{position:fixed;inset:0;z-index:130;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.76);font-family:Arial,sans-serif}
      .to-signers-modal.show{display:flex}
      .to-signers-box{width:min(980px,100%);max-height:92vh;overflow:auto;background:#071427;border:1px solid rgba(34,211,238,.30);border-radius:18px;padding:20px;color:#eaf7ff;box-shadow:0 24px 80px rgba(0,0,0,.45)}
      .to-signers-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}
      .to-signers-head h2{margin:0;font-size:20px}
      .to-signers-note{margin:0 0 14px;color:#a9c8d8;font-size:12px;line-height:1.45}
      .to-signers-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .to-signers-toolbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
      .to-signers-lang{position:relative}
      .to-signers-lang-menu{position:absolute;right:0;top:calc(100% + 7px);z-index:4;display:none;min-width:205px;padding:6px;background:#0a1a2d;border:1px solid rgba(34,211,238,.30);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.45)}
      .to-signers-lang-menu.show{display:grid;gap:4px}
      .to-signers-lang-option{width:100%;border:0;border-radius:9px;padding:9px 11px;background:transparent;color:#dff7ff;text-align:left;font-size:12px;font-weight:700;cursor:pointer}
      .to-signers-lang-option:hover,.to-signers-lang-option.active{background:rgba(34,211,238,.12);color:#67e8f9}
      .to-signers-lang-option.active::after{content:'✓';float:right;color:#86efac}
      .to-signers-status{font-size:12px;color:#cdeeff}
      .to-signers-status.ok{color:#86efac}.to-signers-status.bad{color:#fca5a5}.to-signers-status.sync{color:#fde68a}
      .to-signers-tablewrap{overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:14px}
      .to-signers-table{width:100%;min-width:760px;border-collapse:collapse;background:rgba(1,12,24,.55)}
      .to-signers-table th,.to-signers-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,.09);font-size:12px;text-align:left;vertical-align:middle;color:#eaf7ff}
      .to-signers-table th{background:rgba(10,56,72,.96);color:#dffbff;position:sticky;top:0}
      .to-signers-badge{display:inline-flex;align-items:center;border-radius:999px;padding:3px 7px;font-size:10px;font-weight:800;border:1px solid rgba(34,211,238,.28);background:rgba(34,211,238,.08);color:#a5f3fc;margin-left:6px}
      .to-signers-state{font-weight:800}.to-signers-state.active{color:#86efac}.to-signers-state.inactive{color:#fca5a5}
      .to-signers-empty{padding:24px;text-align:center;color:#9fb7c7}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    if (!$('toSignersBtn')) {
      const actions = document.querySelector('.top-actions');
      if (actions) {
        const button = document.createElement('button');
        button.id = 'toSignersBtn';
        button.className = 'btn';
        button.type = 'button';
        button.textContent = '5. ИМЗО ЧЕКУВЧИЛАР';
        button.addEventListener('click', open);
        const settings = $('toSettingsBtn');
        if (settings && settings.parentElement === actions) actions.insertBefore(button, settings);
        else actions.appendChild(button);
      }
    }

    if ($('toSignersModal')) return;
    const modal = document.createElement('div');
    modal.id = 'toSignersModal';
    modal.className = 'to-signers-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="to-signers-box">
        <div class="to-signers-head">
          <h2>5. ИМЗО ЧЕКУВЧИЛАР</h2>
          <button id="toSignersCloseBtn" class="btn" type="button">✕</button>
        </div>
        <p class="to-signers-note">Ro‘yxat tanlangan Workspace ichidagi umumiy imzo chekuvchilar registridan olinadi. AKTLAR JURNALI va TO JURNALI bir xil Workspace manbasidan foydalanadi.</p>
        <div class="to-signers-toolbar">
          <div id="toSignersStatus" class="to-signers-status">Ro‘yxat hali yuklanmagan.</div>
          <div class="to-signers-toolbar-actions">
            <div class="to-signers-lang">
              <button id="toSignersLangBtn" class="btn" type="button" aria-haspopup="menu" aria-expanded="false">🌐 Язык интерфейса</button>
              <div id="toSignersLangMenu" class="to-signers-lang-menu" role="menu">
                <button class="to-signers-lang-option" type="button" role="menuitemradio" data-to-signers-lang="ru">🇷🇺 Русский</button>
                <button class="to-signers-lang-option" type="button" role="menuitemradio" data-to-signers-lang="uz_cyrl">🇺🇿 Ўзбекча (кирилл)</button>
              </div>
            </div>
            <button id="toSignersRefreshBtn" class="btn" type="button">↻ Yangilash</button>
          </div>
        </div>
        <div class="to-signers-tablewrap">
          <table class="to-signers-table">
            <thead><tr><th>№</th><th>Lavozim</th><th>F.I.O.</th><th>Email</th><th>Holat</th><th>Imzo</th></tr></thead>
            <tbody id="toSignersRows"><tr><td colspan="6" class="to-signers-empty">Ro‘yxatni yuklash uchun tugmani bosing.</td></tr></tbody>
          </table>
        </div>
      </div>`;
    document.body.appendChild(modal);
    $('toSignersCloseBtn')?.addEventListener('click', close);
    $('toSignersRefreshBtn')?.addEventListener('click', () => void load());
    $('toSignersLangBtn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleLanguageMenu();
    });
    $('toSignersLangMenu')?.querySelectorAll('[data-to-signers-lang]').forEach((option) => {
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        selectLanguage(option.dataset.toSignersLang);
      });
    });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
      else if (!event.target.closest?.('.to-signers-lang')) closeLanguageMenu();
    });
    updateLanguageUi();
  }

  function setStatus(text, tone = '') {
    const el = $('toSignersStatus');
    if (!el) return;
    el.className = `to-signers-status${tone ? ` ${tone}` : ''}`;
    el.textContent = text;
  }

  function render() {
    const body = $('toSignersRows');
    if (!body) return;
    if (!state.rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="to-signers-empty">Bu Workspace uchun imzo chekuvchilar topilmadi.</td></tr>';
      return;
    }
    body.innerHTML = state.rows.map((row, index) => {
      const master = isKipMaster(row);
      const status = clean(row.status || 'active').toLowerCase();
      const hasSignature = Boolean(clean(row.signatureFileId) || clean(row.signatureUrl));
      return `<tr>
        <td>${index + 1}</td>
        <td>${esc(translatePosition(row.position))}${master ? '<span class="to-signers-badge">TO · ' + esc(translatePosition('Мастер КИПиА')) + '</span>' : ''}</td>
        <td>${esc(row.fullName || row.fio || '—')}</td>
        <td>${esc(row.email || row.gmail || '—')}</td>
        <td><span class="to-signers-state ${esc(status)}">${esc(status || 'active')}</span></td>
        <td>${hasSignature ? '✓ mavjud' : '—'}</td>
      </tr>`;
    }).join('');
  }

  async function load() {
    if (state.loading) return;
    const wsId = workspaceId();
    const auth = token();
    if (!wsId) { setStatus('Workspace tanlanmagan.', 'bad'); return; }
    if (!auth) { setStatus('Workspace sessiyasi topilmadi.', 'bad'); return; }

    state.loading = true;
    setStatus('Workspace imzo chekuvchilari yuklanmoqda...', 'sync');
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(wsId)}/signers?includeInactive=true`, {
        headers: { Authorization: `Bearer ${auth}`, 'x-workspace-id': wsId },
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      if (wsId !== workspaceId()) return;
      state.rows = Array.isArray(data.rows) ? data.rows : [];
      render();
      const active = state.rows.filter((row) => clean(row.status || 'active').toLowerCase() === 'active').length;
      setStatus(`${state.rows.length} ta imzo chekuvchi topildi · ${active} ta active`, 'ok');
    } catch (error) {
      state.rows = [];
      render();
      setStatus(`Yuklash xatosi: ${error.message}`, 'bad');
    } finally {
      state.loading = false;
    }
  }

  function open() {
    injectUi();
    state.language = readLanguage();
    updateLanguageUi();
    $('toSignersModal')?.classList.add('show');
    void load();
  }

  function close() {
    closeLanguageMenu();
    $('toSignersModal')?.classList.remove('show');
  }

  function init() {
    state.language = readLanguage();
    injectStyle();
    injectUi();
    updateLanguageUi();
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'SEG_KIP_WORKSPACE_CHANGE' && $('toSignersModal')?.classList.contains('show')) {
      window.setTimeout(() => void load(), 0);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.ToJournalSigners = {
    open, close, load, state, selectLanguage, translatePosition,
  };
})();
