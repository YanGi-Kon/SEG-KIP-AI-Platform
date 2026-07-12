(function setupWorkspaceActsJournal(){
  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const state = {
    workspace: null,
    analysisRows: [],
    dailyRows: [],
    selected: null,
    saving: false,
    credentialSource: '',
  };

  function $(id){ return document.getElementById(id); }
  function esc(value){ return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
  function ref(value){ return encodeURIComponent(String(value || '')); }
  function unref(value){ try { return decodeURIComponent(String(value || '')); } catch (_) { return String(value || ''); } }
  function parentStorage(kind, key){ try { return parent?.[kind]?.getItem(key) || ''; } catch (_) { return ''; } }
  function accessToken(){ return sessionStorage.getItem(ACCESS_TOKEN_KEY) || parentStorage('sessionStorage', ACCESS_TOKEN_KEY); }
  function selectedWorkspaceId(){ return localStorage.getItem(SELECTED_WORKSPACE_KEY) || parentStorage('localStorage', SELECTED_WORKSPACE_KEY); }
  function workspaceRoot(){
    const id = selectedWorkspaceId();
    if (!id) throw new Error('Workspace tanlanmagan. Qayta login qiling yoki Workspace Settings’dan obyekt tanlang.');
    return `/api/workspaces/${encodeURIComponent(id)}`;
  }
  function setStatus(text, cls=''){
    const element = $('actsStatus');
    if (element) element.innerHTML = `Ҳолат: <span class="${cls}">${esc(text)}</span>`;
  }
  function setSignersMsg(text, cls=''){
    const element = $('signersMsg');
    if (element) element.innerHTML = `<span class="${cls}">${esc(text)}</span>`;
  }
  function parentOnline(status){ try { parent.postMessage({ type:'SEG_ACTS_STATUS', status }, '*'); } catch (_) {} }

  async function parseResponse(response){
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw:text }; }
  }

  async function apiFetch(path, options={}){
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = accessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(path, { ...options, headers, credentials:'include' });
    const data = await parseResponse(response);
    if (response.status === 401) {
      throw Object.assign(new Error('Session yakunlangan. Sahifani yangilang va login/parol bilan qayta kiring.'), { status:401, data });
    }
    if (!response.ok || data.error) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { status:response.status, data });
    return data;
  }

  async function loadWorkspace(force=false){
    const id = selectedWorkspaceId();
    if (!id) throw new Error('Workspace tanlanmagan.');
    if (!force && state.workspace?.id === id) return state.workspace;
    const data = await apiFetch(workspaceRoot(), { method:'GET' });
    state.workspace = data.workspace || null;
    if (!state.workspace) throw new Error('Workspace topilmadi.');
    return state.workspace;
  }

  function connectionMessage(payload={}){
    const source = payload.credentialSource || state.credentialSource || '';
    if (source === 'WORKSPACE_SERVICE_ACCOUNT') return 'Google Sheets уланди. Workspace Service Account ishlatilmoqda.';
    if (source === 'BASE64' || source === 'JSON') return 'Google Sheets уланди. Platform fallback credential ishlatilmoqda.';
    return 'Google Sheets уланди. Маълумотлар янгиланди.';
  }

  function injectStyles(){
    if ($('actsWorkflowStyles')) return;
    const style = document.createElement('style');
    style.id = 'actsWorkflowStyles';
    style.textContent = '.btn.done{background:linear-gradient(135deg,#16a34a,#86efac)!important;color:#052e16!important;border:0!important;box-shadow:0 0 18px rgba(34,197,94,.35)!important}.btn.saving{opacity:.9!important;pointer-events:none!important;background:linear-gradient(135deg,#f59e0b,#facc15)!important;color:#1f1300!important;border:0!important}.btn.saved{background:linear-gradient(135deg,#16a34a,#22c55e,#86efac)!important;color:#022c22!important;border:0!important;box-shadow:0 0 20px rgba(34,197,94,.55)!important}.btn:active{transform:scale(.97)}.acts-a4-modal{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:80;display:none;align-items:center;justify-content:center;padding:18px}.acts-a4-modal.show{display:flex}.acts-a4-wrap{max-height:95vh;overflow:auto}.acts-a4-toolbar{display:flex;gap:10px;justify-content:center;margin-bottom:10px}.acts-a4-toolbar button{padding:10px 16px;border:0;border-radius:10px;font-weight:800;cursor:pointer}.a4-preview{width:210mm;min-height:297mm;margin:0 auto;background:#fff;color:#111;padding:18mm;font-family:"Times New Roman",serif;box-shadow:0 0 30px rgba(0,0,0,.35)}.a4-preview p{font-size:15px;line-height:1.45}.a4-preview .act-head{text-align:center;font-weight:700}.a4-preview .right{text-align:right;color:#00f;font-size:14px;margin-bottom:15px}.a4-preview .act-title{text-align:center;font-size:18px;font-weight:900;margin:10px 0}.a4-preview .signs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:25px;margin-top:32px;text-align:center;font-size:12px}@media print{.acts-a4-toolbar{display:none}.acts-a4-modal{position:static;display:block;background:#fff;padding:0}.a4-preview{box-shadow:none}}';
    document.head.appendChild(style);
  }

  function setDonut(value){
    const percentage = Math.max(0, Math.min(100, Number(value) || 0));
    const donut = $('completionDonut');
    if (!donut) return;
    donut.style.setProperty('--p', percentage);
    const label = donut.querySelector('span');
    if (label) label.textContent = `${percentage}%`;
  }

  function updateKpi(data){
    if ($('kpiTotal')) $('kpiTotal').textContent = data.totalRows ?? 0;
    if ($('kpiPlanned')) $('kpiPlanned').textContent = data.plannedDocuments ?? 0;
    if ($('kpiCreated')) $('kpiCreated').textContent = data.createdDocuments ?? 0;
    if ($('kpiSheet')) $('kpiSheet').textContent = data.sheetName || state.workspace?.mainSheetName || '—';
    setDonut(data.completionPercentage ?? 0);
  }

  function renderRows(rows){
    const body = $('analysisRows');
    if (!body) return;
    if (!rows?.length) {
      body.innerHTML = '<tr><td colspan="11">ТО-2 / АКТ қаторлари топилмади.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row, index) => {
      const action = row.isCompleted
        ? `<button class="btn done" onclick="ActsUI.viewDoc('${ref(row.actNo)}')">Хужат якунланди</button>`
        : `<button class="btn green" onclick="ActsUI.fillDoc(${index})">Хужат яратиш</button>`;
      return `<tr data-source-key="${esc(row.sourceKey || '')}"><td>${index + 1}</td><td>${esc(row.date)}</td><td>${esc(row.positionNo)}</td><td>${esc(row.deviceName)}</td><td>${esc(row.typeMark)}</td><td>${esc(row.serialNo)}</td><td>${esc(row.measureRange)}</td><td>${esc(row.place)}</td><td class="icol">${esc(row.workType)}</td><td>${esc(row.executor)}</td><td>${action}</td></tr>`;
    }).join('');
  }

  async function loadAnalysis(){
    try {
      setStatus('Tanlangan Workspace Google Sheets bilan sinxronlanmoqda...', 'sync');
      parentOnline('SYNCING');
      await loadWorkspace(true);
      const data = await apiFetch(`${workspaceRoot()}/acts/monthly-analysis`, { method:'POST', body:'{}' });
      state.analysisRows = data.rows || [];
      state.credentialSource = data.credentialSource || '';
      updateKpi(data);
      renderRows(state.analysisRows);
      setStatus(connectionMessage(data), data.credentialSource === 'WORKSPACE_SERVICE_ACCOUNT' ? 'ok' : 'sync');
      parentOnline('ONLINE');
      return data;
    } catch (error) {
      setStatus(error.message, 'bad');
      parentOnline('OFFLINE');
      return null;
    }
  }

  async function loadReports(){
    const body = $('dailyRows');
    try {
      await loadWorkspace();
      const data = await apiFetch(`${workspaceRoot()}/acts/reports/daily`, { method:'GET' });
      const rows = data.rows || [];
      state.dailyRows = rows;
      state.credentialSource = data.credentialSource || state.credentialSource;
      if (!rows.length) {
        if (body) body.innerHTML = '<tr><td colspan="9">Кунлик ҳисоботда ҳужжатлар йўқ.</td></tr>';
        return rows;
      }
      if (body) body.innerHTML = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.actNo)}</td><td>${esc(row.date)}</td><td>${esc(row.device)}</td><td>${esc(row.serial)}</td><td>${esc(row.place)}</td><td>${esc(row.executor)}</td><td>${esc(row.status)}</td><td><button class="btn primary small" onclick="ActsUI.viewDoc('${ref(row.actNo)}')">Кўриш</button> <button class="btn orange small" onclick="ActsUI.sendDoc('${ref(row.actNo)}')">Хужатни юбориш</button></td></tr>`).join('');
      return rows;
    } catch (error) {
      if (body) body.innerHTML = `<tr><td colspan="9">${esc(error.message)}</td></tr>`;
      return [];
    }
  }

  function formatWorkPlace(row){ return `${row.deviceName || ''} ${row.typeMark || ''}, завод рақами ${row.serialNo || ''},\nўлчаш чегараси ${row.measureRange || ''},\n${row.place || ''}, поз. №${row.positionNo || ''}`.replace(/ +,/g, ',').trim(); }
  function today(){ const date = new Date(); return `${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.${date.getFullYear()}`; }
  function resetSaveButton(){ const button=$('saveActBtn'); if(!button)return; button.classList.remove('saving','saved'); button.textContent='Сақлаш'; }
  function saveButton(mode){ const button=$('saveActBtn'); if(!button)return; button.classList.remove('saving','saved'); if(mode==='saving'){button.classList.add('saving');button.textContent='⏳ Сақланмоқда...';button.disabled=true;return;} if(mode==='saved'){button.classList.add('saved');button.textContent='Сақланди ✓';button.disabled=true;return;} resetSaveButton(); }

  function fillDoc(index){
    const row = state.analysisRows[index];
    if (!row) return;
    if (row.isCompleted) return viewDoc(ref(row.actNo));
    state.selected = row;
    if ($('workPlace')) $('workPlace').value = formatWorkPlace(row);
    if ($('actDate')) $('actDate').value = row.date || today();
    if ($('actNo')) $('actNo').value = '';
    ['failureText','impactText','reasonText','actionText','conclusion'].forEach((id) => { if ($(id)) $(id).value=''; });
    resetSaveButton();
    showView('create', $('tab-create'));
    validateDoc();
  }

  function collectActBase(){
    const row = state.selected || {};
    return {
      actNo:$('actNo')?.value.trim() || '', date:$('actDate')?.value.trim() || '', workPlace:$('workPlace')?.value.trim() || '',
      deviceName:row.deviceName || '', serialNo:row.serialNo || '', place:row.place || '', executor:row.executor || '',
      person1:$('person1')?.value || '', position1:$('position1')?.value || '', department1:$('department1')?.value || '',
      person2:$('person2')?.value || '', position2:$('position2')?.value || '', department2:$('department2')?.value || '',
      person3:$('person3')?.value || '', position3:$('position3')?.value || '', department3:$('department3')?.value || '',
      failureText:$('failureText')?.value.trim() || '', impactText:$('impactText')?.value.trim() || '', reasonText:$('reasonText')?.value.trim() || '',
      actionText:$('actionText')?.value.trim() || '', conclusion:$('conclusion')?.value.trim() || '',
      sourceSheet:row.sourceSheet || state.workspace?.mainSheetName || '', sourceRowNumber:row.sourceRowNumber || '', sourceKey:row.sourceKey || '',
    };
  }

  function buildA4ActHtml(act){
    const sign='<div class="signs"><div>_________________<br>(Лавозими)</div><div>_________________<br>(Имзо)</div><div>_________________<br>(Ф.И.Ш.)</div></div>';
    return `<div class="a4-preview"><div class="act-head"><div class="right">Низомга илова №4<br>“SANEG” МЧЖ К/К объектларида<br>назорат ўлчов воситалари ва автоматлаштириш тизимларига<br>техник хизмат кўрсатиш бўйича</div><div style="text-align:right;font-weight:400">ТПП «Андижан»</div><div class="act-title">ДАЛОЛАТНОМА № ${esc(act.actNo || '')}</div><div>Ўлчов воситасининг бузилиши</div></div><p><b>Сана:</b> ${esc(act.date)}</p><p><b>1. Ў.В. Ишлаш жойи:</b><br>${esc(act.workPlace).replace(/\n/g,'<br>')}</p><p><b>2. Рад этиш мазмуни, санаси, вақти:</b><br>${esc(act.failureText)}</p><p><b>3. Носозликнинг технологик оқибатлари:</b><br>${esc(act.impactText)}</p><p><b>4. Рад этиш сабаби:</b><br>${esc(act.reasonText)}</p><p><b>5. Носозликни бартараф этиш бўйича оператив ҳаракатлар ва бартараф этиш вақти:</b><br>${esc(act.actionText)}</p><p><b>Хулоса:</b><br>${esc(act.conclusion)}</p><p><b>Имзолар:</b></p>${sign}${sign}</div>`;
  }

  function collectAct(){ const base=collectActBase(); return { ...base, a4Html:buildA4ActHtml(base), a4Json:JSON.stringify(base) }; }
  function validateDoc(){
    const act=collectActBase();
    const required=['date','workPlace','failureText','impactText','reasonText','actionText','conclusion'];
    const percentage=Math.round((required.filter((key)=>act[key]).length / required.length) * 100);
    if ($('fillBar')) $('fillBar').style.width=`${percentage}%`;
    if ($('fillText')) $('fillText').textContent=`Тўлдирилиш: ${percentage}%`;
    const button=$('saveActBtn');
    if (button && !state.saving && !button.classList.contains('saved')) button.disabled=percentage<100 || !state.selected;
    return percentage>=100;
  }
  function markCompleted(actNo){ const key=state.selected?.sourceKey; if(!key)return; state.analysisRows=state.analysisRows.map((row)=>row.sourceKey===key?{...row,isCompleted:true,actNo,status:'Хужат якунланди'}:row); renderRows(state.analysisRows); }

  async function saveAct(){
    if (state.saving) return;
    if (!validateDoc()) return setStatus('Мажбурий майдонларни тўлдиринг.', 'bad');
    state.saving=true;
    saveButton('saving');
    try {
      await loadWorkspace();
      setStatus('Ҳужжат танланган Workspace Google Sheets’га сақланмоқда...', 'sync');
      const result=await apiFetch(`${workspaceRoot()}/acts/create`, { method:'POST', body:JSON.stringify({ act:collectAct() }) });
      if ($('actNo')) $('actNo').value=result.actNo || '';
      saveButton('saved');
      markCompleted(result.actNo || '');
      setStatus(result.duplicate ? `Ҳужжат аввал якунланган: ${result.actNo}` : `Ҳужжат сақланди: ${result.actNo}.`, 'ok');
      await loadReports();
      await loadAnalysis();
      setTimeout(()=>{ showView('analysis', $('tab-analysis')); state.saving=false; }, 900);
    } catch (error) {
      state.saving=false;
      resetSaveButton();
      validateDoc();
      setStatus(error.message, 'bad');
    }
  }

  function showView(id, button){ document.querySelectorAll('.view').forEach((view)=>view.classList.remove('active')); $(id)?.classList.add('active'); document.querySelectorAll('.acts-top .tabs button').forEach((item)=>item.classList.remove('active')); button?.classList.add('active'); if(id==='reports')loadReports(); }
  function showReport(id, button){ document.querySelectorAll('.report-view').forEach((view)=>view.classList.remove('active')); $(id)?.classList.add('active'); document.querySelectorAll('.subtabs button').forEach((item)=>item.classList.remove('active')); button?.classList.add('active'); }
  async function openExcel(){ try { const workspace=await loadWorkspace(); if(!workspace.spreadsheetUrl)throw new Error('Workspace Google Sheets havolasi kiritilmagan.'); window.open(workspace.spreadsheetUrl,'_blank','noopener,noreferrer'); } catch(error){ setStatus(error.message,'bad'); } }

  function configureSettingsModal(){
    const fileInput=$('serviceFile');
    const field=fileInput?.closest('.field');
    if(field) field.style.display='none';
    if($('sheetUrl')) $('sheetUrl').readOnly=true;
    if($('sheetName')) $('sheetName').readOnly=true;
    const modal=$('settingsModal');
    const note=modal?.querySelector('.note');
    if(note) note.textContent='Google Sheets va Service Account sozlamalari Workspace Settings orqali boshqariladi. JSON private_key brauzerda saqlanmaydi.';
    const save=modal?.querySelector('button.btn.primary');
    if(save) save.textContent='Workspace Settings’ni ochish';
  }

  async function openSettings(){
    configureSettingsModal();
    $('settingsModal')?.classList.add('show');
    try {
      const workspace=await loadWorkspace(true);
      if($('sheetUrl')) $('sheetUrl').value=workspace.spreadsheetUrl || '';
      if($('sheetName')) $('sheetName').value=workspace.mainSheetName || '';
      const source=workspace.serviceAccountStatus === 'configured' ? `Workspace JSON: ${workspace.serviceAccountClientEmail || 'configured'}` : 'Workspace JSON yuklanmagan; platform fallback ishlatilishi mumkin.';
      if($('settingsMsg')) $('settingsMsg').innerHTML=`<span class="${workspace.serviceAccountStatus === 'configured' ? 'ok' : 'sync'}">${esc(source)}</span>`;
    } catch(error){ if($('settingsMsg')) $('settingsMsg').innerHTML=`<span class="bad">${esc(error.message)}</span>`; }
  }
  function closeSettings(){ $('settingsModal')?.classList.remove('show'); }
  function saveSettings(){ closeSettings(); try { if(typeof parent.openWorkspaceSettings==='function') parent.openWorkspaceSettings(); else setStatus('Workspace Settings menyusini oching.','sync'); } catch(_) { setStatus('Workspace Settings menyusini oching.','sync'); } }

  async function findReport(actNo){ const number=unref(actNo); if(!state.dailyRows.length)await loadReports(); return state.dailyRows.find((row)=>String(row.actNo || '')===number); }
  function ensureA4Modal(){ let modal=$('actsA4Modal'); if(modal)return modal; modal=document.createElement('div'); modal.id='actsA4Modal'; modal.className='acts-a4-modal'; modal.innerHTML='<div class="acts-a4-wrap"><div class="acts-a4-toolbar"><button onclick="window.print()">PDF / Print</button><button onclick="document.getElementById(\'actsA4Modal\').classList.remove(\'show\')">Yopish</button></div><div id="actsA4Content"></div></div>'; document.body.appendChild(modal); return modal; }
  async function viewDoc(actNo){ const report=await findReport(actNo); if(!report){alert('Ҳужжат топилмади.');return;} let html=report.a4Html || ''; if(!html){let act=null;try{act=JSON.parse(report.a4Json || 'null');}catch(_){}html=buildA4ActHtml(act || report);} ensureA4Modal(); $('actsA4Content').innerHTML=html; $('actsA4Modal').classList.add('show'); }
  function sendDoc(){ setStatus('Workspace hujjat yuborish moduli yuklanmoqda. Qayta urinib ko‘ring.','sync'); }
  function openSigners(){ $('signersModal')?.classList.add('show'); setSignersMsg('Workspace imzo chekuvchilar moduli yuklanmoqda...','sync'); }
  function closeSigners(){ $('signersModal')?.classList.remove('show'); }
  function loadSigners(){ setSignersMsg('Workspace imzo chekuvchilar moduli yuklanmoqda...','sync'); }
  function addSignerRow(){}
  function editSigner(){}
  function saveSigner(){}
  function deleteSigner(){}

  function bind(){
    injectStyles();
    configureSettingsModal();
    ['failureText','impactText','reasonText','actionText','conclusion'].forEach((id)=>$(id)?.addEventListener('input',validateDoc));
    if (!accessToken()) {
      setStatus('Login talab qilinadi. Asosiy sahifada login/parol bilan kiring.', 'bad');
      return;
    }
    if (!selectedWorkspaceId()) {
      setStatus('Workspace tanlanmagan. Workspace Settings’dan obyekt tanlang.', 'bad');
      return;
    }
    loadAnalysis();
  }

  window.ActsUI={ showView,showReport,openSettings,closeSettings,saveSettings,loadAnalysis,loadReports,fillDoc,saveAct,openExcel,setStatus,viewDoc,sendDoc,openSigners,closeSigners,loadSigners,addSignerRow,editSigner,saveSigner,deleteSigner,state };
  document.addEventListener('DOMContentLoaded', bind);
})();
