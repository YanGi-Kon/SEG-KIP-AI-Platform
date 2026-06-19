(function(){
  const KEYS = { url:'acts_sheet_url', sheet:'acts_sheet_name', service:'acts_service_account' };
  const state = { analysisRows: [], selected: null, completion: 0 };

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function settings(){
    let serviceAccount = null;
    try { serviceAccount = JSON.parse(localStorage.getItem(KEYS.service) || 'null'); } catch(_) {}
    return { spreadsheetUrl: localStorage.getItem(KEYS.url) || '', sheetName: localStorage.getItem(KEYS.sheet) || '', serviceAccount };
  }
  function hasSettings(){ const s=settings(); return Boolean(s.spreadsheetUrl && s.sheetName && s.serviceAccount); }
  function setStatus(text, cls=''){ const el=$('actsStatus'); if(el) el.innerHTML = `Ҳолат: <span class="${cls}">${esc(text)}</span>`; }
  function parentOnline(status){
    try { parent.postMessage({ type:'SEG_ACTS_STATUS', status }, '*'); } catch(_) {}
  }
  function setDonut(pct){
    const v = Math.max(0, Math.min(100, Number(pct) || 0));
    const d = $('completionDonut');
    if(d){ d.style.setProperty('--p', v); const s=d.querySelector('span'); if(s) s.textContent = `${v}%`; }
  }
  function updateKpi(data){
    $('kpiTotal').textContent = data.totalRows ?? 0;
    $('kpiPlanned').textContent = data.plannedDocuments ?? 0;
    $('kpiCreated').textContent = data.createdDocuments ?? 0;
    $('kpiSheet').textContent = data.sheetName || settings().sheetName || '—';
    setDonut(data.completionPercentage || 0);
  }
  function formatWorkPlace(row){
    return `${row.deviceName || ''} ${row.typeMark || ''}, завод рақами ${row.serialNo || ''},\nўлчаш чегараси ${row.measureRange || ''},\n${row.place || ''}, поз. №${row.positionNo || ''}`.replace(/ +,/g, ',').trim();
  }
  function today(){
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  }
  function renderRows(rows){
    const tb = $('analysisRows');
    if(!rows || !rows.length){ tb.innerHTML = '<tr><td colspan="11">ТО-2 / АКТ қаторлари топилмади.</td></tr>'; return; }
    tb.innerHTML = rows.map((r,i)=>`<tr>
      <td>${i+1}</td><td>${esc(r.date)}</td><td>${esc(r.positionNo)}</td><td>${esc(r.deviceName)}</td><td>${esc(r.typeMark)}</td><td>${esc(r.serialNo)}</td><td>${esc(r.measureRange)}</td><td>${esc(r.place)}</td><td class="icol">${esc(r.workType)}</td><td>${esc(r.executor)}</td>
      <td><button class="btn green" onclick="ActsUI.fillDoc(${i})">Хужат яратиш</button></td>
    </tr>`).join('');
  }
  async function postJson(url, body){
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.error) throw new Error(data.error || 'API хатоси');
    return data;
  }
  async function loadAnalysis(){
    if(!hasSettings()){ openSettings(); setStatus('Google Sheets созламалари киритилмаган.', 'bad'); return; }
    const s = settings();
    try{
      setStatus('Google Sheets билан синхронланмоқда...', 'sync'); parentOnline('SYNCING');
      const data = await postJson('/api/acts/monthly-analysis', s);
      state.analysisRows = data.rows || [];
      updateKpi(data); renderRows(state.analysisRows);
      setStatus('Google Sheets уланди. Маълумотлар янгиланди.', 'ok'); parentOnline('ONLINE');
    }catch(err){
      setStatus(err.message, 'bad'); parentOnline('OFFLINE');
    }
  }
  async function loadReports(){
    const tb = $('dailyRows');
    if(!hasSettings()){ tb.innerHTML='<tr><td colspan="9">Google Sheets созламалари киритилмаган.</td></tr>'; return; }
    try{
      const data = await postJson('/api/acts/reports/daily', settings());
      const rows = data.rows || [];
      if(!rows.length){ tb.innerHTML='<tr><td colspan="9">Кунлик ҳисоботда ҳужжатлар йўқ.</td></tr>'; return; }
      tb.innerHTML = rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.actNo)}</td><td>${esc(r.date)}</td><td>${esc(r.device)}</td><td>${esc(r.serial)}</td><td>${esc(r.place)}</td><td>${esc(r.executor)}</td><td>${esc(r.status)}</td><td><button class="btn primary" onclick="ActsUI.viewDoc('${esc(r.actNo)}')">Хужатни кўриш</button> <button class="btn orange" onclick="ActsUI.sendDoc('${esc(r.actNo)}')">Хужатни юбориш</button></td></tr>`).join('');
    }catch(err){ tb.innerHTML = `<tr><td colspan="9">${esc(err.message)}</td></tr>`; }
  }
  function fillDoc(index){
    const row = state.analysisRows[index]; if(!row) return;
    state.selected = row;
    $('workPlace').value = formatWorkPlace(row);
    $('actDate').value = row.date || today();
    $('actNo').value = '';
    ['failureText','impactText','reasonText','actionText','conclusion'].forEach(id => { if($(id)) $(id).value = ''; });
    showView('create', $('tab-create'));
    validateDoc();
  }
  function collectAct(){
    const r = state.selected || {};
    return {
      actNo: $('actNo').value.trim(), date: $('actDate').value.trim(), workPlace: $('workPlace').value.trim(),
      deviceName: r.deviceName || '', serialNo: r.serialNo || '', place: r.place || '', executor: r.executor || '',
      person1:$('person1').value, position1:$('position1').value, department1:$('department1').value,
      person2:$('person2').value, position2:$('position2').value, department2:$('department2').value,
      person3:$('person3').value, position3:$('position3').value, department3:$('department3').value,
      failureText:$('failureText').value.trim(), impactText:$('impactText').value.trim(), reasonText:$('reasonText').value.trim(), actionText:$('actionText').value.trim(), conclusion:$('conclusion').value.trim()
    };
  }
  function validateDoc(){
    const a = collectAct();
    const required = ['date','workPlace','failureText','impactText','reasonText','actionText','conclusion'];
    const done = required.filter(k => a[k]).length;
    const pct = Math.round(done / required.length * 100);
    $('fillBar').style.width = pct + '%'; $('fillText').textContent = `Тўлдирилиш: ${pct}%`;
    $('saveActBtn').disabled = pct < 100 || !state.selected;
    return pct >= 100;
  }
  async function saveAct(){
    if(!validateDoc()) { setStatus('Мажбурий майдонларни тўлдиринг.', 'bad'); return; }
    try{
      setStatus('Ҳужжат Google Sheets га сақланмоқда...', 'sync');
      const result = await postJson('/api/acts/create', { ...settings(), act: collectAct() });
      $('actNo').value = result.actNo || '';
      setStatus(`Ҳужжат сақланди: ${result.actNo}. Маълумот АКТЛАР_КУНЛИК варағига қўшилди.`, 'ok');
      await loadReports(); await loadAnalysis(); showView('reports', $('tab-reports'));
    }catch(err){ setStatus(err.message, 'bad'); }
  }
  function showView(id, btn){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); $(id).classList.add('active');
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active')); if(btn) btn.classList.add('active');
    if(id === 'reports') loadReports();
  }
  function showReport(id, btn){ document.querySelectorAll('.report-view').forEach(v=>v.classList.remove('active')); $(id).classList.add('active'); document.querySelectorAll('.subtabs button').forEach(b=>b.classList.remove('active')); if(btn) btn.classList.add('active'); }
  function openExcel(){ const url=settings().spreadsheetUrl; if(!url){ alert('Google Sheets ҳаволаси киритилмаган.'); return; } window.open(url, '_blank', 'noopener,noreferrer'); }
  function openSettings(){ const s=settings(); $('sheetUrl').value=s.spreadsheetUrl; $('sheetName').value=s.sheetName; $('settingsModal').classList.add('show'); }
  function closeSettings(){ $('settingsModal').classList.remove('show'); }
  async function saveSettings(){
    const spreadsheetUrl = $('sheetUrl').value.trim(); const sheetName = $('sheetName').value.trim();
    let serviceAccount = settings().serviceAccount;
    if(!spreadsheetUrl || !sheetName){ $('settingsMsg').innerHTML='<span class="bad">Google Sheets силкаси ва ASOSIY VAROQ киритилиши шарт.</span>'; return; }
    if(!serviceAccount){ $('settingsMsg').innerHTML='<span class="bad">SERVICE ACCOUNT JSON файлини танланг.</span>'; return; }
    try{
      $('settingsMsg').innerHTML='<span class="sync">Уланиш текширилмоқда...</span>';
      await postJson('/api/acts/settings/test', { spreadsheetUrl, serviceAccount });
      localStorage.setItem(KEYS.url, spreadsheetUrl); localStorage.setItem(KEYS.sheet, sheetName); localStorage.setItem(KEYS.service, JSON.stringify(serviceAccount));
      closeSettings(); setStatus('Созламалар сақланди.', 'ok'); await loadAnalysis();
    }catch(err){ $('settingsMsg').innerHTML=`<span class="bad">${esc(err.message)}</span>`; }
  }
  function viewDoc(actNo){ if(!actNo) return; alert(`${actNo} ҳужжати АКТЛАР_КУНЛИК варағида сақланган. Тўлиқ кўриш учун Excel очилади.`); openExcel(); }
  function sendDoc(actNo){ alert(`${actNo} ҳужжати PDF → E-IMZO → Архив жараёнига кейинги босқичда юборилади.`); }
  function bind(){
    $('serviceFile')?.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0]; if(!file) return;
      try{
        const json = JSON.parse(await file.text());
        if(!json.client_email || !json.private_key || !json.project_id) throw new Error('client_email, private_key ёки project_id топилмади');
        localStorage.setItem(KEYS.service, JSON.stringify(json));
        $('serviceFileName').innerHTML = `${esc(file.name)} ✓`;
        $('settingsMsg').innerHTML = '<span class="ok">SERVICE ACCOUNT JSON юкланди.</span>';
      }catch(err){ $('settingsMsg').innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
    });
    ['failureText','impactText','reasonText','actionText','conclusion'].forEach(id => $(id)?.addEventListener('input', validateDoc));
    if(!hasSettings()) openSettings(); else loadAnalysis();
  }
  window.ActsUI = { showView, showReport, openSettings, closeSettings, saveSettings, loadAnalysis, fillDoc, saveAct, openExcel, setStatus, viewDoc, sendDoc };
  document.addEventListener('DOMContentLoaded', bind);
})();
