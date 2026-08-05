(function(){
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const state = { analysisRows: [], dailyRows: [], signers: [], selected: null, saving: false, workspaceApprovers: null, workspace: null };
  const WORKSPACE_PERMISSIONS = Object.freeze({
    owner: new Set(['documents:read','documents:create','documents:send']),
    administrator: new Set(['documents:read','documents:create','documents:send']),
    operator: new Set(['documents:read','documents:create','documents:send']),
    engineer: new Set(['documents:read','documents:create']),
    department_manager: new Set(['documents:read','documents:send']),
    viewer: new Set(['documents:read'])
  });
  const PDF_MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function ref(v){ return encodeURIComponent(String(v || '')); }
  function unref(v){ try { return decodeURIComponent(String(v || '')); } catch(_) { return String(v || ''); } }
  function clean(v){ return String(v ?? '').trim(); }
  function pget(store,key){ try { return parent?.[store]?.getItem(key) || ''; } catch(_) { return ''; } }

  function settings(){
    if(state.workspace){
      return { spreadsheetUrl:state.workspace.spreadsheetUrl||'', sheetName:state.workspace.mainSheetName||'', serviceAccount:null };
    }
    return { spreadsheetUrl: '', sheetName: '', serviceAccount: null };
  }
  function workspaceMode(){ return Boolean(workspaceId() && workspaceToken()); }
  function hasPermission(permission){
    if(!workspaceMode()) return true;
    const role=String(state.workspace?.memberRole||'').toLowerCase();
    return Boolean(WORKSPACE_PERMISSIONS[role]?.has(permission));
  }
  function hasSettings(){ return Boolean(state.workspace && state.workspace.spreadsheetUrl && state.workspace.mainSheetName); }
  function setStatus(text, cls=''){ const el=$('actsStatus'); if(el) el.innerHTML = `Ҳолат: <span class="${cls}">${esc(text)}</span>`; }
  function setSignersMsg(text, cls=''){ const el=$('signersMsg'); if(el) el.innerHTML = `<span class="${cls}">${esc(text)}</span>`; }
  function parentOnline(status){ try { parent.postMessage({ type:'SEG_ACTS_STATUS', status }, '*'); } catch(_) {} }

  function toBase64Url(value){
    const bytes = new TextEncoder().encode(String(value));
    let binary='';
    bytes.forEach((b)=>{ binary+=String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function configHeader(){
    const s=settings();
    return toBase64Url(JSON.stringify({ spreadsheetUrl:s.spreadsheetUrl, serviceAccount:s.serviceAccount }));
  }
  function adminToken(){ return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; }
  function workspaceId(){ return localStorage.getItem(WORKSPACE_ID_KEY) || pget('localStorage', WORKSPACE_ID_KEY) || ''; }
  function workspaceToken(){ return sessionStorage.getItem(WORKSPACE_TOKEN_KEY) || pget('sessionStorage', WORKSPACE_TOKEN_KEY) || ''; }

  async function loginAdmin(){
    const password = window.prompt('Administrator parolini kiriting:');
    if(password === null) throw new Error('Administrator autentifikatsiyasi bekor qilindi');
    const res = await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,name:'KIP Administrator'})});
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || 'Administrator login xatosi');
    sessionStorage.setItem(ADMIN_TOKEN_KEY,data.token);
    return data.token;
  }

  async function apiFetch(url, options={}, retry=true){
    const headers = new Headers(options.headers || {});
    const id=workspaceId();
    if(workspaceMode()){
      headers.set('x-workspace-id',id);
      if(window.WorkspaceApiClient) return window.WorkspaceApiClient.request(url,{...options,headers});
      headers.set('Authorization',`Bearer ${workspaceToken()}`);
    }else{
      if(hasSettings()) headers.set('x-seg-kip-config',configHeader());
      if(adminToken()) headers.set('Authorization',`Bearer ${adminToken()}`);
    }
    const res = await fetch(url,{...options,headers});
    const data = await res.json().catch(()=>({}));
    if(res.status===401 && data.code==='ADMIN_AUTH_REQUIRED' && retry){
      await loginAdmin();
      return apiFetch(url,options,false);
    }
    if(!res.ok || data.error) throw new Error(data.error || 'API хатоси');
    return data;
  }
  async function postJson(url, body){
    return apiFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  }
  async function workspaceFetch(path){
    const id = workspaceId();
    const token = workspaceToken();
    if(!id || !token) return null;
    if(window.WorkspaceApiClient) return window.WorkspaceApiClient.request(`/api/workspaces/${encodeURIComponent(id)}${path}`, { method:'GET' });
    const headers = new Headers({ Authorization:`Bearer ${token}` });
    const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}${path}`, { headers, credentials:'include' });
    if(!res.ok) return null;
    return res.json().catch(()=>null);
  }
  async function loadWorkspaceContext(){
    if(!workspaceMode()) return null;
    const data=await workspaceFetch('');
    if(!data?.workspace) throw new Error('Tanlangan workspace ma’lumoti yuklanmadi. Qayta login qiling.');
    state.workspace=data.workspace;
    applyWorkspacePermissions();
    return state.workspace;
  }
  async function handleWorkspaceChange(){
    state.workspace=null;
    state.workspaceApprovers=null;
    if(!workspaceMode()) return;
    try{await loadWorkspaceContext();await loadAnalysis();}
    catch(err){setStatus(err.message,'bad');}
  }
  async function loadWorkspaceApproverRegistry(force=false){
    if(!force && Array.isArray(state.workspaceApprovers)) return state.workspaceApprovers;
    const data = await workspaceFetch('/signers?includeInactive=true');
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    state.workspaceApprovers = rows.map((row)=>({
      signerId: clean(row.id),
      fio: clean(row.fullName || row.fio),
      position: clean(row.position),
      gmail: clean(row.email || row.gmail),
      signatureUrl: clean(row.signatureUrl),
      signatureFileId: clean(row.signatureFileId)
    })).filter((row)=>row.signerId || row.fio || row.gmail);
    return state.workspaceApprovers;
  }

  function injectStyles(){
    if(document.getElementById('actsWorkflowStyles')) return;
    const style=document.createElement('style');
    style.id='actsWorkflowStyles';
    style.textContent=`
.btn.done{background:linear-gradient(135deg,#16a34a,#86efac)!important;color:#052e16!important;border:0!important;box-shadow:0 0 18px rgba(34,197,94,.35)!important}
.btn.saving{opacity:.9!important;pointer-events:none!important;background:linear-gradient(135deg,#f59e0b,#facc15)!important;color:#1f1300!important;border:0!important}
.btn.saved{background:linear-gradient(135deg,#16a34a,#22c55e,#86efac)!important;color:#022c22!important;border:0!important;box-shadow:0 0 20px rgba(34,197,94,.55)!important}
.btn:active{transform:scale(.97)}
.acts-a4-modal{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:80;display:none;align-items:center;justify-content:center;padding:18px}
.acts-a4-modal.show{display:flex}
.acts-a4-wrap{max-height:95vh;overflow:auto}
.acts-a4-toolbar{display:flex;gap:10px;justify-content:center;margin-bottom:10px}
.acts-a4-toolbar button{padding:10px 16px;border:0;border-radius:10px;font-weight:800;cursor:pointer}
.a4-preview{width:210mm;min-height:297mm;margin:0 auto;background:#fff;color:#111;padding:14mm 18mm 16mm;font-family:"Times New Roman",serif;box-shadow:0 0 30px rgba(0,0,0,.35);font-size:15px;line-height:1.28}
.a4-preview p{margin:0}
.a4-preview .act-meta{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:8mm}
.a4-preview .act-date-head{font-size:13px;line-height:1.2;white-space:nowrap;padding-top:28mm}
.a4-preview .act-date-head .line{display:inline-block;min-width:26px;border-bottom:1px solid #111;text-align:center;line-height:1;padding:0 2px 1px}
.a4-preview .act-date-head .month,.a4-preview .act-date-head .year{color:#1d4ed8;font-style:italic}
.a4-preview .act-head{margin-bottom:10mm}
.a4-preview .right{text-align:right;color:#1d4ed8;font-size:14px;line-height:1.25;font-weight:700;max-width:92mm;margin-left:auto;white-space:pre-line}
.a4-preview .act-title{display:flex;justify-content:center;align-items:flex-end;gap:10px;font-size:20px;font-weight:700;line-height:1.05;text-align:center;margin:0 0 4px}
.a4-preview .act-title .act-no-line{display:inline-flex;align-items:flex-end;justify-content:center;min-width:82px;padding:0 6px 2px;border-bottom:1px solid #111}
.a4-preview .act-subtitle{text-align:center;font-size:16px;font-weight:700;margin-bottom:0}
.a4-preview .act-signers-title{font-weight:700;font-size:16px;margin:0 0 8px}
.a4-preview .act-signers{display:grid;gap:14px;margin-bottom:14px}
.a4-preview .act-signers-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:end}
.a4-preview .act-signers-cell{text-align:center;min-width:0}
.a4-preview .act-signers-value{min-height:22px;padding:0 4px 1px;border-bottom:1px solid #111;text-align:center;display:flex;align-items:flex-end;justify-content:center;word-break:break-word}
.a4-preview .act-signers-label{font-size:12px;line-height:1.15;font-style:italic;margin-top:2px}
.a4-preview .act-section{margin-top:12px}
.a4-preview .act-section-title{font-size:16px;font-weight:700;margin-bottom:6px}
.a4-preview .act-section-value{min-height:20px;padding:0 2px 4px;border-bottom:1px solid #111;white-space:pre-wrap;word-break:break-word}
.a4-preview .act-section-value.tall{min-height:60px}
.a4-preview .act-section-value.xl{min-height:88px}
.a4-preview .act-date-inline{display:flex;justify-content:flex-end;align-items:flex-end;gap:10px;font-size:13px;font-weight:700;margin-top:4px}
.a4-preview .act-date-inline .line{display:inline-flex;align-items:flex-end;justify-content:center;min-width:132px;padding:0 4px 1px;border-bottom:1px solid #111;font-weight:400}
.a4-preview .act-conclusion{margin-top:12px}
.a4-preview img{max-width:100%;height:auto}
@media (max-width:980px){
  .a4-preview{padding:12mm 12mm 14mm;font-size:14px}
  .a4-preview .act-meta{gap:10px;margin-bottom:6mm}
  .a4-preview .act-date-head{padding-top:18mm}
  .a4-preview .act-title{font-size:18px}
  .a4-preview .act-subtitle{font-size:15px}
}
@media (max-width:760px){
  .a4-preview .act-meta{display:block}
  .a4-preview .act-date-head{padding-top:0;margin-bottom:10px}
  .a4-preview .act-signers-row{grid-template-columns:1fr}
  .a4-preview .act-date-inline{justify-content:flex-start;flex-wrap:wrap}
  .a4-preview .act-date-inline .line{min-width:0;width:100%}
}
@media print{
  .acts-a4-toolbar{display:none}
  .acts-a4-modal{position:static;display:block;background:#fff;padding:0}
  .a4-preview{box-shadow:none}
}`;
    document.head.appendChild(style);
  }

  function stripLegacyManualSignatureBlock(html){
    let source = String(html || '').trim();
    if(!source) return source;
    const patterns = [
      /<p[^>]*>\s*<b>\s*Имзолар:\s*<\/b>\s*<\/p>/giu,
      /<div[^>]*class="[^"]*signs[^"]*"[^>]*>[\s\S]*?<\/div>\s*<div[^>]*class="[^"]*signs[^"]*"[^>]*>[\s\S]*?<\/div>/giu,
      /<div[^>]*>\s*Имзолар:\s*<\/div>/giu,
      /Имзолар:/giu,
      /_{5,}/gu,
      /\((?:Лавозими|Имзо|Ф\.И\.Ш\.)\)/giu
    ];
    patterns.forEach((pattern)=>{ source = source.replace(pattern, ''); });
    let previous='';
    while(previous!==source){
      previous=source;
      source=source
        .replace(/<(p|div|span|section)([^>]*)>\s*(?:<br\s*\/?>\s*)*<\/\1>/giu,'')
        .replace(/(<br\s*\/?>\s*){3,}/giu,'<br><br>')
        .replace(/\n{3,}/g,'\n\n');
    }
    return source;
  }

  function setDonut(pct){ const v=Math.max(0,Math.min(100,Number(pct)||0)); const d=$('completionDonut'); if(d){d.style.setProperty('--p',v); const s=d.querySelector('span'); if(s)s.textContent=`${v}%`;}}
  function updateKpi(data){ $('kpiTotal').textContent=data.totalRows??0; $('kpiPlanned').textContent=data.plannedDocuments??0; $('kpiCreated').textContent=data.createdDocuments??0; $('kpiSheet').textContent=data.sheetName||settings().sheetName||'—'; setDonut(data.completionPercentage||0); }
  function formatWorkPlace(row){ return `${row.deviceName||''} ${row.typeMark||''}, завод рақами ${row.serialNo||''},\nўлчаш чегараси ${row.measureRange||''},\n${row.place||''}, поз. №${row.positionNo||''}`.replace(/ +,/g,',').trim(); }
  function today(){ const d=new Date(); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; }

  function applyWorkspacePermissions(){
    const createAllowed=hasPermission('documents:create');
    const createTab=$('tab-create');
    if(createTab){
      createTab.disabled=!createAllowed;
      createTab.title=createAllowed?'':'Sizning workspace rolingiz hujjat yaratishga ruxsat bermaydi.';
    }
    const settingsButton=document.querySelector('[onclick="ActsUI.openSettings()"]');
    if(settingsButton) settingsButton.style.display=workspaceMode()?'none':'';
    if(!createAllowed && $('create')?.classList.contains('active')) showView('analysis',$('tab-analysis'));
    validateDoc();
  }

  function parsePdfDate(raw){
    const value = clean(raw);
    const match = value.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if(match){
      const monthIndex = Math.max(1, Math.min(12, Number(match[2]))) - 1;
      return { day: match[1].padStart(2,'0'), month: PDF_MONTHS[monthIndex], year: match[3] };
    }
    const date = new Date(value);
    if(!Number.isNaN(date.getTime())){
      return { day: String(date.getDate()).padStart(2,'0'), month: PDF_MONTHS[date.getMonth()], year: String(date.getFullYear()) };
    }
    return { day:'', month: PDF_MONTHS[new Date().getMonth()], year:String(new Date().getFullYear()) };
  }

  function renderRows(rows){
    const tb=$('analysisRows');
    if(!rows||!rows.length){tb.innerHTML='<tr><td colspan="11">ТО-2 / АКТ қаторлари топилмади.</td></tr>';return;}
    tb.innerHTML=rows.map((r,i)=>{const action=r.isCompleted?`<button class="btn done" onclick="ActsUI.viewDoc('${ref(r.actNo)}')">Хужат якунланди</button>`:hasPermission('documents:create')?`<button class="btn green" onclick="ActsUI.fillDoc(${i})">Хужат яратиш</button>`:'<span class="note">Yaratish huquqi yoʻq</span>';return `<tr data-source-key="${esc(r.sourceKey||'')}"><td>${i+1}</td><td>${esc(r.date)}</td><td>${esc(r.positionNo)}</td><td>${esc(r.deviceName)}</td><td>${esc(r.typeMark)}</td><td>${esc(r.serialNo)}</td><td>${esc(r.measureRange)}</td><td>${esc(r.place)}</td><td class="icol">${esc(r.workType)}</td><td>${esc(r.executor)}</td><td>${action}</td></tr>`;}).join('');
  }
  async function loadAnalysis(){
    if(workspaceMode()&&!state.workspace) await loadWorkspaceContext();
    if(!hasSettings()){setStatus('Workspace Google Sheets созламалари киритилмаган.','bad');return;}
    try{setStatus('Google Sheets билан синхронланмоқда...','sync');parentOnline('SYNCING');const data=await postJson('/api/acts/monthly-analysis',settings());state.analysisRows=data.rows||[];updateKpi(data);renderRows(state.analysisRows);setStatus('Google Sheets уланди. Маълумотлар янгиланди.','ok');parentOnline('ONLINE');}
    catch(err){setStatus(err.message,'bad');parentOnline('OFFLINE');}
  }
  async function loadReports(){
    const tb=$('dailyRows');
    if(workspaceMode()&&!state.workspace) await loadWorkspaceContext();
    if(!hasSettings()){tb.innerHTML='<tr><td colspan="9">Google Sheets созламалари киритилмаган.</td></tr>';return[];}
    try{const data=await postJson('/api/acts/reports/daily',settings());const rows=data.rows||[];state.dailyRows=rows;if(!rows.length){tb.innerHTML='<tr><td colspan="9">Кунлик ҳисоботда ҳужжатлар йўқ.</td></tr>';return rows;}tb.innerHTML=rows.map((r,i)=>{const send=hasPermission('documents:send')?` <button class="btn orange small" onclick="ActsUI.sendDoc('${ref(r.actNo)}')">Хужатни юбориш</button>`:'';return `<tr><td>${i+1}</td><td>${esc(r.actNo)}</td><td>${esc(r.date)}</td><td>${esc(r.device)}</td><td>${esc(r.serial)}</td><td>${esc(r.place)}</td><td>${esc(r.executor)}</td><td>${esc(r.status)}</td><td><button class="btn primary small" onclick="ActsUI.viewDoc('${ref(r.actNo)}')">Кўриш</button>${send}</td></tr>`;}).join('');return rows;}
    catch(err){tb.innerHTML=`<tr><td colspan="9">${esc(err.message)}</td></tr>`;return[];}
  }

  function resetSaveButton(){const b=$('saveActBtn');if(!b)return;b.classList.remove('saving','saved');b.textContent='Сақлаш';}
  function saveButton(mode){const b=$('saveActBtn');if(!b)return;b.classList.remove('saving','saved');if(mode==='saving'){b.classList.add('saving');b.textContent='⏳ Сақланмоқда...';b.disabled=true;return;}if(mode==='saved'){b.classList.add('saved');b.textContent='Сақланди ✓';b.disabled=true;return;}resetSaveButton();}
  function fillDoc(index){if(!hasPermission('documents:create'))return setStatus('Sizning workspace rolingiz hujjat yaratishga ruxsat bermaydi.','bad');const row=state.analysisRows[index];if(!row)return;if(row.isCompleted){viewDoc(ref(row.actNo));return;}state.selected=row;$('workPlace').value=formatWorkPlace(row);$('actDate').value=row.date||today();$('actNo').value='';['failureText','impactText','reasonText','actionText','conclusion'].forEach(id=>{if($(id))$(id).value='';});resetSaveButton();showView('create',$('tab-create'));validateDoc();}
  function collectActBase(){const r=state.selected||{};return{actNo:$('actNo').value.trim(),date:$('actDate').value.trim(),workPlace:$('workPlace').value.trim(),deviceName:r.deviceName||'',serialNo:r.serialNo||'',place:r.place||'',executor:r.executor||'',person1:$('person1').value.trim(),position1:$('position1').value.trim(),department1:$('department1').value.trim(),person2:$('person2').value.trim(),position2:$('position2').value.trim(),department2:$('department2').value.trim(),person3:$('person3').value.trim(),position3:$('position3').value.trim(),department3:$('department3').value.trim(),sourceSheet:r.sourceSheet||'',sourceRowNumber:r.sourceRowNumber||'',sourceKey:r.sourceKey||'',failureText:$('failureText').value.trim(),impactText:$('impactText').value.trim(),reasonText:$('reasonText').value.trim(),actionText:$('actionText').value.trim(),conclusion:$('conclusion').value.trim()};}
  function collectAssignedApproverSlots(base){
    return [1,2,3].map((slot)=>({ slot, fio: clean(base[`person${slot}`]), position: clean(base[`position${slot}`]), department: clean(base[`department${slot}`]) })).filter((row)=>row.fio || row.position || row.department);
  }
  function signerCell(value,label){ return `<div class="act-signers-cell"><div class="act-signers-value">${esc(value || '')}</div><div class="act-signers-label">${label}</div></div>`; }
  function buildSignerRows(a){
    return [1,2,3].map((slot)=>`<div class="act-signers-row">${signerCell(a[`person${slot}`],'(Ф.И.Ш.)')}${signerCell(a[`position${slot}`],'(Лавозими)')}${signerCell(a[`department${slot}`],'(цех ва м/р)')}</div>`).join('');
  }
  function sectionHtml(title, value, extra='', valueClass=''){ return `<div class="act-section"><div class="act-section-title">${title}</div><div class="act-section-value ${valueClass}">${esc(value || '').replace(/\n/g,'<br>')}</div>${extra}</div>`; }
  function buildA4ActHtml(a){
    const dateParts = parsePdfDate(a.date);
    const signerBlock = `<div class="act-signers-title">Биз имзо чекувчилар:</div><div class="act-signers">${buildSignerRows(a)}</div>`;
    return `<div class="a4-preview"><div class="act-meta"><div class="act-date-head">&quot;<span class="line">${esc(dateParts.day)}</span>&quot; <span class="month">${esc(dateParts.month)}</span> <span class="year">${esc(dateParts.year)}</span> г.</div><div class="right">Низомга илова №4<br>“SANEG” МЧЖ К/К объектларида<br>назорат ўлчов воситалари ва автоматлаштириш тизимларига<br>техник хизмат кўрсатиш бўйича<br>ТПП «Андижан»</div></div><div class="act-head"><div class="act-title"><span>ДАЛОЛАТНОМА №</span><span class="act-no-line">${esc(a.actNo||'')}</span></div><div class="act-subtitle">Ўлчов воситасининг бузилиши</div></div>${signerBlock}${sectionHtml('1. Ў.В. Ишлаш жойи', a.workPlace)}${sectionHtml('2. Рад этиш мазмуни, санаси, вақти:', a.failureText, `<div class="act-date-inline"><span>Сана:</span><span class="line">${esc(a.date || '')}</span></div>`)}${sectionHtml('3. Носозликнинг технологик оқибатлари:', a.impactText, '', 'tall')}${sectionHtml('4. Рад этиш сабаби:', a.reasonText, '', 'tall')}${sectionHtml('5. Носозликни бартараф этиш бўйича оператив ҳаракатлар ва бартараф этиш вақти:', a.actionText, '', 'xl')}<div class="act-conclusion">${sectionHtml('Хулоса:', a.conclusion, '', 'xl')}</div></div>`;
  }
  function collectAct(){ const base=collectActBase(); const payload={...base, assignedApprovers: collectAssignedApproverSlots(base)}; return {...payload,a4Html:stripLegacyManualSignatureBlock(buildA4ActHtml(payload)),a4Json:JSON.stringify(payload)}; }
  function validateDoc(){const a=collectActBase();const required=['date','workPlace','failureText','impactText','reasonText','actionText','conclusion'];const done=required.filter(k=>a[k]).length;const pct=Math.round(done/required.length*100);$('fillBar').style.width=pct+'%';$('fillText').textContent=`Тўлдирилиш: ${pct}%`;const b=$('saveActBtn');if(b&&!state.saving&&!b.classList.contains('saved'))b.disabled=!hasPermission('documents:create')||pct<100||!state.selected;return pct>=100;}
  function markCompleted(actNo){const key=state.selected?.sourceKey;if(!key)return;state.analysisRows=state.analysisRows.map(r=>r.sourceKey===key?{...r,isCompleted:true,actNo,status:'Хужат якунланди'}:r);renderRows(state.analysisRows);}
  async function saveAct(){
    if(state.saving)return;
    if(!hasPermission('documents:create')){setStatus('Sizning workspace rolingiz hujjat yaratishga ruxsat bermaydi.','bad');return;}
    if(!validateDoc()){setStatus('Мажбурий майдонларни тўлдиринг.','bad');return;}
    state.saving=true;saveButton('saving');
    try{await loadWorkspaceApproverRegistry().catch(()=>[]);setStatus('Ҳужжат Google Sheets га сақланмоқда...','sync');const result=await postJson('/api/acts/create',{...settings(),act:collectAct()});$('actNo').value=result.actNo||'';saveButton('saved');markCompleted(result.actNo||'');setStatus(result.message||'Ҳужжат сақланди.','ok');await loadReports();}
    catch(err){resetSaveButton();setStatus(err.message,'bad');}
    finally{state.saving=false;}
  }

  function showView(id,btn){if(id==='create'&&!hasPermission('documents:create'))return setStatus('Sizning workspace rolingiz hujjat yaratishga ruxsat bermaydi.','bad');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('.acts-top .tabs button').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');if(id==='reports')loadReports();}
  function showReport(id,btn){document.querySelectorAll('.report-view').forEach(v=>v.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('.subtabs button').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');}
  function openExcel(){const url=settings().spreadsheetUrl;if(!url){alert('Google Sheets ҳаволаси киритилмаган.');return;}window.open(url,'_blank','noopener,noreferrer');}
  function openSettings(){ setStatus('Google Sheets sozlamalari Workspace Settings boʻlimida boshqariladi.','sync'); }

  async function findReport(actNo){const no=unref(actNo);if(!state.dailyRows.length)await loadReports();return state.dailyRows.find(r=>String(r.actNo||'')===no);}
  function ensureA4Modal(){let modal=$('actsA4Modal');if(modal)return modal;modal=document.createElement('div');modal.id='actsA4Modal';modal.className='acts-a4-modal';modal.innerHTML='<div class="acts-a4-wrap"><div class="acts-a4-toolbar"><button onclick="window.print()">PDF / Print</button><button onclick="document.getElementById(\'actsA4Modal\').classList.remove(\'show\')">Yopish</button></div><div id="actsA4Content"></div></div>';document.body.appendChild(modal);return modal;}
  function reportToAct(report){return {actNo:report.actNo,date:report.date,workPlace:report.workPlace,failureText:report.failureText,impactText:report.impactText,reasonText:report.reasonText,actionText:report.actionText,conclusion:report.conclusion,person1:report.person1||'',position1:report.position1||'',department1:report.department1||'',person2:report.person2||'',position2:report.position2||'',department2:report.department2||'',person3:report.person3||'',position3:report.position3||'',department3:report.department3||''};}
  async function viewDoc(actNo){const report=await findReport(actNo);if(!report){alert('Ҳужжат топилмади. Excel очилади.');openExcel();return;}let act=null;try{act=JSON.parse(report.a4Json||'null');}catch(_){}const html=stripLegacyManualSignatureBlock(buildA4ActHtml(act||reportToAct(report)));ensureA4Modal();$('actsA4Content').innerHTML=html;$('actsA4Modal').classList.add('show');}
  async function sendDoc(actNo){ if(!hasPermission('documents:send'))return setStatus('Sizning workspace rolingiz hujjat yuborishga ruxsat bermaydi.','bad'); const no=unref(actNo); if(!confirm(`${no} ҳужжатини тайинланган тасдиқловчиларга Gmail орқали юборишни тасдиқлайсизми?`))return; try{setStatus(`${no} тасдиқловчиларга юборилмоқда...`,'sync');const result=await postJson('/api/document/send',{...settings(),actNo:no,sentBy:'KIP Administrator'});const sent=(result.results||[]).filter(x=>x.status==='sent').length;const failed=(result.results||[]).filter(x=>x.status==='email-failed').length;setStatus(`${no}: ${sent} та Gmail юборилди${failed?`, ${failed} та хатолик`:''}. Ҳолат: ${result.status}` ,failed?'sync':'ok');await loadReports();}catch(err){setStatus(err.message,'bad');} }

  function openSigners(){ if(!hasSettings()){setStatus('Аввал Google Sheets созламаларини киритинг.','bad');return;} $('signersModal').classList.add('show'); loadSigners(); }
  function closeSigners(){$('signersModal').classList.remove('show');}
  function signerRowHtml(signer, isNew=false){ const id=signer.id||`new_${Date.now()}_${Math.random().toString(16).slice(2)}`; const disabled=isNew?'':'disabled'; const fileInfo=signer.signatureUrl?`<a class="file-link" href="${esc(signer.signatureUrl)}" target="_blank" rel="noopener">Drive imzo</a>`:'PNG tanlanmagan'; return `<tr data-signer-id="${esc(id)}" data-new="${isNew?'1':'0'}" data-signature-url="${esc(signer.signatureUrl||'')}"><td><input data-field="position" value="${esc(signer.position||'')}" ${disabled}></td><td><input data-field="fio" value="${esc(signer.fio||'')}" ${disabled}></td><td><div data-file-info>${fileInfo}</div><input data-field="file" type="file" accept="image/png,.png" ${disabled}></td><td><input data-field="gmail" type="email" value="${esc(signer.gmail||'')}" placeholder="name@gmail.com" ${disabled}></td><td><div class="signer-actions"><button class="btn ghost small" title="Tahrirlash" onclick="ActsUI.editSigner('${esc(id)}')">✏️</button><button class="btn green small" title="Saqlash" onclick="ActsUI.saveSigner('${esc(id)}')" ${isNew?'':'disabled'}>💾</button><button class="btn red small" title="O‘chirish" onclick="ActsUI.deleteSigner('${esc(id)}')">🗑</button></div></td></tr>`; }
  function renderSigners(){const tb=$('signersRows');if(!state.signers.length){tb.innerHTML='<tr><td colspan="5">Имзо чекувчилар йўқ. “Қўшиш” тугмасини босинг.</td></tr>';return;}tb.innerHTML=state.signers.map(s=>signerRowHtml(s,false)).join('');}
  async function loadSigners(){try{setSignersMsg('Google Sheets дан юкланмоқда...','sync');const data=await apiFetch('/api/signers');state.signers=data.rows||[];renderSigners();setSignersMsg(`${state.signers.length} та имзо чекувчи юкланди.`,'ok');}catch(err){setSignersMsg(err.message,'bad');$('signersRows').innerHTML=`<tr><td colspan="5">${esc(err.message)}</td></tr>`;}}
  function addSignerRow(){const tb=$('signersRows');if(tb.querySelector('td[colspan]'))tb.innerHTML='';const id=`new_${Date.now()}`;tb.insertAdjacentHTML('beforeend',signerRowHtml({id},true));setSignersMsg('Янги сатр қўшилди. Майдонларни тўлдириб сақланг.','sync');}
  function rowBySignerId(id){return Array.from($('signersRows').querySelectorAll('tr')).find(tr=>tr.dataset.signerId===id);}
  function editSigner(id){const tr=rowBySignerId(id);if(!tr)return;tr.querySelectorAll('input').forEach(i=>i.disabled=false);const save=tr.querySelector('button[title="Saqlash"]');if(save)save.disabled=false;setSignersMsg('Таҳрирлаш режими ёқилди.','sync');}
  async function uploadSignerFile(file){ if(!file)return''; if(file.type!=='image/png'&&!file.name.toLowerCase().endsWith('.png'))throw new Error('Фақат PNG файл қабул қилинади'); if(file.size>2*1024*1024)throw new Error('PNG ҳажми 2 MB дан ошмаслиги керак'); const s=settings();const form=new FormData();form.append('signature',file);form.append('spreadsheetUrl',s.spreadsheetUrl);form.append('serviceAccount',JSON.stringify(s.serviceAccount)); const data=await apiFetch('/api/signature/upload',{method:'POST',body:form}); return data.webViewLink||data.fileId; }
  async function saveSigner(id){ const tr=rowBySignerId(id);if(!tr)return; const position=tr.querySelector('[data-field="position"]').value.trim();const fio=tr.querySelector('[data-field="fio"]').value.trim();const gmail=tr.querySelector('[data-field="gmail"]').value.trim();const file=tr.querySelector('[data-field="file"]').files[0]; if(!position||!fio||!gmail) return setSignersMsg('Лавозими, F.I.O ва Gmail тўлдирилиши шарт.','bad'); if(!/^[^\s@]+@gmail\.com$/i.test(gmail))return setSignersMsg('Фақат тўғри Gmail манзили қабул қилинади.','bad'); try{setSignersMsg('PNG юкланмоқда ва маълумот сақланмоқда...','sync');let signatureUrl=tr.dataset.signatureUrl||'';if(file)signatureUrl=await uploadSignerFile(file);if(!signatureUrl)throw new Error('PNG имзо танланмаган');const payload={position,fio,gmail,signatureUrl,...settings()};if(tr.dataset.new==='1'){await postJson('/api/signers',payload);}else{await apiFetch(`/api/signers/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}await loadSigners();setSignersMsg('Имзо чекувчи сақланди.','ok');}catch(err){setSignersMsg(err.message,'bad');} }
  async function deleteSigner(id){ const tr=rowBySignerId(id);if(!tr)return;if(tr.dataset.new==='1'){tr.remove();return setSignersMsg('Янги сатр бекор қилинди.','sync');}if(!confirm('Ушбу имзо чекувчини ўчиришни тасдиқлайсизми?'))return; try{setSignersMsg('Ўчирилмоқда...','sync');await apiFetch(`/api/signers/${encodeURIComponent(id)}`,{method:'DELETE'});await loadSigners();setSignersMsg('Имзо чекувчи ўчирилди.','ok');}catch(err){setSignersMsg(err.message,'bad');} }

  function clearLegacyDonutOverrides(){const legacy=document.getElementById('actsDonutPositionOverride');if(legacy)legacy.remove();}
  async function bind(){
    injectStyles();
    clearLegacyDonutOverrides();
    if(workspaceMode()){
      try{await loadWorkspaceContext();}
      catch(err){setStatus(err.message,'bad');applyWorkspacePermissions();return;}
    }else{
      applyWorkspacePermissions();
    }
    loadWorkspaceApproverRegistry().then((rows)=>{
      if(!rows?.length) return;
      let list = $('actsApproverList');
      if(!list){ list = document.createElement('datalist'); list.id = 'actsApproverList'; document.body.appendChild(list); }
      list.innerHTML = rows.map((row)=>`<option value="${esc(row.fio)}">${esc(row.position || row.gmail || '')}</option>`).join('');
      ['person1','person2','person3'].forEach((id)=>{ const input=$(id); if(input) input.setAttribute('list','actsApproverList'); });
    }).catch(()=>{});

    ['failureText','impactText','reasonText','actionText','conclusion'].forEach(id=>$(id)?.addEventListener('input',validateDoc));
    window.addEventListener('message',(event)=>{if(event.data?.type==='SEG_KIP_WORKSPACE_CHANGE')void handleWorkspaceChange();});
    if(!hasSettings()){
      if(workspaceMode())setStatus('Workspace Google Sheets sozlamalari toʻliq emas. Workspace administratoriga murojaat qiling.','bad');
      if(workspaceMode())setStatus('Workspace Google Sheets sozlamalari toʻliq emas. Workspace administratoriga murojaat qiling.','bad');
    }else loadAnalysis();
  }

  window.ActsUI={showView,showReport,openSettings,loadAnalysis,fillDoc,saveAct,openExcel,setStatus,viewDoc,sendDoc,openSigners,closeSigners,loadSigners,addSignerRow,editSigner,saveSigner,deleteSigner};
  document.addEventListener('DOMContentLoaded',bind);
})();
