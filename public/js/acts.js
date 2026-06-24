(function(){
  const KEYS = { url:'acts_sheet_url', sheet:'acts_sheet_name', service:'acts_service_account' };
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const state = { analysisRows: [], dailyRows: [], signers: [], selected: null, saving: false };

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function ref(v){ return encodeURIComponent(String(v || '')); }
  function unref(v){ try { return decodeURIComponent(String(v || '')); } catch(_) { return String(v || ''); } }
  function settings(){
    let serviceAccount = null;
    try { serviceAccount = JSON.parse(localStorage.getItem(KEYS.service) || 'null'); } catch(_) {}
    return { spreadsheetUrl: localStorage.getItem(KEYS.url) || '', sheetName: localStorage.getItem(KEYS.sheet) || '', serviceAccount };
  }
  function hasSettings(){ const s=settings(); return Boolean(s.spreadsheetUrl && s.sheetName && s.serviceAccount); }
  function setStatus(text, cls=''){ const el=$('actsStatus'); if(el) el.innerHTML = `Ҳолат: <span class="${cls}">${esc(text)}</span>`; }
  function setSignersMsg(text, cls=''){ const el=$('signersMsg'); if(el) el.innerHTML = `<span class="${cls}">${esc(text)}</span>`; }
  function parentOnline(status){ try { parent.postMessage({ type:'SEG_ACTS_STATUS', status }, '*'); } catch(_) {} }

  function toBase64Url(value){
    const bytes = new TextEncoder().encode(String(value));
    let binary=''; bytes.forEach(b=>binary+=String.fromCharCode(b));
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function configHeader(){
    const s=settings();
    return toBase64Url(JSON.stringify({ spreadsheetUrl:s.spreadsheetUrl, serviceAccount:s.serviceAccount }));
  }
  function adminToken(){ return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; }
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
    if(hasSettings()) headers.set('x-seg-kip-config',configHeader());
    if(adminToken()) headers.set('Authorization',`Bearer ${adminToken()}`);
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

  function injectStyles(){
    if(document.getElementById('actsWorkflowStyles')) return;
    const style=document.createElement('style');
    style.id='actsWorkflowStyles';
    style.textContent='.btn.done{background:linear-gradient(135deg,#16a34a,#86efac)!important;color:#052e16!important;border:0!important;box-shadow:0 0 18px rgba(34,197,94,.35)!important}.btn.saving{opacity:.9!important;pointer-events:none!important;background:linear-gradient(135deg,#f59e0b,#facc15)!important;color:#1f1300!important;border:0!important}.btn.saved{background:linear-gradient(135deg,#16a34a,#22c55e,#86efac)!important;color:#022c22!important;border:0!important;box-shadow:0 0 20px rgba(34,197,94,.55)!important}.btn:active{transform:scale(.97)}.acts-a4-modal{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:80;display:none;align-items:center;justify-content:center;padding:18px}.acts-a4-modal.show{display:flex}.acts-a4-wrap{max-height:95vh;overflow:auto}.acts-a4-toolbar{display:flex;gap:10px;justify-content:center;margin-bottom:10px}.acts-a4-toolbar button{padding:10px 16px;border:0;border-radius:10px;font-weight:800;cursor:pointer}.a4-preview{width:210mm;min-height:297mm;margin:0 auto;background:#fff;color:#111;padding:18mm;font-family:"Times New Roman",serif;box-shadow:0 0 30px rgba(0,0,0,.35)}.a4-preview p{font-size:15px;line-height:1.45}.a4-preview .act-head{text-align:center;font-weight:700}.a4-preview .right{text-align:right;color:#00f;font-size:14px;margin-bottom:15px}.a4-preview .act-title{text-align:center;font-size:18px;font-weight:900;margin:10px 0}.a4-preview .signs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:25px;margin-top:32px;text-align:center;font-size:12px}@media print{.acts-a4-toolbar{display:none}.acts-a4-modal{position:static;display:block;background:#fff;padding:0}.a4-preview{box-shadow:none}}';
    document.head.appendChild(style);
  }

  function setDonut(pct){ const v=Math.max(0,Math.min(100,Number(pct)||0)); const d=$('completionDonut'); if(d){d.style.setProperty('--p',v); const s=d.querySelector('span'); if(s)s.textContent=`${v}%`;}}
  function updateKpi(data){ $('kpiTotal').textContent=data.totalRows??0; $('kpiPlanned').textContent=data.plannedDocuments??0; $('kpiCreated').textContent=data.createdDocuments??0; $('kpiSheet').textContent=data.sheetName||settings().sheetName||'—'; setDonut(data.completionPercentage||0); }
  function formatWorkPlace(row){ return `${row.deviceName||''} ${row.typeMark||''}, завод рақами ${row.serialNo||''},\nўлчаш чегараси ${row.measureRange||''},\n${row.place||''}, поз. №${row.positionNo||''}`.replace(/ +,/g,',').trim(); }
  function today(){ const d=new Date(); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; }

  function renderRows(rows){
    const tb=$('analysisRows');
    if(!rows||!rows.length){tb.innerHTML='<tr><td colspan="11">ТО-2 / АКТ қаторлари топилмади.</td></tr>';return;}
    tb.innerHTML=rows.map((r,i)=>{const action=r.isCompleted?`<button class="btn done" onclick="ActsUI.viewDoc('${ref(r.actNo)}')">Хужат якунланди</button>`:`<button class="btn green" onclick="ActsUI.fillDoc(${i})">Хужат яратиш</button>`;return `<tr data-source-key="${esc(r.sourceKey||'')}"><td>${i+1}</td><td>${esc(r.date)}</td><td>${esc(r.positionNo)}</td><td>${esc(r.deviceName)}</td><td>${esc(r.typeMark)}</td><td>${esc(r.serialNo)}</td><td>${esc(r.measureRange)}</td><td>${esc(r.place)}</td><td class="icol">${esc(r.workType)}</td><td>${esc(r.executor)}</td><td>${action}</td></tr>`;}).join('');
  }
  async function loadAnalysis(){
    if(!hasSettings()){openSettings();setStatus('Google Sheets созламалари киритилмаган.','bad');return;}
    try{setStatus('Google Sheets билан синхронланмоқда...','sync');parentOnline('SYNCING');const data=await postJson('/api/acts/monthly-analysis',settings());state.analysisRows=data.rows||[];updateKpi(data);renderRows(state.analysisRows);setStatus('Google Sheets уланди. Маълумотлар янгиланди.','ok');parentOnline('ONLINE');}
    catch(err){setStatus(err.message,'bad');parentOnline('OFFLINE');}
  }
  async function loadReports(){
    const tb=$('dailyRows');
    if(!hasSettings()){tb.innerHTML='<tr><td colspan="9">Google Sheets созламалари киритилмаган.</td></tr>';return[];}
    try{const data=await postJson('/api/acts/reports/daily',settings());const rows=data.rows||[];state.dailyRows=rows;if(!rows.length){tb.innerHTML='<tr><td colspan="9">Кунлик ҳисоботда ҳужжатлар йўқ.</td></tr>';return rows;}tb.innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.actNo)}</td><td>${esc(r.date)}</td><td>${esc(r.device)}</td><td>${esc(r.serial)}</td><td>${esc(r.place)}</td><td>${esc(r.executor)}</td><td>${esc(r.status)}</td><td><button class="btn primary small" onclick="ActsUI.viewDoc('${ref(r.actNo)}')">Кўриш</button> <button class="btn orange small" onclick="ActsUI.sendDoc('${ref(r.actNo)}')">Хужатни юбориш</button></td></tr>`).join('');return rows;}
    catch(err){tb.innerHTML=`<tr><td colspan="9">${esc(err.message)}</td></tr>`;return[];}
  }

  function resetSaveButton(){const b=$('saveActBtn');if(!b)return;b.classList.remove('saving','saved');b.textContent='Сақлаш';}
  function saveButton(mode){const b=$('saveActBtn');if(!b)return;b.classList.remove('saving','saved');if(mode==='saving'){b.classList.add('saving');b.textContent='⏳ Сақланмоқда...';b.disabled=true;return;}if(mode==='saved'){b.classList.add('saved');b.textContent='Сақланди ✓';b.disabled=true;return;}resetSaveButton();}
  function fillDoc(index){const row=state.analysisRows[index];if(!row)return;if(row.isCompleted){viewDoc(ref(row.actNo));return;}state.selected=row;$('workPlace').value=formatWorkPlace(row);$('actDate').value=row.date||today();$('actNo').value='';['failureText','impactText','reasonText','actionText','conclusion'].forEach(id=>{if($(id))$(id).value='';});resetSaveButton();showView('create',$('tab-create'));validateDoc();}
  function collectActBase(){const r=state.selected||{};return{actNo:$('actNo').value.trim(),date:$('actDate').value.trim(),workPlace:$('workPlace').value.trim(),deviceName:r.deviceName||'',serialNo:r.serialNo||'',place:r.place||'',executor:r.executor||'',person1:$('person1').value,position1:$('position1').value,department1:$('department1').value,person2:$('person2').value,position2:$('position2').value,department2:$('department2').value,person3:$('person3').value,position3:$('position3').value,department3:$('department3').value,failureText:$('failureText').value.trim(),impactText:$('impactText').value.trim(),reasonText:$('reasonText').value.trim(),actionText:$('actionText').value.trim(),conclusion:$('conclusion').value.trim(),sourceSheet:r.sourceSheet||'',sourceRowNumber:r.sourceRowNumber||'',sourceKey:r.sourceKey||''};}
  function buildA4ActHtml(a){const sign='<div class="signs"><div>_________________<br>(Лавозими)</div><div>_________________<br>(Имзо)</div><div>_________________<br>(Ф.И.Ш.)</div></div>';return `<div class="a4-preview"><div class="act-head"><div class="right">Низомга илова №4<br>“SANEG” МЧЖ К/К объектларида<br>назорат ўлчов воситалари ва автоматлаштириш тизимларига<br>техник хизмат кўрсатиш бўйича</div><div style="text-align:right;font-weight:400">ТПП «Андижан»</div><div class="act-title">ДАЛОЛАТНОМА № ${esc(a.actNo||'')}</div><div>Ўлчов воситасининг бузилиши</div></div><p><b>Сана:</b> ${esc(a.date)}</p><p><b>1. Ў.В. Ишлаш жойи:</b><br>${esc(a.workPlace).replace(/\n/g,'<br>')}</p><p><b>2. Рад этиш мазмуни, санаси, вақти:</b><br>${esc(a.failureText)}</p><p><b>3. Носозликнинг технологик оқибатлари:</b><br>${esc(a.impactText)}</p><p><b>4. Рад этиш сабаби:</b><br>${esc(a.reasonText)}</p><p><b>5. Носозликни бартараф этиш бўйича оператив ҳаракатлар ва бартараф этиш вақти:</b><br>${esc(a.actionText)}</p><p><b>Хулоса:</b><br>${esc(a.conclusion)}</p><p><b>Имзолар:</b></p>${sign}${sign}</div>`;}
  function collectAct(){const base=collectActBase();return{...base,a4Html:buildA4ActHtml(base),a4Json:JSON.stringify(base)};}
  function validateDoc(){const a=collectActBase();const required=['date','workPlace','failureText','impactText','reasonText','actionText','conclusion'];const done=required.filter(k=>a[k]).length;const pct=Math.round(done/required.length*100);$('fillBar').style.width=pct+'%';$('fillText').textContent=`Тўлдирилиш: ${pct}%`;const b=$('saveActBtn');if(b&&!state.saving&&!b.classList.contains('saved'))b.disabled=pct<100||!state.selected;return pct>=100;}
  function markCompleted(actNo){const key=state.selected?.sourceKey;if(!key)return;state.analysisRows=state.analysisRows.map(r=>r.sourceKey===key?{...r,isCompleted:true,actNo,status:'Хужат якунланди'}:r);renderRows(state.analysisRows);}
  async function saveAct(){if(state.saving)return;if(!validateDoc()){setStatus('Мажбурий майдонларни тўлдиринг.','bad');return;}state.saving=true;saveButton('saving');try{setStatus('Ҳужжат Google Sheets га сақланмоқда...','sync');const result=await postJson('/api/acts/create',{...settings(),act:collectAct()});$('actNo').value=result.actNo||'';saveButton('saved');markCompleted(result.actNo||'');setStatus(result.duplicate?`Ҳужжат аввал якунланган: ${result.actNo}`:`Ҳужжат сақланди: ${result.actNo}. Маълумот АКТЛАР_КУНЛИК варағига қўшилди.`,'ok');await loadReports();await loadAnalysis();setTimeout(()=>{showView('analysis',$('tab-analysis'));state.saving=false;},900);}catch(err){state.saving=false;resetSaveButton();validateDoc();setStatus(err.message,'bad');}}

  function showView(id,btn){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('.acts-top .tabs button').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');if(id==='reports')loadReports();}
  function showReport(id,btn){document.querySelectorAll('.report-view').forEach(v=>v.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('.subtabs button').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');}
  function openExcel(){const url=settings().spreadsheetUrl;if(!url){alert('Google Sheets ҳаволаси киритилмаган.');return;}window.open(url,'_blank','noopener,noreferrer');}
  function openSettings(){const s=settings();$('sheetUrl').value=s.spreadsheetUrl||'';$('sheetName').value=s.sheetName||'';$('settingsModal').classList.add('show');}
  function closeSettings(){$('settingsModal').classList.remove('show');}
  async function saveSettings(){const spreadsheetUrl=$('sheetUrl').value.trim();const sheetName=$('sheetName').value.trim();let serviceAccount=settings().serviceAccount;if(!spreadsheetUrl||!sheetName){$('settingsMsg').innerHTML='<span class="bad">Google Sheets силкаси ва ASOSIY VAROQ киритилиши шарт.</span>';return;}if(!serviceAccount){$('settingsMsg').innerHTML='<span class="bad">SERVICE ACCOUNT JSON файлини танланг.</span>';return;}try{$('settingsMsg').innerHTML='<span class="sync">Уланиш текширилмоқда...</span>';await postJson('/api/acts/settings/test',{spreadsheetUrl,serviceAccount});localStorage.setItem(KEYS.url,spreadsheetUrl);localStorage.setItem(KEYS.sheet,sheetName);localStorage.setItem(KEYS.service,JSON.stringify(serviceAccount));closeSettings();setStatus('Созламалар сақланди.','ok');await loadAnalysis();}catch(err){$('settingsMsg').innerHTML=`<span class="bad">${esc(err.message)}</span>`;}}

  async function findReport(actNo){const no=unref(actNo);if(!state.dailyRows.length)await loadReports();return state.dailyRows.find(r=>String(r.actNo||'')===no);}
  function ensureA4Modal(){let modal=$('actsA4Modal');if(modal)return modal;modal=document.createElement('div');modal.id='actsA4Modal';modal.className='acts-a4-modal';modal.innerHTML='<div class="acts-a4-wrap"><div class="acts-a4-toolbar"><button onclick="window.print()">PDF / Print</button><button onclick="document.getElementById(\'actsA4Modal\').classList.remove(\'show\')">Yopish</button></div><div id="actsA4Content"></div></div>';document.body.appendChild(modal);return modal;}
  async function viewDoc(actNo){const report=await findReport(actNo);if(!report){alert('Ҳужжат топилмади. Excel очилади.');openExcel();return;}let html=report.a4Html||'';if(!html){let act=null;try{act=JSON.parse(report.a4Json||'null');}catch(_){}html=buildA4ActHtml(act||{actNo:report.actNo,date:report.date,workPlace:report.workPlace,failureText:report.failureText,impactText:report.impactText,reasonText:report.reasonText,actionText:report.actionText,conclusion:report.conclusion});}ensureA4Modal();$('actsA4Content').innerHTML=html;$('actsA4Modal').classList.add('show');}
  async function sendDoc(actNo){
    const no=unref(actNo);
    if(!confirm(`${no} ҳужжатини барча имзо чекувчиларга Gmail орқали юборишни тасдиқлайсизми?`))return;
    try{setStatus(`${no} имзоловчиларга юборилмоқда...`,'sync');const result=await postJson('/api/document/send',{...settings(),actNo:no,sentBy:'KIP Administrator'});const sent=(result.results||[]).filter(x=>x.status==='sent').length;const failed=(result.results||[]).filter(x=>x.status==='email-failed').length;setStatus(`${no}: ${sent} та Gmail юборилди${failed?`, ${failed} та хатолик`:''}. Ҳолат: ${result.status}` ,failed?'sync':'ok');await loadReports();}catch(err){setStatus(err.message,'bad');}
  }

  function openSigners(){
    if(!hasSettings()){openSettings();setStatus('Аввал Google Sheets созламаларини киритинг.','bad');return;}
    $('signersModal').classList.add('show');
    loadSigners();
  }
  function closeSigners(){$('signersModal').classList.remove('show');}
  function signerRowHtml(signer, isNew=false){
    const id=signer.id||`new_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const disabled=isNew?'':'disabled';
    const fileInfo=signer.signatureUrl?`<a class="file-link" href="${esc(signer.signatureUrl)}" target="_blank" rel="noopener">Drive imzo</a>`:'PNG tanlanmagan';
    return `<tr data-signer-id="${esc(id)}" data-new="${isNew?'1':'0'}" data-signature-url="${esc(signer.signatureUrl||'')}"><td><input data-field="position" value="${esc(signer.position||'')}" ${disabled}></td><td><input data-field="fio" value="${esc(signer.fio||'')}" ${disabled}></td><td><div data-file-info>${fileInfo}</div><input data-field="file" type="file" accept="image/png,.png" ${disabled}></td><td><input data-field="gmail" type="email" value="${esc(signer.gmail||'')}" placeholder="name@gmail.com" ${disabled}></td><td><div class="signer-actions"><button class="btn ghost small" title="Tahrirlash" onclick="ActsUI.editSigner('${esc(id)}')">✏️</button><button class="btn green small" title="Saqlash" onclick="ActsUI.saveSigner('${esc(id)}')" ${isNew?'':'disabled'}>💾</button><button class="btn red small" title="O‘chirish" onclick="ActsUI.deleteSigner('${esc(id)}')">🗑</button></div></td></tr>`;
  }
  function renderSigners(){const tb=$('signersRows');if(!state.signers.length){tb.innerHTML='<tr><td colspan="5">Имзо чекувчилар йўқ. “Қўшиш” тугмасини босинг.</td></tr>';return;}tb.innerHTML=state.signers.map(s=>signerRowHtml(s,false)).join('');}
  async function loadSigners(){try{setSignersMsg('Google Sheets дан юкланмоқда...','sync');const data=await apiFetch('/api/signers');state.signers=data.rows||[];renderSigners();setSignersMsg(`${state.signers.length} та имзо чекувчи юкланди.`,'ok');}catch(err){setSignersMsg(err.message,'bad');$('signersRows').innerHTML=`<tr><td colspan="5">${esc(err.message)}</td></tr>`;}}
  function addSignerRow(){const tb=$('signersRows');if(tb.querySelector('td[colspan]'))tb.innerHTML='';const id=`new_${Date.now()}`;tb.insertAdjacentHTML('beforeend',signerRowHtml({id},true));setSignersMsg('Янги сатр қўшилди. Майдонларни тўлдириб сақланг.','sync');}
  function rowBySignerId(id){return Array.from($('signersRows').querySelectorAll('tr')).find(tr=>tr.dataset.signerId===id);}
  function editSigner(id){const tr=rowBySignerId(id);if(!tr)return;tr.querySelectorAll('input').forEach(i=>i.disabled=false);const save=tr.querySelector('button[title="Saqlash"]');if(save)save.disabled=false;setSignersMsg('Таҳрирлаш режими ёқилди.','sync');}
  async function uploadSignerFile(file){
    if(!file)return'';
    if(file.type!=='image/png'&&!file.name.toLowerCase().endsWith('.png'))throw new Error('Фақат PNG файл қабул қилинади');
    if(file.size>2*1024*1024)throw new Error('PNG ҳажми 2 MB дан ошмаслиги керак');
    const s=settings();const form=new FormData();form.append('signature',file);form.append('spreadsheetUrl',s.spreadsheetUrl);form.append('serviceAccount',JSON.stringify(s.serviceAccount));
    const data=await apiFetch('/api/signature/upload',{method:'POST',body:form});
    return data.webViewLink||data.fileId;
  }
  async function saveSigner(id){
    const tr=rowBySignerId(id);if(!tr)return;
    const position=tr.querySelector('[data-field="position"]').value.trim();const fio=tr.querySelector('[data-field="fio"]').value.trim();const gmail=tr.querySelector('[data-field="gmail"]').value.trim();const file=tr.querySelector('[data-field="file"]').files[0];
    if(!position||!fio||!gmail) return setSignersMsg('Лавозими, F.I.O ва Gmail тўлдирилиши шарт.','bad');
    if(!/^[^\s@]+@gmail\.com$/i.test(gmail))return setSignersMsg('Фақат тўғри Gmail манзили қабул қилинади.','bad');
    try{setSignersMsg('PNG юкланмоқда ва маълумот сақланмоқда...','sync');let signatureUrl=tr.dataset.signatureUrl||'';if(file)signatureUrl=await uploadSignerFile(file);if(!signatureUrl)throw new Error('PNG имзо танланмаган');const payload={position,fio,gmail,signatureUrl,...settings()};if(tr.dataset.new==='1'){await postJson('/api/signers',payload);}else{await apiFetch(`/api/signers/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}await loadSigners();setSignersMsg('Имзо чекувчи сақланди.','ok');}catch(err){setSignersMsg(err.message,'bad');}
  }
  async function deleteSigner(id){
    const tr=rowBySignerId(id);if(!tr)return;if(tr.dataset.new==='1'){tr.remove();return setSignersMsg('Янги сатр бекор қилинди.','sync');}if(!confirm('Ушбу имзо чекувчини ўчиришни тасдиқлайсизми?'))return;
    try{setSignersMsg('Ўчирилмоқда...','sync');await apiFetch(`/api/signers/${encodeURIComponent(id)}`,{method:'DELETE'});await loadSigners();setSignersMsg('Имзо чекувчи ўчирилди.','ok');}catch(err){setSignersMsg(err.message,'bad');}
  }

  function clearLegacyDonutOverrides(){const legacy=document.getElementById('actsDonutPositionOverride');if(legacy)legacy.remove();}
  function bind(){injectStyles();clearLegacyDonutOverrides();$('serviceFile')?.addEventListener('change',async e=>{const file=e.target.files&&e.target.files[0];if(!file)return;try{const json=JSON.parse(await file.text());if(!json.client_email||!json.private_key||!json.project_id)throw new Error('client_email, private_key ёки project_id топилмади');localStorage.setItem(KEYS.service,JSON.stringify(json));$('serviceFileName').innerHTML=`${esc(file.name)} ✓`;$('settingsMsg').innerHTML='<span class="ok">SERVICE ACCOUNT JSON юкланди.</span>';}catch(err){$('settingsMsg').innerHTML=`<span class="bad">${esc(err.message)}</span>`;}});['failureText','impactText','reasonText','actionText','conclusion'].forEach(id=>$(id)?.addEventListener('input',validateDoc));if(!hasSettings())openSettings();else loadAnalysis();}

  window.ActsUI={showView,showReport,openSettings,closeSettings,saveSettings,loadAnalysis,fillDoc,saveAct,openExcel,setStatus,viewDoc,sendDoc,openSigners,closeSigners,loadSigners,addSignerRow,editSigner,saveSigner,deleteSigner};
  document.addEventListener('DOMContentLoaded',bind);
})();
