(function(){
  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  function pget(store,key){ try { return parent?.[store]?.getItem(key) || ''; } catch(_) { return ''; } }
  function workspaceId(){ return localStorage.getItem(WORKSPACE_ID_KEY) || pget('localStorage', WORKSPACE_ID_KEY) || ''; }
  function workspaceToken(){ return sessionStorage.getItem(WORKSPACE_TOKEN_KEY) || pget('sessionStorage', WORKSPACE_TOKEN_KEY) || ''; }
  function workspaceMode(){ return Boolean(workspaceId() && workspaceToken()); }

  const DEFAULT_MENUS=[
    {menuName:'ПАСПОРТ МАНОМЕТР',sheetName:'Манометр'},
    {menuName:'ФОРМУЛЯР',sheetName:'Формуляр'},
    {menuName:'ТЕЛЕМЕХАНИКА ФОРМУЛЯР',sheetName:'Телемеханика'},
    {menuName:"UMUMIY BO'LIM",sheetName:'Умумий'}
  ];
  const MENU_ORDER=['ПАСПОРТ МАНОМЕТР','ФОРМУЛЯР','ТЕЛЕМЕХАНИКА ФОРМУЛЯР',"UMUMIY BO'LIM"];
  const ICONS={'ПАСПОРТ МАНОМЕТР':'📋','ФОРМУЛЯР':'📄','ТЕЛЕМЕХАНИКА ФОРМУЛЯР':'📡',"UMUMIY BO'LIM":'🧭'};
  const DESCS={
    'ПАСПОРТ МАНОМЕТР':'Манометр паспортлари ва ўлчов асбоблари реестри.',
    'ФОРМУЛЯР':'Формуляр маълумотлари учун танланган ASOSIY VAROQ.',
    'ТЕЛЕМЕХАНИКА ФОРМУЛЯР':'Телемеханика маълумотлари фақат ўз ASOSIY VAROQидан олинади.',
    "UMUMIY BO'LIM":'Умумий маълумотлар фақат ўз ASOSIY VAROQидан олинади.'
  };
  const appState={instruments:[],loaded:false,loadedSheet:'',activeMenu:'ПАСПОРТ МАНОМЕТР'};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function sheetFor(menuName){
    const exact = DEFAULT_MENUS.find(x=>x.menuName===menuName);
    return exact?.sheetName || window.state?.workspace?.mainSheetName || '';
  }
  const settings=()=>({
    spreadsheetUrl: window.state?.workspace?.spreadsheetUrl || '',
    sheetName: sheetFor(appState.activeMenu)
  });
  const hasSettings=()=>Boolean(window.state?.workspace?.spreadsheetUrl && window.state?.workspace?.mainSheetName);

  async function post(path,body={}){
    const headers={'Content-Type':'application/json'};
    const wId=workspaceId();
    const wToken=workspaceToken();
    if(wId) headers['x-workspace-id']=wId;
    if(wToken) headers['Authorization']=`Bearer ${wToken}`;
    const token=sessionStorage.getItem(ADMIN_TOKEN_KEY) || pget('sessionStorage', ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY) || pget('localStorage', ADMIN_TOKEN_KEY);
    if(token&&!wToken) headers['Authorization']=`Bearer ${token}`;

    const r=await fetch(path,{method:'POST',headers,body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.error||d.ok===false)throw new Error(d.error||`HTTP ${r.status}`);
    return d;
  }
  function setStatus(text,tone='info'){let b=$('ulchovSheetStatus');if(!b){b=document.createElement('div');b.id='ulchovSheetStatus';document.querySelector('.header')?.insertAdjacentElement('afterend',b)}b.className=`ulchov-sheet-status ${tone}`;b.textContent=text}
  function injectStyle(){if($('ulchovSheetsStyle'))return;const s=document.createElement('style');s.id='ulchovSheetsStyle';s.textContent=`.ulchov-sheet-status{position:relative;z-index:2;margin:14px auto 0;max-width:1180px;border:1px solid rgba(0,212,255,.24);background:rgba(5,13,26,.78);color:#bfefff;border-radius:16px;padding:12px 16px;font-size:13px}.ulchov-sheet-status.ok{border-color:rgba(0,204,102,.42);color:#c8ffe1;background:rgba(0,80,52,.18)}.ulchov-sheet-status.warn{border-color:rgba(255,170,0,.42);color:#ffe6a3;background:rgba(120,80,0,.16)}.ulchov-sheet-status.bad{border-color:rgba(255,68,68,.45);color:#ffcaca;background:rgba(120,0,0,.16)}.ulchov-settings-btn{border:1px solid rgba(0,212,255,.32);background:rgba(0,212,255,.10);color:#dffaff;border-radius:12px;padding:9px 13px;font-weight:800;cursor:pointer;font-family:'Exo 2',sans-serif}.ulchov-nav-card{min-height:174px;justify-content:center;border-color:rgba(0,212,255,.25);background:linear-gradient(145deg,rgba(13,31,53,.96),rgba(9,23,42,.96))}.ulchov-nav-card .sub-icon{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:rgba(0,212,255,.10);border:1px solid rgba(0,212,255,.24)}`;document.head.appendChild(s)}

  function openSettings(){ setStatus('Google Sheets sozlamalari Workspace Settings boʻlimida boshqariladi.','sync'); }
  function clearSettings(){ setStatus('Workspace sozlamalarini faqat Administrator oʻzgartirishi mumkin.','warn'); }
  function color(b){if(typeof window.getBrandColor==='function')return window.getBrandColor(b);const k=String(b||'').toLowerCase();if(k.includes('wika'))return'#00aaff';if(k.includes('физ'))return'#00cc66';if(k.includes('полит'))return'#ffaa00';if(k.includes('метран'))return'#aa44ff';if(k.includes('росма'))return'#ff4444';if(k.includes('темпу'))return'#ff6600';return'#00d4ff'}
  function devIcon(n){if(typeof window.getDeviceIcon==='function')return window.getDeviceIcon(n);const k=String(n||'').toLowerCase();if(k.includes('темп'))return'🌡️';if(k.includes('уров'))return'📏';if(k.includes('дат'))return'📡';return'⚙️'}
  function brandIcon(b){return typeof window.getBrandIcon==='function'?window.getBrandIcon(b):'◆'}
  function setPageTitle(){const title=document.querySelector('#page-pasport .pasport-title');if(title)title.textContent=`${ICONS[appState.activeMenu]||'📋'} ${appState.activeMenu}`;const countLabel=document.querySelector('#page-pasport .pasport-header div div:nth-child(2)');if(countLabel)countLabel.childNodes[0].textContent='ASOSIY VAROQ: '+(settings().sheetName||'—')+' · Барча маълумотлар — '}
  function clearCards(t){const g=$('cards-grid');if($('total-count'))$('total-count').textContent='0';if($('summary-row'))$('summary-row').innerHTML='';if(g)g.innerHTML=`<div class="empty-state"><div class="icon">⚙️</div><p>${esc(t)}</p></div>`}
  function updateFilters(data){const brands=[...new Set(data.map(x=>x.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b));const locs=[...new Set(data.map(x=>x.location).filter(Boolean))].sort((a,b)=>a.localeCompare(b));if($('filter-brand'))$('filter-brand').innerHTML='<option value="">Барча брендлар</option>'+brands.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');if($('filter-location'))$('filter-location').innerHTML='<option value="">Барча ҳудудлар</option>'+locs.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}
  function renderSummary(data){const r=$('summary-row');if(!r)return;const c={};data.forEach(x=>{c[x.brand]=(c[x.brand]||0)+1});r.innerHTML=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([b,n])=>`<div class="summary-chip"><div class="chip-dot" style="background:${color(b)}"></div><span>${esc(b)}</span><span class="num" style="color:${color(b)}">${n}</span></div>`).join('')}
  function renderCards(data){setPageTitle();const g=$('cards-grid');if($('total-count'))$('total-count').textContent=data.length;if(!g)return;if(!data.length)return clearCards('Ҳеч нарса топилмади. Қидирув шартларини ўзгартиринг.');g.innerHTML=data.map(x=>{const c=color(x.brand),wc=String(x.work||'').toLowerCase().includes('то-2')||String(x.work||'').toLowerCase().includes('to-2')?'work-to2':'work-akt',u=`https://drive.google.com/drive/search?q=${encodeURIComponent(x.serial||x.name||'')}`;return `<div class="instrument-card" style="--card-color:${c}"><div class="card-top"><div><div class="pos-label">ПОЗИЦИЯ</div><div class="pos-badge">${esc(x.pos||'—')}</div></div><div style="text-align:center"><div style="font-size:32px">${esc(devIcon(x.name))}</div></div><div style="text-align:right"><div class="card-brand"><div class="brand-badge" style="background:${c}">${esc(x.brand||'Бошқа')}</div></div><div style="font-size:18px;margin-top:4px">${esc(brandIcon(x.brand))}</div></div></div><div class="card-body"><div class="card-name">${esc(x.name||'Асбоб')}</div><div class="serial-row"><div class="serial-label">ЗАВОД РАҚАМИ</div><div class="serial-val">${esc(x.serial||'—')}</div></div><div class="card-info"><div class="info-item"><div class="info-label">Ўлчов диап.</div><div class="info-value">${esc(x.range||'—')}</div></div><div class="info-item"><div class="info-label">Хизмат тури</div><div class="info-value">${esc(x.work||'—')}</div></div></div><div><span class="location-tag">📍 ${esc(x.location||'—')}</span><span class="work-tag ${wc}">${esc(x.work||'—')}</span></div><div style="height:10px"></div><a href="${u}" target="_blank" rel="noopener" class="pdf-btn">📄 Паспортни кўриш</a></div></div>`}).join('')}
  function filterCards(){const q=($('search-input')?.value||'').toLowerCase(),b=$('filter-brand')?.value||'',l=$('filter-location')?.value||'';const data=appState.instruments.filter(x=>{const h=`${x.pos} ${x.name} ${x.brand} ${x.serial} ${x.range} ${x.location} ${x.work}`.toLowerCase();return(!q||h.includes(q))&&(!b||x.brand===b)&&(!l||x.location===l)});renderSummary(data);renderCards(data)}
  async function loadSheet(openAfter=false){const s=settings();if(!hasSettings()){clearCards('Workspace sozlamalari kiritilmagan.');setStatus('Workspace Google Sheets sozlamalari kiritilmagan.','warn');return false}try{setStatus(`${appState.activeMenu}: ASOSIY VAROQ маълумотлари юкланмоқда...`,'warn');const d=await post('/api/ulchov/instruments',s);appState.instruments=d.instruments||[];appState.loaded=true;appState.loadedSheet=s.sheetName;updateFilters(appState.instruments);renderSummary(appState.instruments);renderCards(appState.instruments);setStatus(`${appState.activeMenu}: ${appState.instruments.length} та маълумот юкланди. ASOSIY VAROQ: ${d.sheetName}`,'ok');if(openAfter)showConfiguredPage();return true}catch(e){appState.instruments=[];appState.loaded=false;appState.loadedSheet='';clearCards(e.message);setStatus(e.message,'bad');return false}}
  async function get(path){
    const headers={'Content-Type':'application/json'};
    const wId=workspaceId();
    const wToken=workspaceToken();
    if(wId) headers['x-workspace-id']=wId;
    if(wToken) headers['Authorization']=`Bearer ${wToken}`;
    const token=sessionStorage.getItem(ADMIN_TOKEN_KEY) || pget('sessionStorage', ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY) || pget('localStorage', ADMIN_TOKEN_KEY);
    if(token&&!wToken) headers['Authorization']=`Bearer ${token}`;

    const r=await fetch(path,{method:'GET',headers});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.error||d.ok===false)throw new Error(d.error||`HTTP ${r.status}`);
    return d;
  }
  async function loadWorkspaceContext(){
    const wId=workspaceId();
    if(!wId) return null;
    try {
      const d=await get(`/api/workspaces/${wId}`);
      if(d.workspace) {
        window.state = window.state || {};
        window.state.workspace = d.workspace;
      }
      return d.workspace;
    } catch(e) {
      return null;
    }
  }

  function showConfiguredPage(){if(typeof window.goPage==='function')window.goPage('pasport');setPageTitle();renderSummary(appState.instruments);renderCards(appState.instruments)}
  async function openConfiguredMenu(menuName){appState.activeMenu=menuName;appState.loaded=false;const wanted=sheetFor(menuName);if(!wanted){setStatus(`${menuName} учун ASOSIY VAROQ киритилмаган.`,'bad');return}if(!hasSettings()){clearCards('Workspace sozlamalari kiritilmagan.');setStatus(`${menuName} учун аввал Google Sheets созламаларини киритинг.`,'warn');return}const ok=await loadSheet(false);if(ok)showConfiguredPage()}
  function patchCards(){const grid=document.querySelector('#page-submenu .submenu-grid');if(!grid||grid.dataset.ulchovPatched==='true')return;Array.from(grid.children).forEach(ch=>ch.remove());MENU_ORDER.forEach(name=>{const b=document.createElement('button');b.type='button';b.className='sub-card ulchov-nav-card';b.innerHTML=`<div class="sub-icon">${ICONS[name]}</div><h3>${esc(name)}</h3><p>${esc(DESCS[name])}</p>`;b.onclick=()=>openConfiguredMenu(name);grid.appendChild(b)});grid.dataset.ulchovPatched='true'}
  function fixText(){[document.querySelector('.stats-bar'),document.querySelector('#page-main'),document.querySelector('#page-pasport')].filter(Boolean).forEach(root=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))n.nodeValue=n.nodeValue.replace(/аслоб/g,'асбоб').replace(/Аслоб/g,'Асбоб')})}
  async function setup(){
    injectStyle();
    const st=document.querySelector('.stats-bar');
    if(st&&!$('ulchovOpenSettingsBtn')){
      const b=document.createElement('button');
      b.id='ulchovOpenSettingsBtn';b.type='button';b.className='ulchov-settings-btn';
      b.textContent='⚙️ Созламалар';b.onclick=openSettings;
      st.appendChild(b);
    }
    patchCards();
    fixText();
    window.filterCards=filterCards;
    window.goPasport=()=>openConfiguredMenu('ПАСПОРТ МАНОМЕТР');
    
    if(workspaceMode() && !window.state?.workspace) {
      await loadWorkspaceContext();
    }
    
    if(!hasSettings()) setStatus('Workspace Google Sheets созламалари киритилмаган.','warn');
  }
  
  // Listen for Workspace context updates!
  window.addEventListener('message', async (event) => {
    if (event.data?.type === 'SEG_KIP_WORKSPACE_CHANGE') {
      window.state = window.state || {};
      window.state.workspace = event.data.workspace;
      if (hasSettings()) {
        await loadSheet();
      }
    }
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
  window.UlchovSheets={openSettings,clearSettings,loadSheet,openConfiguredMenu,state:appState};
})();
