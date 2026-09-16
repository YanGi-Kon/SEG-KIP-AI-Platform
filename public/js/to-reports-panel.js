(() => {
  'use strict';

  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const API_ROOT = '/api/to-period-bridge';
  const SEND_TIMEOUT_MS = 120000;
  const MONTHS = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const state = { periods: [], selected: null, report: null, busy: false, lastSendResult: null };

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

  async function refreshSession() {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.accessToken) throw new Error(data.error || 'Workspace sessiyasi yangilanmadi');
    sessionStorage.setItem(WORKSPACE_TOKEN_KEY, data.accessToken);
    try { parent.sessionStorage.setItem(WORKSPACE_TOKEN_KEY, data.accessToken); } catch (_) {}
    return data.accessToken;
  }

  async function api(path, options = {}, retry = true) {
    const wsId = workspaceId();
    if (!wsId) throw new Error('Workspace tanlanmagan');
    const headers = new Headers(options.headers || {});
    const auth = token();
    if (auth) headers.set('Authorization', `Bearer ${auth}`);
    headers.set('x-workspace-id', wsId);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_ROOT}${path}`, {
        ...options,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 && retry) {
        await refreshSession();
        return api(path, options, false);
      }
      if (!response.ok || data.error) {
        throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { data, status: response.status });
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw Object.assign(new Error('Email yuborish juda uzoq davom etdi. Email provider yoki SMTP ulanishini tekshiring.'), {
          data: {
            code: 'EMAIL_SEND_TIMEOUT',
            recommendedFix: '3. AKTLAR JURNALI ishlatadigan Gmail/SMTP yoki HTTP email provider sozlamasini tekshiring.',
          },
          status: 408,
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function injectStyle() {
    if ($('toReportsPanelStyle')) return;
    const style = document.createElement('style');
    style.id = 'toReportsPanelStyle';
    style.textContent = `
      .to-reports-modal{position:fixed;inset:0;z-index:125;display:none;background:rgba(0,0,0,.78);padding:16px;font-family:Arial,sans-serif;color:#eaf7ff}
      .to-reports-modal.show{display:flex;align-items:center;justify-content:center}
      .to-reports-shell{width:min(1320px,100%);height:min(94vh,980px);display:flex;flex-direction:column;overflow:hidden;background:#071427;border:1px solid rgba(34,211,238,.30);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.48)}
      .to-reports-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.09)}
      .to-reports-head h2{margin:0;font-size:20px}.to-reports-head-actions{display:flex;gap:8px;align-items:center}
      .to-reports-content{display:grid;grid-template-columns:300px minmax(0,1fr);gap:0;min-height:0;flex:1}
      .to-reports-folders{overflow:auto;padding:14px;border-right:1px solid rgba(255,255,255,.09);background:rgba(2,13,25,.5)}
      .to-reports-year{margin:10px 0 7px;color:#a5f3fc;font-weight:900;font-size:13px}
      .to-reports-folder{width:100%;display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:10px;align-items:center;text-align:left;margin:0 0 8px;padding:11px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);color:#eaf7ff;border-radius:13px;cursor:pointer;box-sizing:border-box}
      .to-reports-folder:hover,.to-reports-folder.active{border-color:rgba(34,211,238,.55);background:rgba(34,211,238,.10)}
      .to-reports-folder:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}
      .to-reports-folder-icon{font-size:26px}.to-reports-folder-name{font-weight:900}.to-reports-folder-meta{font-size:10px;color:#9fb7c7;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.to-reports-folder-state{font-size:10px;color:#fde68a}
      .to-reports-folder-actions{display:flex;align-items:center;gap:5px}
      .to-reports-folder-action{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.06);color:#eaf7ff;cursor:pointer;font-size:14px;line-height:1;padding:0}
      .to-reports-folder-action:hover{border-color:rgba(34,211,238,.55);background:rgba(34,211,238,.13)}
      .to-reports-folder-action.delete:hover{border-color:rgba(248,113,113,.65);background:rgba(127,29,29,.34);color:#fecaca}
      .to-reports-preview{overflow:auto;padding:18px;background:#101827}.to-reports-empty{min-height:100%;display:grid;place-items:center;color:#9fb7c7;text-align:center;padding:40px}
      .to-reports-a4-host{overflow:auto}.to-reports-a4-host .to-a4-document{box-shadow:0 18px 52px rgba(0,0,0,.34)}
      .to-reports-bottom{width:210mm;max-width:100%;margin:14px auto 30px;padding:14px;border:1px solid rgba(34,211,238,.30);border-radius:14px;background:#071427;color:#eaf7ff}
      .to-reports-approval-list{display:grid;gap:6px;margin:10px 0}.to-reports-approval-row{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:12px;font-size:12px;padding:8px 10px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:rgba(255,255,255,.035)}
      .to-reports-approval-row b{color:#a5f3fc}.to-reports-approval-status{text-align:right}.to-reports-approval-status.approved{color:#86efac}.to-reports-approval-status.pending{color:#fde68a}
      .to-reports-sendbar{display:flex;justify-content:flex-end;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}.to-reports-sendmsg{margin-right:auto;font-size:12px;color:#cdeeff}.to-reports-sendmsg.ok{color:#86efac}.to-reports-sendmsg.bad{color:#fca5a5}.to-reports-sendmsg.sync{color:#fde68a}
      .to-reports-diagnostic{display:none;margin:12px 0 0;padding:12px 14px;border-radius:12px;border:1px solid rgba(239,68,68,.38);background:rgba(127,29,29,.18);color:#fecaca;font-size:12px;line-height:1.5}.to-reports-diagnostic.show{display:block}.to-reports-diagnostic.ok{border-color:rgba(34,197,94,.38);background:rgba(20,83,45,.18);color:#bbf7d0}.to-reports-diagnostic-title{font-weight:900;color:#fff;margin-bottom:6px}.to-reports-diagnostic-fix{margin-top:8px;padding:9px;border-radius:9px;background:rgba(15,23,42,.58);color:#fde68a}.to-reports-diagnostic-provider{color:#a5f3fc}.to-reports-delivery-row{margin:4px 0}
      @media(max-width:900px){.to-reports-content{grid-template-columns:1fr}.to-reports-folders{max-height:220px;border-right:0;border-bottom:1px solid rgba(255,255,255,.09)}.to-reports-shell{height:96vh}.to-reports-preview{padding:10px}}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    if (!$('toReportsBtn')) {
      const actions = document.querySelector('.top-actions');
      if (actions) {
        const button = document.createElement('button');
        button.id = 'toReportsBtn';
        button.className = 'btn';
        button.type = 'button';
        button.textContent = '3. Хисоботлар';
        button.addEventListener('click', open);
        const signers = $('toSignersBtn');
        const settings = $('toSettingsBtn');
        if (signers && signers.parentElement === actions) actions.insertBefore(button, signers);
        else if (settings && settings.parentElement === actions) actions.insertBefore(button, settings);
        else actions.appendChild(button);
      }
    }

    if ($('toReportsModal')) return;
    const modal = document.createElement('div');
    modal.id = 'toReportsModal';
    modal.className = 'to-reports-modal';
    modal.innerHTML = `
      <div class="to-reports-shell">
        <div class="to-reports-head">
          <div><h2>3. Хисоботлар</h2><div style="font-size:11px;color:#9fb7c7;margin-top:3px">TO hujjatlari oylar bo‘yicha alohida papkalarda</div></div>
          <div class="to-reports-head-actions"><button id="toReportsRefreshBtn" class="btn" type="button">↻ Yangilash</button><button id="toReportsCloseBtn" class="btn" type="button">✕</button></div>
        </div>
        <div class="to-reports-content">
          <aside id="toReportsFolders" class="to-reports-folders"><div class="to-reports-empty">Papkalar yuklanmoqda...</div></aside>
          <main id="toReportsPreview" class="to-reports-preview"><div class="to-reports-empty">Kerakli oy papkasini tanlang.</div></main>
        </div>
      </div>`;
    document.body.appendChild(modal);
    $('toReportsCloseBtn')?.addEventListener('click', close);
    $('toReportsRefreshBtn')?.addEventListener('click', () => void loadFolders());
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  }

  function setSendMessage(text, tone = '') {
    const el = $('toReportsSendMsg');
    if (!el) return;
    el.className = `to-reports-sendmsg${tone ? ` ${tone}` : ''}`;
    el.textContent = text;
  }

  function emailCodeMessage(data = {}) {
    const code = clean(data.code);
    const map = {
      EMAIL_CONFIG_MISSING: 'Gmail/SMTP yuborish sozlamasi topilmadi.',
      EMAIL_HTTP_NOT_CONFIGURED: 'HTTP email provider sozlanmagan.',
      EMAIL_AUTH_FAILED: 'Email login yoki yuborish kaliti provider tomonidan rad etildi.',
      EMAIL_CONNECTION_FAILED: 'Email serverga ulanishda xatolik.',
      EMAIL_SEND_TIMEOUT: 'Email provider yoki SMTP server javob bermadi.',
      EMAIL_SEND_FAILED: 'Email yuborishda xatolik.',
      EMAIL_INVALID_RECIPIENT: 'Imzolovchi email manzili noto‘g‘ri yoki to‘liq emas.',
      EMAIL_DOMAIN_NOT_VERIFIED: 'Email domen tasdiqlanmagan.',
      EMAIL_PROVIDER_RECIPIENT_NOT_ALLOWED: 'Email provider bu qabul qiluvchiga yuborishga ruxsat bermadi.',
      EMAIL_RATE_LIMITED: 'Email provider vaqtincha rate-limitga tushdi.',
      TO_APPROVERS_NOT_ASSIGNED: 'Hujjatga tasdiqlovchilar biriktirilmagan.',
      TO_APPROVERS_NOT_FOUND: 'Hujjatdagi ayrim tasdiqlovchilar faol registrdan topilmadi.',
      FINAL_DOCUMENTS_FOLDER_ID_REQUIRED: 'Yakuniy PDF uchun Google Drive papkasi sozlanmagan.',
    };
    return map[code] || clean(data.error) || 'Email yuborilmadi.';
  }

  function diagnosticFix(data = {}) {
    if (clean(data.recommendedFix)) return clean(data.recommendedFix);
    const code = clean(data.code);
    if (code === 'EMAIL_AUTH_FAILED') return '3. AKTLAR JURNALI ishlatadigan Gmail App Password / SMTP credentiallarini tekshiring.';
    if (code === 'EMAIL_CONFIG_MISSING' || code === 'EMAIL_HTTP_NOT_CONFIGURED') return 'AKTLAR JURNALI uchun ishlayotgan GMAIL_USER/GMAIL_APP_PASSWORD yoki SMTP_USER/SMTP_PASS sozlamasi TO moduliga ham server environment orqali mavjud bo‘lishi kerak.';
    if (code === 'EMAIL_INVALID_RECIPIENT') return '5. TO JURNALI umumiy imzo chekuvchilar ro‘yxatida Gmail manzilini tekshiring.';
    if (code === 'TO_APPROVERS_NOT_ASSIGNED' || code === 'TO_APPROVERS_NOT_FOUND') return '5. АКТ ВЫПОЛНЕННЫХ РАБОТ oynasida tasdiqlovchilarni tanlang, Saqlash tugmasini bosing va hisobotni qayta oching.';
    if (code === 'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED') return '6. ЯКУНИЙ ҲУЖЖАТЛАР bo‘limida Google Drive papka URL yoki ID ni kiriting va Текшириш tugmasini bosing.';
    return 'Email provider yoki Gmail/SMTP sozlamasini tekshiring.';
  }

  function showSendDiagnostic(data = null) {
    const host = $('toReportsSendDiagnostic');
    if (!host) return;
    if (!data) {
      host.className = 'to-reports-diagnostic';
      host.innerHTML = '';
      return;
    }
    const failures = Array.isArray(data.results) ? data.results.filter((row) => row.status === 'email-failed') : [];
    const first = failures[0] || data;
    const provider = clean(data.deliveryMode || data.provider || first.provider || '');
    const rows = failures.length
      ? failures.slice(0, 4).map((row) => `<div><b>${esc(row.signer || row.fio || 'Imzolovchi')}:</b> ${esc(row.email || row.gmail || '—')} · ${esc(emailCodeMessage(row))}</div>`).join('')
      : `<div>${esc(emailCodeMessage(first))}</div>`;
    host.className = 'to-reports-diagnostic show';
    host.innerHTML = `<div class="to-reports-diagnostic-title">Email yuborilmadi</div>${provider ? `<div class="to-reports-diagnostic-provider">Provider: ${esc(provider)}</div>` : ''}${rows}<div class="to-reports-diagnostic-fix"><b>Yechim:</b> ${esc(diagnosticFix(first.recommendedFix ? first : { ...first, recommendedFix: data.recommendedFix }))}</div>`;
  }

  function showDeliveryTrace(data = null) {
    const host = $('toReportsSendDiagnostic');
    if (!host || !data) return;
    const sent = Array.isArray(data.results) ? data.results.filter((row) => row.status === 'sent') : [];
    if (!sent.length) return;
    const provider = clean(data.deliveryMode || data.provider || sent[0]?.provider || '');
    const rows = sent.map((row) => `<div class="to-reports-delivery-row"><b>${esc(row.signer || row.fio || 'Imzolovchi')}:</b> ${esc(row.email || row.gmail || '—')}${row.providerMessageId ? ` · ID ${esc(row.providerMessageId)}` : ''}</div>`).join('');
    const warning = clean(data.warning) ? `<div class="to-reports-diagnostic-fix"><b>Provider eslatmasi:</b> ${esc(data.warning)}</div>` : '';
    host.className = 'to-reports-diagnostic show ok';
    host.innerHTML = `<div class="to-reports-diagnostic-title">Email provider qabul qildi: ${esc(sent.length)} / ${esc(data.total || sent.length)}</div>${provider ? `<div class="to-reports-diagnostic-provider">Provider: ${esc(provider)}</div>` : ''}${rows}${warning}<div class="to-reports-delivery-row">Bu holat provider so‘rovni qabul qilganini bildiradi; Gmail inboxga yetib borishi provider va spam filtrlarga bog‘liq.</div>`;
  }

  function folderLabel(period) {
    return `${MONTHS[Number(period.month)] || period.month} ${period.year}`;
  }

  function renderFolders() {
    const host = $('toReportsFolders');
    if (!host) return;
    if (!state.periods.length) {
      host.innerHTML = '<div class="to-reports-empty">Hali TO oylik hujjati yaratilmagan.</div>';
      return;
    }
    const grouped = new Map();
    for (const period of state.periods) {
      const year = Number(period.year);
      if (!grouped.has(year)) grouped.set(year, []);
      grouped.get(year).push(period);
    }
    host.innerHTML = [...grouped.entries()].sort((a, b) => b[0] - a[0]).map(([year, periods]) => `
      <div class="to-reports-year">${year}</div>
      ${periods.sort((a, b) => Number(b.month) - Number(a.month)).map((period) => {
        const active = state.selected && Number(state.selected.year) === Number(period.year) && Number(state.selected.month) === Number(period.month);
        const isDraft = clean(period.status || 'draft') === 'draft';
        const actionsHtml = isDraft
          ? `<span class="to-reports-folder-actions"><button class="to-reports-folder-action edit" type="button" data-report-edit="${esc(period.year)}-${esc(period.month)}" title="Таҳрирлаш" aria-label="${esc(folderLabel(period))} hujjatini tahrirlash">✏️</button><button class="to-reports-folder-action delete" type="button" data-report-delete="${esc(period.year)}-${esc(period.month)}" title="Ўчириш" aria-label="${esc(folderLabel(period))} hujjatini o‘chirish">🗑️</button></span>`
          : `<span class="to-reports-folder-state">final</span>`;
        return `<div class="to-reports-folder${active ? ' active' : ''}" role="button" tabindex="0" data-report-year="${esc(period.year)}" data-report-month="${esc(period.month)}"><span class="to-reports-folder-icon">📁</span><span><span class="to-reports-folder-name">${esc(folderLabel(period))}</span><span class="to-reports-folder-meta">${esc(period.monthlySheetName || period.sourceSheetName || 'TO hujjati')}</span></span>${actionsHtml}</div>`;
      }).join('')}
    `).join('');
    host.querySelectorAll('.to-reports-folder[data-report-year][data-report-month]').forEach((row) => {
      const openCurrent = () => void openFolder(Number(row.dataset.reportYear), Number(row.dataset.reportMonth));
      row.addEventListener('click', openCurrent);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCurrent();
        }
      });
    });
    host.querySelectorAll('[data-report-edit]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const [year, month] = clean(button.dataset.reportEdit).split('-').map(Number);
        void editFolder(year, month);
      });
    });
    host.querySelectorAll('[data-report-delete]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const [year, month] = clean(button.dataset.reportDelete).split('-').map(Number);
        void deleteFolder(year, month);
      });
    });
  }

  function approvalRowsHtml(approvals = [], assignedApprovers = [], signerStates = []) {
    const rows = signerStates.length
      ? signerStates
      : approvals.length
        ? approvals
        : assignedApprovers.map((row) => ({ ...row, status: row.signatureFileId ? 'Автоматик имзо' : 'Юборилмаган', signed: Boolean(row.signatureFileId) }));
    if (!rows.length) return '<div style="font-size:12px;color:#fca5a5">Hujjatga tasdiqlovchilar biriktirilmagan. Asosiy TO oynasida tanlab, Saqlash tugmasini bosing.</div>';
    return `<div class="to-reports-approval-list">${rows.map((row) => {
      const signed = Boolean(row.signed) || clean(row.status) === 'Тасдиқланди' || clean(row.status) === 'Автоматик имзо';
      return `<div class="to-reports-approval-row"><div><b>${esc(row.fio || row.fullName || '—')}</b><div>${esc(row.position || '')}${(row.email || row.gmail) ? ` · ${esc(row.email || row.gmail)}` : ''}</div></div><div class="to-reports-approval-status ${signed ? 'approved' : 'pending'}">${esc(row.status || 'Юборилмаган')}</div></div>`;
    }).join('')}</div>`;
  }

  function renderReport() {
    const host = $('toReportsPreview');
    const report = state.report;
    if (!host || !report) return;
    let css = $('toReportsA4Style');
    if (!css) {
      css = document.createElement('style');
      css.id = 'toReportsA4Style';
      document.head.appendChild(css);
    }
    css.textContent = report.a4Css || '';
    const finalPdf = report.finalPdf && typeof report.finalPdf === 'object' ? report.finalPdf : {};
    const finalPdfStatus = clean(finalPdf.status);
    const finalPdfHtml = finalPdfStatus === 'EXPORTED' && clean(finalPdf.url)
      ? `<div class="to-reports-diagnostic show ok"><div class="to-reports-diagnostic-title">✅ Якуний A4 PDF Drive'га сақланган</div><div class="to-reports-delivery-row"><a href="${esc(finalPdf.url)}" target="_blank" rel="noopener noreferrer" style="color:#a5f3fc;font-weight:800">Якуний PDF ни очиш</a>${finalPdf.approvedAt ? ` · ${esc(finalPdf.approvedAt)}` : ''}</div></div>`
      : finalPdfStatus === 'EXPORT_FAILED'
        ? `<div class="to-reports-diagnostic show"><div class="to-reports-diagnostic-title">Yakuniy PDF export xatosi</div><div>${esc(finalPdf.errorMessage || finalPdf.errorCode || 'Export bajarilmadi')}</div></div>`
        : '';

    const assignedCount = Array.isArray(report.assignedApprovers) ? report.assignedApprovers.length : 0;
    const unsignedCount = Number.isFinite(Number(report.unsignedApprovers))
      ? Number(report.unsignedApprovers)
      : assignedCount;
    const missingSlots = Number(report.missingSignerSlots || 0);
    const sendHint = !assignedCount
      ? 'Avval asosiy TO oynasida tasdiqlovchilarni tanlab, Saqlash tugmasini bosing.'
      : unsignedCount > 0
        ? `Хужатни юбориш faqat avtomatik/tasdiqlangan imzosi yo‘q ${unsignedCount} ta imzolovchiga xabar yuboradi.`
        : missingSlots > 0
          ? `${missingSlots} ta imzolovchi sloti registrdan topilmadi. 5. ИМЗО ЧЕКУВЧИЛАР registrini tekshiring.`
          : 'Barcha biriktirilgan imzolovchilarning imzolari mavjud. Yuboriladigan xabar yo‘q.';
    host.innerHTML = `<div class="to-reports-a4-host">${report.a4Html || ''}</div><div class="to-reports-bottom"><div style="font-weight:900">${esc(report.label || '')} · imzolash holati</div>${approvalRowsHtml(report.approvals || [], report.assignedApprovers || [], report.signerStates || [])}${finalPdfHtml}<div id="toReportsSendDiagnostic" class="to-reports-diagnostic"></div><div class="to-reports-sendbar"><div id="toReportsSendMsg" class="to-reports-sendmsg">${esc(sendHint)}</div><button id="toReportsSendBtn" class="btn primary" type="button" ${unsignedCount > 0 ? '' : 'disabled'}>Хужатни юбориш</button></div></div>`;
    $('toReportsSendBtn')?.addEventListener('click', () => void sendCurrent());
    if (state.lastSendResult) {
      if (Number(state.lastSendResult.failed || 0) > 0) showSendDiagnostic(state.lastSendResult);
      else showDeliveryTrace(state.lastSendResult);
    }
  }

  async function loadFolders() {
    if (state.busy) return;
    state.busy = true;
    try {
      const data = await api('/reports');
      state.periods = Array.isArray(data.periods) ? data.periods : [];
      renderFolders();
      if (state.selected) {
        const exists = state.periods.some((period) => Number(period.year) === Number(state.selected.year) && Number(period.month) === Number(state.selected.month));
        if (!exists) {
          state.selected = null;
          state.report = null;
          state.lastSendResult = null;
          $('toReportsPreview').innerHTML = '<div class="to-reports-empty">Kerakli oy papkasini tanlang.</div>';
        }
      }
    } catch (error) {
      $('toReportsFolders').innerHTML = `<div class="to-reports-empty">${esc(error.message)}</div>`;
    } finally {
      state.busy = false;
    }
  }

  async function editFolder(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m)) return;
    const workspace = window.ToJournalWorkspace;
    if (!workspace?.state || typeof workspace.openSelectedPeriod !== 'function') {
      window.alert('TO hujjatini tahrirlash oynasi topilmadi.');
      return;
    }

    const yearSelect = $('toPeriodYear');
    const monthSelect = $('toPeriodMonth');
    if (yearSelect && !Array.from(yearSelect.options).some((option) => Number(option.value) === y)) {
      const option = document.createElement('option');
      option.value = String(y);
      option.textContent = String(y);
      yearSelect.appendChild(option);
    }
    if (yearSelect) yearSelect.value = String(y);
    if (monthSelect) monthSelect.value = String(m);
    workspace.state.periodYear = y;
    workspace.state.periodMonth = m;

    close();
    await workspace.openSelectedPeriod({ fallbackToSource: false });
    await workspace.applySignerSelectionsForCurrentPeriod?.();
  }

  async function deleteFolder(year, month) {
    const y = Number(year);
    const m = Number(month);
    const period = state.periods.find((row) => Number(row.year) === y && Number(row.month) === m);
    const label = period ? folderLabel(period) : `${MONTHS[m] || m} ${y}`;
    if (!window.confirm(`${label} TO hujjatini o‘chirishni tasdiqlaysizmi? Bu amal hujjat va uning imzolash holatini o‘chiradi.`)) return;

    try {
      const result = await api(`/reports/${y}/${m}`, { method: 'DELETE' });
      if (state.selected && Number(state.selected.year) === y && Number(state.selected.month) === m) {
        state.selected = null;
        state.report = null;
        state.lastSendResult = null;
        $('toReportsPreview').innerHTML = '<div class="to-reports-empty">Hujjat o‘chirildi. Kerakli oy papkasini tanlang.</div>';
      }
      await loadFolders();

      const workspace = window.ToJournalWorkspace;
      if (workspace?.state && Number(workspace.state.periodYear) === y && Number(workspace.state.periodMonth) === m) {
        await workspace.openSelectedPeriod?.({ fallbackToSource: true });
      }
      if (clean(result?.warning)) window.alert(`Hujjat o‘chirildi. Eslatma: ${result.warning}`);
    } catch (error) {
      window.alert(error.message || 'TO hujjatini o‘chirish xatosi');
    }
  }

  async function openFolder(year, month) {
    state.selected = { year, month };
    state.lastSendResult = null;
    renderFolders();
    $('toReportsPreview').innerHTML = '<div class="to-reports-empty">A4 hujjat yuklanmoqda...</div>';
    try {
      const data = await api(`/reports/${year}/${month}`);
      if (!state.selected || Number(state.selected.year) !== Number(year) || Number(state.selected.month) !== Number(month)) return;
      state.report = data;
      renderReport();
    } catch (error) {
      $('toReportsPreview').innerHTML = `<div class="to-reports-empty">${esc(error.message)}</div>`;
    }
  }

  async function sendCurrent() {
    const selected = state.selected;
    if (!selected || state.busy) return;
    const label = state.report?.label || `${selected.year}-${selected.month}`;
    const assignedApprovers = Array.isArray(state.report?.assignedApprovers) ? state.report.assignedApprovers : [];
    const unsignedCount = Number.isFinite(Number(state.report?.unsignedApprovers))
      ? Number(state.report.unsignedApprovers)
      : assignedApprovers.length;
    if (!assignedApprovers.length) {
      const detail = {
        code: 'TO_APPROVERS_NOT_ASSIGNED',
        error: 'Hujjatga tasdiqlovchilar biriktirilmagan.',
        recommendedFix: 'Asosiy TO oynasida tasdiqlovchilarni tanlang, Saqlash tugmasini bosing va hisobotni qayta oching.',
      };
      state.lastSendResult = detail;
      setSendMessage(detail.error, 'bad');
      showSendDiagnostic(detail);
      return;
    }
    if (unsignedCount <= 0) {
      setSendMessage('Barcha imzolovchilarning imzolari mavjud. Xabar yuborilmadi.', 'ok');
      return;
    }
    if (!window.confirm(`${label} TO hujjatini faqat imzosi yo‘q ${unsignedCount} ta imzolovchiga Gmail orqali yuborishni tasdiqlaysizmi?`)) return;
    state.busy = true;
    state.lastSendResult = null;
    const button = $('toReportsSendBtn');
    if (button) button.disabled = true;
    showSendDiagnostic(null);
    setSendMessage('Hujjat imzolovchilarga yuborilmoqda...', 'sync');
    try {
      const result = await api(`/reports/${selected.year}/${selected.month}/send`, {
        method: 'POST',
        body: JSON.stringify({ assignedApprovers }),
      });
      const failed = Number(result.failed || 0);
      const sent = Number(result.sent || 0);
      const total = Number.isFinite(Number(result.total)) ? Number(result.total) : sent + failed;
      const provider = clean(result.deliveryMode || result.provider);
      state.lastSendResult = result;
      const providerText = provider && provider !== 'none' ? ` · ${provider.toUpperCase()}` : '';
      const skippedSigned = Number(result.skippedSigned || 0);
      const summary = result.allSigned
        ? `Barcha ${skippedSigned} ta imzolovchining imzosi mavjud. Xabar yuborilmadi.`
        : `${sent}/${total} ta imzosi yo‘q imzolovchiga email provider qabul qildi${skippedSigned ? ` · ${skippedSigned} ta imzosi mavjud, o‘tkazib yuborildi` : ''}${failed ? ` · ${failed} ta xatolik` : ''}${providerText}.`;
      setSendMessage(summary, failed ? 'sync' : 'ok');
      const refreshed = await api(`/reports/${selected.year}/${selected.month}`);
      state.report = refreshed;
      renderReport();
      setSendMessage(summary, failed ? 'sync' : 'ok');
      if (failed > 0) showSendDiagnostic(result);
      else showDeliveryTrace(result);
    } catch (error) {
      const detail = error?.data && typeof error.data === 'object'
        ? { ...error.data, error: error.message }
        : { code: 'EMAIL_SEND_FAILED', error: error.message };
      state.lastSendResult = detail;
      setSendMessage(error.message, 'bad');
      showSendDiagnostic(detail);
    } finally {
      state.busy = false;
      const nextButton = $('toReportsSendBtn');
      if (nextButton) nextButton.disabled = false;
    }
  }

  function open() {
    injectUi();
    $('toReportsModal')?.classList.add('show');
    void loadFolders();
  }

  function close() {
    $('toReportsModal')?.classList.remove('show');
  }

  function init() {
    injectStyle();
    injectUi();
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'SEG_KIP_WORKSPACE_CHANGE') {
      state.periods = [];
      state.selected = null;
      state.report = null;
      state.lastSendResult = null;
      if ($('toReportsModal')?.classList.contains('show')) void loadFolders();
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.ToJournalReports = { open, close, loadFolders, openFolder, editFolder, deleteFolder, sendCurrent, showSendDiagnostic, showDeliveryTrace, state };
})();
