(function(){
  const KEYS = { url:'acts_sheet_url', sheet:'acts_sheet_name', service:'acts_service_account' };
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const state = { analysisRows: [], dailyRows: [], signers: [], selected: null, saving: false, workspaceApprovers: null, signatureObjectUrls: [], draftSignatureUrls: {} };
  let activeWorkspaceId = '';
  let workspaceLoadVersion = 0;
  const PDF_MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function ref(v){ return encodeURIComponent(String(v || '')); }
  function unref(v){ try { return decodeURIComponent(String(v || '')); } catch(_) { return String(v || ''); } }
  function clean(v){ return String(v ?? '').trim(); }
  function pget(store,key){ try { return parent?.[store]?.getItem(key) || ''; } catch(_) { return ''; } }

  function settings(){
    return { sheetName: localStorage.getItem(KEYS.sheet) || '' };
  }
  function hasSettings(){ const s=settings(); return Boolean(s.sheetName); }
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
    return '';
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

  function staleWorkspaceError(expectedWorkspaceId){
    const error = new Error('Workspace алмашди. Эски сўров натижаси бекор қилинди.');
    error.code = 'STALE_WORKSPACE_RESPONSE';
    error.expectedWorkspaceId = expectedWorkspaceId;
    return error;
  }

  async function apiFetch(url, options={}, retry=true, expectedWorkspaceId=workspaceId()){
    const headers = new Headers(options.headers || {});
    const wid = String(expectedWorkspaceId || workspaceId() || '').trim();
    if(wid) headers.set('x-workspace-id', wid);
    const globalToken = workspaceToken();
    if(globalToken) headers.set('Authorization', `Bearer ${globalToken}`);
    else if(adminToken()) headers.set('Authorization',`Bearer ${adminToken()}`);
    const res = await fetch(url,{...options,headers});
    const data = await res.json().catch(()=>({}));
    if(wid && wid !== workspaceId()) throw staleWorkspaceError(wid);
    if(res.status===401 && data.code==='ADMIN_AUTH_REQUIRED' && retry){
      await loginAdmin();
      if(wid && wid !== workspaceId()) throw staleWorkspaceError(wid);
      return apiFetch(url,options,false,wid);
    }
    if(!res.ok || data.error) throw new Error(data.error || 'API хатоси');
    return data;
  }
  async function postJson(url, body, expectedWorkspaceId=workspaceId()){
    return apiFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},true,expectedWorkspaceId);
  }
  async function workspaceFetch(path, expectedWorkspaceId=workspaceId()){
    const id = String(expectedWorkspaceId || workspaceId() || '').trim();
    const token = workspaceToken();
    if(!id || !token) return null;
    const headers = new Headers({ Authorization:`Bearer ${token}` });
    const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}${path}`, { headers, credentials:'include' });
    if(id !== workspaceId()) throw staleWorkspaceError(id);
    if(!res.ok) return null;
    return res.json().catch(()=>null);
  }
  async function workspaceApi(path, options={}, expectedWorkspaceId=workspaceId()){
    const id = String(expectedWorkspaceId || workspaceId() || '').trim();
    const token = workspaceToken();
    if(!id || !token) throw new Error('Workspace token mavjud emas');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}${path}`, { ...options, headers, credentials:'include' });
    if(id !== workspaceId()) throw staleWorkspaceError(id);
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.error) throw new Error(data.error || 'Workspace API xatosi');
    return data;
  }
  function normalizeSignerText(value){ return String(value || '').toLowerCase().replace(/\s+/g,' ').trim(); }
  function isKipMasterSigner(row={}){
    const text = normalizeSignerText(`${row.position || ''} ${row.fio || ''} ${row.fullName || ''} ${row.email || row.gmail || ''}`);
    if ((text.includes('кип') && text.includes('мастер')) || (text.includes('kip') && text.includes('master'))) return true;
    if ((text.includes('кип') && text.includes('инженер')) || (text.includes('kip') && text.includes('engineer'))) return true;
    return false;
  }
  function activeSignerRows(rows=[]){ return rows.filter((row)=>!row.status || normalizeSignerText(row.status)==='active'); }
  function findKipMasterSigner(rows=[]){
    const activeRows = activeSignerRows(rows);
    return activeRows.find(isKipMasterSigner) || activeRows.find((row)=>{
      const text = normalizeSignerText(`${row.position || ''} ${row.fio || ''} ${row.fullName || ''}`);
      return text.includes('кип') || text.includes('kip');
    });
  }
  function applyKipMasterSignerFromApprovers(rows=[]){
    const kipMaster = findKipMasterSigner(rows);
    if(!kipMaster) return;
    const person1 = $('person1');
    const position1 = $('position1');
    const department1 = $('department1');
    if(person1 && !person1.value.trim()) person1.value = kipMaster.fio || kipMaster.fullName || '';
    if(position1 && !position1.value.trim()) position1.value = kipMaster.position || '';
    if(department1 && !department1.value.trim()) department1.value = kipMaster.department || '';
  }

  async function loadWorkspaceApproverRegistry(force=false, expectedWorkspaceId=workspaceId()){
    if(!force && Array.isArray(state.workspaceApprovers) && state.workspaceApprovers.length) return state.workspaceApprovers;
    const data = await workspaceFetch('/signers?includeInactive=true', expectedWorkspaceId);
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    state.workspaceApprovers = rows.map((row)=>{
      const signatureFileId = clean(row.signatureFileId);
      const internalSignatureId = signatureFileId.match(/^db:([0-9a-f-]{36})$/i)?.[1] || '';
      return {
        signerId: clean(row.id),
        fio: clean(row.fullName || row.fio),
        position: clean(row.position),
        gmail: clean(row.email || row.gmail),
        signatureUrl: internalSignatureId ? `/api/workspaces/${encodeURIComponent(expectedWorkspaceId)}/signers/signature/${encodeURIComponent(internalSignatureId)}` : clean(row.signatureUrl),
        signatureFileId,
        status: clean(row.status || 'active').toLowerCase()
      };
    }).filter((row)=>row.signerId || row.fio || row.gmail);
    applyKipMasterSignerFromApprovers(state.workspaceApprovers);
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
.a4-preview .act-signers-value{min-height:22px;padding:0 4px 1px;border-bottom:1px solid #111;text-align:center;display:flex;align-items:flex-end;justify-content:center;word-break:break-word;position:relative}
.a4-preview .act-signers-label{font-size:12px;line-height:1.15;font-style:italic;margin-top:2px}
.a4-preview .act-signers-value.has-signature{min-height:62px}
.a4-preview .act-signer-text{position:relative;z-index:1}
.a4-preview .act-signature-box{position:absolute;left:50%;bottom:-1px;transform:translateX(-50%);width:140px;height:58px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;box-sizing:border-box;z-index:2;pointer-events:none}
.a4-preview .act-signature-box img{display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom}
.a4-preview .act-section{margin-top:12px}
.a4-preview .act-section-title{font-size:16px;font-weight:700;margin-bottom:6px}
.a4-preview .act-section-value{min-height:20px;padding:0 2px 4px;border-bottom:1px solid #111;white-space:pre-wrap;word-break:break-word}
.a4-preview .act-section-value.tall{min-height:60px}
.a4-preview .act-section-value.xl{min-height:88px}
.a4-preview .act-date-inline{display:flex;justify-content:flex-end;align-items:flex-end;gap:10px;font-size:13px;font-weight:700;margin-top:4px}
.a4-preview .act-date-inline .line{display:inline-flex;align-items:flex-end;justify-content:center;min-width:132px;padding:0 4px 1px;border-bottom:1px solid #111;font-weight:400}
.a4-preview .act-conclusion{margin-top:12px}
.a4-preview .act-final-signatures{margin-top:18px;break-inside:avoid;page-break-inside:avoid}
.a4-preview .act-final-signatures-title{font-size:16px;font-weight:700;margin-bottom:8px}
.a4-preview .act-final-signatures-grid{display:grid;gap:12px}
.a4-preview .act-final-signature-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:end}
.a4-preview .act-final-signature-cell{text-align:center;min-width:0}
.a4-preview .act-final-signature-value{position:relative;min-height:58px;padding:0 4px 2px;border-bottom:1px solid #111;display:flex;align-items:flex-end;justify-content:center;box-sizing:border-box;word-break:break-word}
.a4-preview .act-final-signature-label{font-size:12px;line-height:1.15;margin-top:2px}
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
    const protectedBlocks=[];
    source=source.replace(/<!--SEG_FINAL_SIGNATURES_START-->[\s\S]*?<!--SEG_FINAL_SIGNATURES_END-->/g,(block)=>{
      const token=`<!--SEG_PROTECTED_FINAL_SIGNATURES_${protectedBlocks.length}-->`;
      protectedBlocks.push(block);
      return token;
    });
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
        .replace(/<(p|div|span|section)(?![^>]*class="[^"]*act-signers)([^>]*)>\s*(?:<br\s*\/?>\s*)*<\/\1>/giu,'')
        .replace(/(<br\s*\/?>\s*){3,}/giu,'<br><br>')
        .replace(/\n{3,}/g,'\n\n');
    }
    protectedBlocks.forEach((block,index)=>{source=source.replace(`<!--SEG_PROTECTED_FINAL_SIGNATURES_${index}-->`,block);});
    return source;
  }

  function setDonut(pct){ const v=Math.max(0,Math.min(100,Number(pct)||0)); const d=$('completionDonut'); if(d){d.style.setProperty('--p',v); const s=d.querySelector('span'); if(s)s.textContent=`${v}%`;}}
  function updateKpi(data){ $('kpiTotal').textContent=data.totalRows??0; $('kpiPlanned').textContent=data.plannedDocuments??0; $('kpiCreated').textContent=data.createdDocuments??0; $('kpiSheet').textContent=data.sheetName||settings().sheetName||'—'; setDonut(data.completionPercentage||0); }
  function formatWorkPlace(row){ return `${row.deviceName||''} ${row.typeMark||''}, завод рақами ${row.serialNo||''}, ўлчаш чегараси ${row.measureRange||''}, ${row.place||''}, поз. №${row.positionNo||''}`.replace(/ +,/g,',').trim(); }
  function today(){ const d=new Date(); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; }

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
    tb.innerHTML=rows.map((r,i)=>{const action=r.isCompleted?`<button class="btn done" onclick="ActsUI.viewDoc('${ref(r.actNo)}')">Хужат якунланди</button>`:`<button class="btn green workspace-operator-only" onclick="ActsUI.fillDoc(${i})">Хужат яратиш</button>`;return `<tr data-source-key="${esc(r.sourceKey||'')}"><td>${i+1}</td><td>${esc(r.date)}</td><td>${esc(r.positionNo)}</td><td>${esc(r.deviceName)}</td><td>${esc(r.typeMark)}</td><td>${esc(r.serialNo)}</td><td>${esc(r.measureRange)}</td><td>${esc(r.place)}</td><td class="icol">${esc(r.workType)}</td><td>${esc(r.executor)}</td><td>${action}</td></tr>`;}).join('');
  }
  async function loadAnalysis(expectedWorkspaceId=workspaceId()){
    if(!hasSettings()){openSettings();setStatus('Google Sheets созламалари киритилмаган.','bad');return;}
    try{setStatus('Google Sheets билан синхронланмоқда...','sync');parentOnline('SYNCING');const data=await postJson('/api/acts/monthly-analysis',settings(),expectedWorkspaceId);if(expectedWorkspaceId&&expectedWorkspaceId!==workspaceId())return false;state.analysisRows=data.rows||[];updateKpi(data);renderRows(state.analysisRows);setStatus('Google Sheets уланди. Маълумотлар янгиланди.','ok');parentOnline('ONLINE');return data;}
    catch(err){if(err.code==='STALE_WORKSPACE_RESPONSE')return false;setStatus(err.message,'bad');parentOnline('OFFLINE');return false;}
  }
  async function loadReports(expectedWorkspaceId=workspaceId()){
    const tb=$('dailyRows');
    if(!hasSettings()){tb.innerHTML='<tr><td colspan="9">Google Sheets созламалари киритилмаган.</td></tr>';return[];}
    try{const data=await postJson('/api/acts/reports/daily',settings(),expectedWorkspaceId);if(expectedWorkspaceId&&expectedWorkspaceId!==workspaceId())return[];const rows=data.rows||[];state.dailyRows=rows;if(!rows.length){tb.innerHTML='<tr><td colspan="9">Кунлик ҳисоботда ҳужжатлар йўқ.</td></tr>';return rows;}tb.innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.actNo)}</td><td>${esc(r.date)}</td><td>${esc(r.device)}</td><td>${esc(r.serial)}</td><td>${esc(r.place)}</td><td>${esc(r.executor)}</td><td>${esc(r.status)}</td><td><button class="btn primary small" onclick="ActsUI.viewDoc('${ref(r.actNo)}')">Кўриш</button> <button class="btn orange small" onclick="ActsUI.sendDoc('${ref(r.actNo)}')">Хужатни юбориш</button></td></tr>`).join('');return rows;}
    catch(err){if(err.code==='STALE_WORKSPACE_RESPONSE')return[];tb.innerHTML=`<tr><td colspan="9">${esc(err.message)}</td></tr>`;return[];}
  }

  function resetSaveButton(){const b=$('saveActBtn');if(!b)return;b.classList.remove('saving','saved');b.textContent='Сақлаш';}
  function saveButton(mode){const b=$('saveActBtn');if(!b)return;b.classList.remove('saving','saved');if(mode==='saving'){b.classList.add('saving');b.textContent='⏳ Сақланмоқда...';b.disabled=true;return;}if(mode==='saved'){b.classList.add('saved');b.textContent='Сақланди ✓';b.disabled=true;return;}resetSaveButton();}
  async function fillDoc(index){const row=state.analysisRows[index];if(!row)return;if(row.isCompleted){viewDoc(ref(row.actNo));return;}state.selected=row;$('workPlace').value=formatWorkPlace(row);$('actDate').value=row.date||today();$('actTime').value=row.time||'';$('actionDate').value=row.actionDate||'';$('actionTime').value=row.actionTime||'';$('actNo').value='';$('failureText').value=row.failureText||'';$('impactText').value=row.impactText||'';$('reasonText').value=row.reasonText||'';$('actionText').value=row.actionText||'';$('conclusion').value=row.conclusion||'';resetSaveButton();showView('create',$('tab-create'));validateDoc();renderDraftFinalSignatures();await loadWorkspaceApproverRegistry().catch(()=>[]);await refreshDraftSignatureImages();}
  function findSignerForPerson(personName){
    const name = normalizeSignerText(personName);
    if(!name) return null;
    const rows = activeSignerRows(Array.isArray(state.workspaceApprovers) ? state.workspaceApprovers : []);
    const direct = rows.find((row)=>normalizeSignerText(row.fio || row.fullName) === name);
    if(direct) return direct;
    return rows.find((row)=>{
      const rowName = normalizeSignerText(row.fio || row.fullName);
      return rowName.length >= 4 && (rowName.includes(name) || name.includes(rowName));
    }) || null;
  }
  function findSignatureForPerson(personName){
    return clean(findSignerForPerson(personName)?.signatureUrl);
  }
  function isApprovedStatus(value){
    const status=normalizeSignerText(value);
    return status==='тасдиқланди'||status==='approved';
  }
  function approvalForSignerSlot(act,slot,signer=null){
    const approvals=Array.isArray(act?.approvals)?act.approvals:[];
    const assigned=Array.isArray(act?.assignedApprovers)
      ?act.assignedApprovers.find((row,index)=>(Number(row?.slot)||index+1)===slot)
      :null;
    const signerId=clean(signer?.signerId||assigned?.signerId);
    const gmail=normalizeSignerText(signer?.gmail||assigned?.gmail||assigned?.email);
    const fio=normalizeSignerText(signer?.fio||signer?.fullName||assigned?.fio||assigned?.fullName||act?.[`person${slot}`]);
    return approvals.find((approval)=>Number(approval?.slot)===slot)
      ||approvals.find((approval)=>signerId&&clean(approval?.signerId)===signerId)
      ||approvals.find((approval)=>gmail&&normalizeSignerText(approval?.gmail||approval?.email)===gmail)
      ||approvals.find((approval)=>fio&&normalizeSignerText(approval?.fio||approval?.fullName)===fio)
      ||null;
  }
  function canRenderSignerSlotSignature(act,slot,signer=null){
    const kipMasterSlot=slot===1&&isKipMasterSigner(signer||{fio:act?.person1,position:act?.position1});
    if(kipMasterSlot)return true;
    if(slot!==2&&slot!==3)return false;
    return isApprovedStatus(approvalForSignerSlot(act,slot,signer)?.status);
  }
  function safeSignatureUrl(value){
    const url = clean(value);
    if(/^blob:/i.test(url) || /^data:image\/png(?:;base64)?,/i.test(url) || /^https?:\/\//i.test(url) || /^\/api\/workspaces\//i.test(url)) return url;
    return '';
  }
  function signerSignatureHtml(value){
    const url = safeSignatureUrl(value);
    return url ? `<span class="act-signature-box"><img src="${esc(url)}" alt="Имзо" /></span>` : '';
  }
  function revokeSignatureObjectUrls(){
    const urls = Array.isArray(state.signatureObjectUrls) ? state.signatureObjectUrls.splice(0) : [];
    urls.forEach((url)=>{ try { URL.revokeObjectURL(url); } catch(_) {} });
  }
  async function trimSignaturePngWhitespace(blob){
    if(typeof createImageBitmap!=='function' || typeof OffscreenCanvas!=='function') return blob;
    let bitmap=null;
    try{
      bitmap=await createImageBitmap(blob);
      if(!bitmap.width || !bitmap.height || bitmap.width>4096 || bitmap.height>4096) return blob;
      const sourceCanvas=new OffscreenCanvas(bitmap.width,bitmap.height);
      const sourceContext=sourceCanvas.getContext('2d',{willReadFrequently:true});
      if(!sourceContext) return blob;
      sourceContext.drawImage(bitmap,0,0);
      const pixels=sourceContext.getImageData(0,0,bitmap.width,bitmap.height).data;
      let minX=bitmap.width,minY=bitmap.height,maxX=-1,maxY=-1;
      for(let y=0;y<bitmap.height;y+=1){
        for(let x=0;x<bitmap.width;x+=1){
          const index=(y*bitmap.width+x)*4;
          const alpha=pixels[index+3];
          const nearWhite=pixels[index]>248&&pixels[index+1]>248&&pixels[index+2]>248;
          if(alpha<=8||nearWhite) continue;
          if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
        }
      }
      if(maxX<minX||maxY<minY) return blob;
      const padding=2;
      minX=Math.max(0,minX-padding);minY=Math.max(0,minY-padding);
      maxX=Math.min(bitmap.width-1,maxX+padding);maxY=Math.min(bitmap.height-1,maxY+padding);
      const width=maxX-minX+1,height=maxY-minY+1;
      if(width===bitmap.width&&height===bitmap.height) return blob;
      const outputCanvas=new OffscreenCanvas(width,height);
      const outputContext=outputCanvas.getContext('2d');
      if(!outputContext) return blob;
      outputContext.drawImage(bitmap,minX,minY,width,height,0,0,width,height);
      return await outputCanvas.convertToBlob({type:'image/png'});
    }catch(_){return blob;}
    finally{try{bitmap?.close();}catch(_){}}
  }
  async function loadSignatureDisplayUrl(value, expectedWorkspaceId=workspaceId()){
    const url = safeSignatureUrl(value);
    if(!url || !/^\/api\/workspaces\//i.test(url)) return url;
    const token = workspaceToken();
    if(!token) return '';
    const response = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }, credentials:'include' });
    if(expectedWorkspaceId && expectedWorkspaceId !== workspaceId()) throw staleWorkspaceError(expectedWorkspaceId);
    if(!response.ok) return '';
    const blob = await response.blob();
    if(blob.type && !blob.type.toLowerCase().startsWith('image/')) return '';
    const displayBlob = await trimSignaturePngWhitespace(blob);
    const objectUrl = URL.createObjectURL(displayBlob);
    state.signatureObjectUrls.push(objectUrl);
    return objectUrl;
  }
  async function hydrateActSignatureUrls(source, expectedWorkspaceId=workspaceId()){
    const act = { ...(source || {}) };
    const kipMaster = findKipMasterSigner(Array.isArray(state.workspaceApprovers) ? state.workspaceApprovers : []);
    if(kipMaster && !clean(act.person1)){
      act.person1 = clean(kipMaster.fio || kipMaster.fullName);
      act.position1 = clean(act.position1 || kipMaster.position);
      act.department1 = clean(act.department1 || kipMaster.department);
    }
    await Promise.all([1,2,3].map(async (slot)=>{
      const signer=findSignerForPerson(act[`person${slot}`]);
      const allowed=canRenderSignerSlotSignature(act,slot,signer);
      const currentSignerUrl=allowed?clean(signer?.signatureUrl):'';
      const sourceUrl=allowed?(currentSignerUrl||clean(act[`signatureUrl${slot}`])):'';
      try { act[`signatureUrl${slot}`] = await loadSignatureDisplayUrl(sourceUrl, expectedWorkspaceId); }
      catch(error){ if(error.code==='STALE_WORKSPACE_RESPONSE') throw error; act[`signatureUrl${slot}`] = ''; }
    }));
    return act;
  }
  function collectActBase(){const r=state.selected||{};const base={actNo:$('actNo').value.trim(),date:$('actDate').value.trim(),time:$('actTime').value.trim(),workPlace:$('workPlace').value.trim(),deviceName:r.deviceName||'',serialNo:r.serialNo||'',place:r.place||'',executor:r.executor||'',person1:$('person1').value.trim(),position1:$('position1').value.trim(),department1:$('department1').value.trim(),person2:$('person2').value.trim(),position2:$('position2').value.trim(),department2:$('department2').value.trim(),person3:$('person3').value.trim(),position3:$('position3').value.trim(),department3:$('department3').value.trim(),sourceSheet:r.sourceSheet||'',sourceRowNumber:r.sourceRowNumber||'',sourceKey:r.sourceKey||'',failureText:$('failureText').value.trim(),impactText:$('impactText').value.trim(),reasonText:$('reasonText').value.trim(),actionText:$('actionText').value.trim(),actionDate:$('actionDate').value.trim(),actionTime:$('actionTime').value.trim(),conclusion:$('conclusion').value.trim()};
    const firstSigner=findSignerForPerson(base.person1);
    return Object.assign(base, {
      signatureUrl1: clean(firstSigner&&isKipMasterSigner(firstSigner)?firstSigner.signatureUrl:''),
      signatureUrl2: '',
      signatureUrl3: '',
    });
  }
  function collectAssignedApproverSlots(base){
    return [1,2,3].map((slot)=>{const signer=findSignerForPerson(base[`person${slot}`]);return{slot,signerId:clean(signer?.signerId),fio:clean(base[`person${slot}`]),position:clean(base[`position${slot}`]||signer?.position),gmail:clean(signer?.gmail),department:clean(base[`department${slot}`]),signatureFileId:clean(signer?.signatureFileId)};}).filter((row)=>row.signerId||row.fio||row.position||row.department||row.gmail);
  }
  function signerCell(value,label,signatureUrl='',signatureSlot=0){const signature=signerSignatureHtml(signatureUrl);const slotContent=signatureSlot?`<!--SEG_SIGNATURE_SLOT_${signatureSlot}_START-->${signature}<!--SEG_SIGNATURE_SLOT_${signatureSlot}_END-->`:signature;return `<div class="act-signers-cell"${signatureSlot?` data-signature-slot="${signatureSlot}"`:''}><div class="act-signers-value${signature?' has-signature':''}"><span class="act-signer-text">${esc(value || '')}</span>${slotContent}</div><div class="act-signers-label">${label}</div></div>`;}
  function buildSignerRows(a){
    return [1,2,3].map((slot)=>`<div class="act-signers-row" data-signer-slot="${slot}">${signerCell(a[`person${slot}`],'Ф.И.Ш')}${signerCell(a[`position${slot}`],'лавозим')}${signerCell(a[`department${slot}`],'цех ва и/ж.',a[`signatureUrl${slot}`],slot)}</div>`).join('');
  }
  function finalSignatureCell(value,label,signatureUrl='',signatureSlot=0){const signature=signerSignatureHtml(signatureUrl);const slotContent=signatureSlot?`<!--SEG_SIGNATURE_SLOT_${signatureSlot}_START-->${signature}<!--SEG_SIGNATURE_SLOT_${signatureSlot}_END-->`:signature;return `<div class="act-final-signature-cell"><div class="act-final-signature-value"><span class="act-signer-text">${esc(value || '')}</span>${slotContent}</div><div class="act-final-signature-label">${label}</div></div>`;}
  function buildFinalSignatureRows(a){return [1,2,3].map((slot)=>`<div class="act-final-signature-row" data-final-signer-slot="${slot}">${finalSignatureCell(a[`position${slot}`],'Лавозими')}${finalSignatureCell('', 'Имзо',a[`signatureUrl${slot}`],slot)}${finalSignatureCell(a[`person${slot}`],'Ф.И.Ш.')}</div>`).join('');}
  function buildFinalSignatures(a){return `<!--SEG_FINAL_SIGNATURES_START--><div class="act-final-signatures"><div class="act-final-signatures-title">Имзолар:</div><div class="act-final-signatures-grid">${buildFinalSignatureRows(a)}</div></div><!--SEG_FINAL_SIGNATURES_END-->`;}
  function draftSignatureCell(value,label,signatureUrl=''){return `<div class="draft-final-signature-cell"><div class="draft-final-signature-value"><span>${esc(value||'')}</span>${signerSignatureHtml(signatureUrl)}</div><div class="draft-final-signature-label">${label}</div></div>`;}
  function renderDraftFinalSignatures(){const host=$('draftFinalSignatures');if(!host)return;const a=collectActBase();host.innerHTML=`<div class="draft-final-signatures"><div class="draft-final-signatures-title">Имзолар:</div>${[1,2,3].map((slot)=>`<div class="draft-final-signature-row">${draftSignatureCell(a[`position${slot}`],'Лавозими')}${draftSignatureCell('','Имзо',state.draftSignatureUrls[slot]||'')}${draftSignatureCell(a[`person${slot}`],'Ф.И.Ш.')}</div>`).join('')}</div>`;}
  async function refreshDraftSignatureImages(){const expectedWorkspaceId=workspaceId();const hydrated=await hydrateActSignatureUrls(collectActBase(),expectedWorkspaceId);state.draftSignatureUrls={1:hydrated.signatureUrl1||'',2:hydrated.signatureUrl2||'',3:hydrated.signatureUrl3||''};renderDraftFinalSignatures();}
  function sectionHtml(title, value, extra='', valueClass=''){ return `<div class="act-section"><div class="act-section-title">${title}</div><div class="act-section-value ${valueClass}">${esc(value || '').replace(/\n/g,'<br>')}</div>${extra}</div>`; }
  function buildA4ActHtml(a){
    const dateParts = parsePdfDate(a.date);
    const signerBlock = `<div class="act-signers-title">Биз имзо чекувчилар:</div><div class="act-signers">${buildSignerRows(a)}</div>`;
    const failureDate = [a.date, a.time].filter(Boolean).join(' ');
    const actionDate = [a.actionDate, a.actionTime].filter(Boolean).join(' ');
    return `<div class="a4-preview"><div class="act-meta"><div class="act-date-head">&quot;<span class="line">${esc(dateParts.day)}</span>&quot; <span class="month">${esc(dateParts.month)}</span> <span class="year">${esc(dateParts.year)}</span> г.</div><div class="right">Низомга илова №4<br>“SANEG” МЧЖ К/К объектларида<br>назорат ўлчов воситалари ва автоматлаштириш тизимларига<br>техник хизмат кўрсатиш бўйича<br>ТПП «Андижан»</div></div><div class="act-head"><div class="act-title"><span>ДАЛОЛАТНОМА №</span><span class="act-no-line">${esc(a.actNo||'')}</span></div><div class="act-subtitle">Ўлчов воситасининг бузилиши</div></div>${signerBlock}${sectionHtml('1. Ў.В. Ишлаш жойи', a.workPlace)}${sectionHtml('2. Рад этиш мазмуни, санаси, вақти:', a.failureText, `<div class="act-date-inline"><span>Сана:</span><span class="line">${esc(failureDate || a.date || '')}</span></div>`)}${sectionHtml('3. Носозликнинг технологик оқибатлари:', a.impactText, '', 'tall')}${sectionHtml('4. Рад этиш сабаби:', a.reasonText, '', 'tall')}${sectionHtml('5. Носозликни бартараф этиш бўйича оператив ҳаракатлар ва бартараф этиш вақти:', a.actionText, `<div class="act-date-inline"><span>Сана:</span><span class="line">${esc(actionDate || a.actionDate || '')}</span></div>`, 'xl')}<div class="act-conclusion">${sectionHtml('Хулоса:', a.conclusion, '', 'xl')}</div>${buildFinalSignatures(a)}</div>`;
  }
  function collectAct(){ const base=collectActBase(); const payload={...base, assignedApprovers: collectAssignedApproverSlots(base)}; return {...payload,a4Html:stripLegacyManualSignatureBlock(buildA4ActHtml(payload)),a4Json:JSON.stringify(payload)}; }
  function validateDoc(){const a=collectActBase();const required=['date','time','workPlace','failureText','impactText','reasonText','actionText','actionDate','actionTime','conclusion'];const done=required.filter(k=>a[k]).length;const pct=Math.round(done/required.length*100);$('fillBar').style.width=pct+'%';$('fillText').textContent=`Тўлдирилиш: ${pct}%`;const b=$('saveActBtn');if(b&&!state.saving&&!b.classList.contains('saved'))b.disabled=pct<100||!state.selected;return pct>=100;}
  function markCompleted(actNo){const key=state.selected?.sourceKey;if(!key)return;state.analysisRows=state.analysisRows.map(r=>r.sourceKey===key?{...r,isCompleted:true,actNo,status:'Хужат якунланди'}:r);renderRows(state.analysisRows);}
  async function saveAct(){
    if(state.saving)return;
    if(!validateDoc()){setStatus('Мажбурий майдонларни тўлдиринг.','bad');return;}
    state.saving=true;saveButton('saving');
    try{await loadWorkspaceApproverRegistry().catch(()=>[]);setStatus('Ҳужжат Google Sheets га сақланмоқда...','sync');const result=await postJson('/api/acts/create',{...settings(),act:collectAct()});$('actNo').value=result.actNo||'';saveButton('saved');markCompleted(result.actNo||'');setStatus(result.message||'Ҳужжат сақланди.','ok');await loadReports();}
    catch(err){resetSaveButton();setStatus(err.message,'bad');}
    finally{state.saving=false;}
  }

  function showView(id,btn){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('.acts-top .tabs button').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');if(id==='reports')loadReports();}
  function showReport(id,btn){document.querySelectorAll('.report-view').forEach(v=>v.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('.subtabs button').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');}
  function openExcel(){const url=settings().spreadsheetUrl;if(!url){alert('Google Sheets ҳаволаси киритилмаган.');return;}window.open(url,'_blank','noopener,noreferrer');}
  function openSettings(){const s=settings();$('sheetName').value=s.sheetName||'';$('settingsModal').classList.add('show');}
  function closeSettings(){$('settingsModal').classList.remove('show');}
  async function saveSettings(){
    const sheetName=$('sheetName').value.trim();
    if(!sheetName){$('settingsMsg').innerHTML='<span class="bad">ASOSIY VAROQ киритилиши шарт.</span>';return;}
    try{
      $('settingsMsg').innerHTML='<span class="sync">Уланиш текширилмоқда...</span>';
      await postJson('/api/acts/settings/test',{sheetName});
      localStorage.setItem(KEYS.sheet, sheetName);
      
      // Also save to Workspace so it persists after page refresh
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'SAVE_MODULE_SETTINGS', settings: { acts_sheet_name: sheetName } }, '*');
        $('settingsMsg').innerHTML='<span class="sync">Workspace га сақланмоқда...</span>';
        // Wait for confirmation from parent
        await new Promise((resolve) => {
          const onMsg = (e) => { if (e.data && e.data.type === 'MODULE_SETTINGS_SAVED') { window.removeEventListener('message', onMsg); resolve(); } };
          window.addEventListener('message', onMsg);
          setTimeout(resolve, 3000); // fallback timeout
        });
      }
      
      closeSettings();
      setStatus('Созламалар сақланди.','ok');
      await loadAnalysis();
    }catch(err){$('settingsMsg').innerHTML=`<span class="bad">${esc(err.message)}</span>`;}
  }

  async function findReport(actNo){const no=unref(actNo);if(!state.dailyRows.length)await loadReports();return state.dailyRows.find(r=>String(r.actNo||'')===no);}
  function ensureA4Modal(){let modal=$('actsA4Modal');if(modal)return modal;modal=document.createElement('div');modal.id='actsA4Modal';modal.className='acts-a4-modal';modal.innerHTML='<div class="acts-a4-wrap"><div class="acts-a4-toolbar"><button onclick="window.print()">PDF / Print</button><button onclick="ActsUI.closeA4Modal()">Yopish</button></div><div id="actsA4Content"></div></div>';document.body.appendChild(modal);return modal;}
  function closeA4Modal(){$('actsA4Modal')?.classList.remove('show');revokeSignatureObjectUrls();}
  function reportToAct(report){const base={actNo:report.actNo,date:report.date,workPlace:report.workPlace,failureText:report.failureText,impactText:report.impactText,reasonText:report.reasonText,actionText:report.actionText,conclusion:report.conclusion,person1:report.person1||'',position1:report.position1||'',department1:report.department1||'',person2:report.person2||'',position2:report.position2||'',department2:report.department2||'',person3:report.person3||'',position3:report.position3||'',department3:report.department3||''};return Object.assign(base,{signatureUrl1:clean(report.signatureUrl1||findSignatureForPerson(base.person1)||''),signatureUrl2:clean(report.signatureUrl2||findSignatureForPerson(base.person2)||''),signatureUrl3:clean(report.signatureUrl3||findSignatureForPerson(base.person3)||'')});}
  async function viewDoc(actNo){const report=await findReport(actNo);if(!report){alert('Ҳужжат топилмади. Excel очилади.');openExcel();return;}const expectedWorkspaceId=workspaceId();await loadWorkspaceApproverRegistry().catch(() => []);let act=null;try{act=JSON.parse(report.a4Json||'null');}catch(_){}revokeSignatureObjectUrls();const printableAct=await hydrateActSignatureUrls(act||reportToAct(report),expectedWorkspaceId);const html=stripLegacyManualSignatureBlock(buildA4ActHtml(printableAct));ensureA4Modal();$('actsA4Content').innerHTML=html;$('actsA4Modal').classList.add('show');}
  async function sendDoc(actNo){ const no=unref(actNo); if(!confirm(`${no} ҳужжатини тайинланган тасдиқловчиларга Gmail орқали юборишни тасдиқлайсизми?`))return; try{setStatus(`${no} тасдиқловчиларга юборилмоқда...`,'sync');const result=await postJson('/api/document/send',{...settings(),actNo:no,sentBy:'KIP Administrator'});const sent=(result.results||[]).filter(x=>x.status==='sent').length;const failed=(result.results||[]).filter(x=>x.status==='email-failed').length;setStatus(`${no}: ${sent} та Gmail юборилди${failed?`, ${failed} та хатолик`:''}. Ҳолат: ${result.status}` ,failed?'sync':'ok');await loadReports();}catch(err){setStatus(err.message,'bad');} }

  function openSigners(){ if(!hasSettings()){openSettings();setStatus('Аввал Google Sheets созламаларини киритинг.','bad');return;} $('signersModal').classList.add('show'); loadSigners(); }
  function closeSigners(){$('signersModal').classList.remove('show');}
  function signerRowHtml(signer, isNew=false){ const id=signer.id||`new_${Date.now()}_${Math.random().toString(16).slice(2)}`; const disabled=isNew?'':'disabled'; const fileInfo=signer.signatureUrl?`<a class="file-link" href="${esc(signer.signatureUrl)}" target="_blank" rel="noopener">Drive imzo</a>`:'PNG tanlanmagan'; return `<tr data-signer-id="${esc(id)}" data-new="${isNew?'1':'0'}" data-signature-url="${esc(signer.signatureUrl||'')}"><td><input data-field="position" value="${esc(signer.position||'')}" ${disabled}></td><td><input data-field="fio" value="${esc(signer.fio||'')}" ${disabled}></td><td><div data-file-info>${fileInfo}</div><input data-field="file" type="file" accept="image/png,.png" ${disabled}></td><td><input data-field="gmail" type="email" value="${esc(signer.gmail||'')}" placeholder="name@gmail.com" ${disabled}></td><td><div class="signer-actions"><button class="btn ghost small workspace-operator-only" title="Tahrirlash" onclick="ActsUI.editSigner('${esc(id)}')">✏️</button><button class="btn green small workspace-operator-only" title="Saqlash" onclick="ActsUI.saveSigner('${esc(id)}')" ${isNew?'':'disabled'}>💾</button><button class="btn red small workspace-operator-only" title="O‘chirish" onclick="ActsUI.deleteSigner('${esc(id)}')">🗑</button></div></td></tr>`; }
  function renderSigners(){const tb=$('signersRows');if(!state.signers.length){tb.innerHTML='<tr><td colspan="5">Имзо чекувчилар йўқ. “Қўшиш” тугмасини босинг.</td></tr>';return;}tb.innerHTML=state.signers.map(s=>signerRowHtml(s,false)).join('');}
  async function loadSigners(){
    try {
      setSignersMsg('Workspace imzo chekuvchilari yuklanmoqda...','sync');
      const data = await workspaceApi('/signers?includeInactive=true');
      state.signers = Array.isArray(data?.rows) ? data.rows.map((row)=>({
        id: row.id || '',
        position: row.position || '',
        fio: row.fullName || row.fio || '',
        gmail: row.email || row.gmail || '',
        signatureUrl: row.signatureUrl || '',
        signatureFileId: row.signatureFileId || '',
      })) : [];
      renderSigners();
      applyKipMasterSignerFromApprovers(state.signers);
      setSignersMsg(`${state.signers.length} та имзо чекувчи юкланди.`,'ok');
    } catch (err) {
      setSignersMsg(err.message,'bad');
      $('signersRows').innerHTML=`<tr><td colspan="5">${esc(err.message)}</td></tr>`;
    }
  }
  function addSignerRow(){const tb=$('signersRows');if(tb.querySelector('td[colspan]'))tb.innerHTML='';const id=`new_${Date.now()}`;tb.insertAdjacentHTML('beforeend',signerRowHtml({id},true));setSignersMsg('Янги сатр қўшилди. Майдонларни тўлдириб сақланг.','sync');}
  function rowBySignerId(id){return Array.from($('signersRows').querySelectorAll('tr')).find(tr=>tr.dataset.signerId===id);}
  function editSigner(id){const tr=rowBySignerId(id);if(!tr)return;tr.querySelectorAll('input').forEach(i=>i.disabled=false);const save=tr.querySelector('button[title="Saqlash"]');if(save)save.disabled=false;setSignersMsg('Таҳрирлаш режими ёқилди.','sync');}
  async function uploadSignerFile(file){ if(!file)return''; if(file.type!=='image/png'&&!file.name.toLowerCase().endsWith('.png'))throw new Error('Фақат PNG файл қабул қилинади'); if(file.size>2*1024*1024)throw new Error('PNG ҳажми 2 MB дан ошмаслиги керак'); const s=settings();const form=new FormData();form.append('signature',file);form.append('spreadsheetUrl',s.spreadsheetUrl);form.append('serviceAccount',JSON.stringify(s.serviceAccount)); const data=await apiFetch('/api/signature/upload',{method:'POST',body:form}); return data.webViewLink||data.fileId; }
  async function saveSigner(id){ const tr=rowBySignerId(id);if(!tr)return; const position=tr.querySelector('[data-field="position"]').value.trim();const fio=tr.querySelector('[data-field="fio"]').value.trim();const gmail=tr.querySelector('[data-field="gmail"]').value.trim();const file=tr.querySelector('[data-field="file"]').files[0]; if(!position||!fio||!gmail) return setSignersMsg('Лавозими, F.I.O ва Gmail тўлдирилиши шарт.','bad'); if(!/^[^\s@]+@gmail\.com$/i.test(gmail))return setSignersMsg('Фақат тўғри Gmail манзили қабул қилинади.','bad'); try{setSignersMsg('PNG юкланмоқда ва маълумот сақланмоқда...','sync');let signatureUrl=tr.dataset.signatureUrl||'';if(file)signatureUrl=await uploadSignerFile(file);if(!signatureUrl)throw new Error('PNG имзо танланмаган');const payload={position,fullName:fio,email:gmail,signatureUrl,status:'active'};if(tr.dataset.new==='1'){await workspaceApi('/signers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}else{await workspaceApi(`/signers/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}await loadWorkspaceApproverRegistry(true);await loadSigners();applyKipMasterSignerFromApprovers(state.workspaceApprovers||state.signers||[]);setSignersMsg('Имзо чекувчи сақланди.','ok');}catch(err){setSignersMsg(err.message,'bad');} }
  async function deleteSigner(id){ const tr=rowBySignerId(id);if(!tr)return;if(tr.dataset.new==='1'){tr.remove();return setSignersMsg('Янги сатр бекор қилинди.','sync');}if(!confirm('Ушбу имзо чекувчини ўчиришни тасдиқлайсизми?'))return; try{setSignersMsg('Ўчирилмоқда...','sync');await workspaceApi(`/signers/${encodeURIComponent(id)}`,{method:'DELETE'});await loadWorkspaceApproverRegistry(true);await loadSigners();applyKipMasterSignerFromApprovers(state.workspaceApprovers||state.signers||[]);setSignersMsg('Имзо чекувчи ўчирилди.','ok');}catch(err){setSignersMsg(err.message,'bad');} }

  function clearLegacyDonutOverrides(){const legacy=document.getElementById('actsDonutPositionOverride');if(legacy)legacy.remove();}
  function bind(){
    injectStyles();
    clearLegacyDonutOverrides();
    loadWorkspaceApproverRegistry().then((rows)=>{
      if(!rows?.length) return;
      applyKipMasterSignerFromApprovers(rows);
      let list = $('actsApproverList');
      if(!list){ list = document.createElement('datalist'); list.id = 'actsApproverList'; document.body.appendChild(list); }
      list.innerHTML = rows.map((row)=>`<option value="${esc(row.fio)}">${esc(row.position || row.gmail || '')}</option>`).join('');
      ['person1','person2','person3'].forEach((id)=>{ const input=$(id); if(input) input.setAttribute('list','actsApproverList'); });
    }).catch(()=>{});
    $('serviceFile')?.addEventListener('change',async e=>{const file=e.target.files&&e.target.files[0];if(!file)return;try{const json=JSON.parse(await file.text());if(!json.client_email||!json.private_key||!json.project_id)throw new Error('client_email, private_key ёки project_id топилмади');localStorage.setItem(KEYS.service,JSON.stringify(json));$('serviceFileName').innerHTML=`${esc(file.name)} ✓`;$('settingsMsg').innerHTML='<span class="ok">SERVICE ACCOUNT JSON юкланди.</span>';}catch(err){$('settingsMsg').innerHTML=`<span class="bad">${esc(err.message)}</span>`;}});
    ['failureText','impactText','reasonText','actionText','actDate','actTime','actionDate','actionTime','conclusion'].forEach(id=>$(id)?.addEventListener('input',validateDoc));
    ['person1','position1','person2','position2','person3','position3'].forEach(id=>$(id)?.addEventListener('input',renderDraftFinalSignatures));
    
    if (window.parent && window.parent !== window) {
      setStatus('Иш жойи созланмоқда...', 'sync');
      // Ask parent for workspace info (works even if iframe loaded after workspace-change event)
      window.parent.postMessage({ type: 'REQUEST_WORKSPACE_INFO' }, '*');
    } else {
      if(!hasSettings())openSettings();else loadAnalysis();
    }
  }

  function clearWorkspaceState(){
    revokeSignatureObjectUrls();
    state.analysisRows = [];
    state.dailyRows = [];
    state.signers = [];
    state.selected = null;
    state.workspaceApprovers = null;
    const analysisRows = $('analysisRows');
    const dailyRows = $('dailyRows');
    if(analysisRows) analysisRows.innerHTML = '<tr><td colspan="11">Янги Workspace маълумотлари юкланмоқда...</td></tr>';
    if(dailyRows) dailyRows.innerHTML = '<tr><td colspan="9">Актлар архиви янгиланмоқда...</td></tr>';
    updateKpi({ totalRows:0, plannedDocuments:0, createdDocuments:0, completionPercentage:0, sheetName:settings().sheetName||'—' });
    $('actsA4Modal')?.classList.remove('show');
    resetSaveButton();
    const saveButtonElement = $('saveActBtn');
    if(saveButtonElement) saveButtonElement.disabled = true;
  }

  async function handleWorkspace(ws, isAdmin, nextWorkspaceId='') {
    const nextId = String(nextWorkspaceId || ws?.id || workspaceId() || '').trim();
    const loadVersion = ++workspaceLoadVersion;
    activeWorkspaceId = nextId;
    if(nextId) localStorage.setItem(WORKSPACE_ID_KEY, nextId);
    window.actsIsAdmin = isAdmin;
    // Only hide the button if we are SURE the user is NOT admin.
    // Leave it visible if isAdmin is true or unknown.
    const btn = $('actsSettingsBtn');
    if (btn) btn.style.display = (isAdmin === false) ? 'none' : '';
    
    if (ws?.moduleSettings?.acts_sheet_name) {
      localStorage.setItem(KEYS.sheet, ws.moduleSettings.acts_sheet_name);
    } else {
      localStorage.removeItem(KEYS.sheet);
    }

    clearWorkspaceState();
    
    if (!hasSettings()) {
      if (isAdmin) {
        openSettings();
        setStatus('Google Sheets созламалари киритилмаган.', 'bad');
      } else {
        setStatus('Google Sheets созламалари киритилмаган. Администраторга мурожаат қилинг.', 'bad');
      }
    } else {
      await Promise.all([
        loadAnalysis(nextId),
        loadReports(nextId),
        loadWorkspaceApproverRegistry(true, nextId).catch((error)=>{
          if(error.code!=='STALE_WORKSPACE_RESPONSE') console.warn('[acts-workspace-approvers]', error.message);
          return [];
        })
      ]);
      if(loadVersion!==workspaceLoadVersion||nextId!==activeWorkspaceId||nextId!==workspaceId())return;
    }
  }

  window.addEventListener('message', async (e) => {
    if (e.data && e.data.type === 'SEG_KIP_WORKSPACE_CHANGE') {
      await handleWorkspace(e.data.workspace, e.data.isAdmin, e.data.workspaceId);
    }
  });

  window.ActsUI={state,showView,showReport,openSettings,closeSettings,saveSettings,loadAnalysis,loadReports,handleWorkspace,fillDoc,saveAct,openExcel,setStatus,viewDoc,closeA4Modal,sendDoc,openSigners,closeSigners,loadSigners,addSignerRow,editSigner,saveSigner,deleteSigner};
  document.addEventListener('DOMContentLoaded',bind);
})();
