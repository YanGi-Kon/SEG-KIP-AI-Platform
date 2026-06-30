// SEG KIP ACTS workspace document-send bridge.
(function(){
  const AK='seg_kip_workspace_access_token', WK='seg_kip_selected_workspace_id';
  const SEND_TIMEOUT_MS=35000;
  const pget=(s,k)=>{try{return parent?.[s]?.getItem(k)||'';}catch{return'';}};
  const wid=()=>localStorage.getItem(WK)||pget('localStorage',WK)||'';
  const tok=()=>sessionStorage.getItem(AK)||pget('sessionStorage',AK)||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const unref=v=>{try{return decodeURIComponent(String(v||''));}catch{return String(v||'')}};
  function root(){const id=wid(); if(!id) throw new Error('Объект аниқланмади. Қайта login қилинг.'); return '/api/workspaces/'+encodeURIComponent(id);}
  function setStatus(text, cls=''){ if(window.ActsUI?.setStatus) window.ActsUI.setStatus(text,cls); else { const el=document.getElementById('actsStatus'); if(el) el.innerHTML='Ҳолат: <span class="'+cls+'">'+esc(text)+'</span>'; } }
  async function read(r){const t=await r.text(); if(!t)return{}; try{return JSON.parse(t)}catch{return{raw:t}}}
  async function refresh(){const r=await fetch('/api/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include'});const d=await read(r);if(!r.ok)throw new Error(d.error||'Session yangilanmadi');if(d.accessToken){sessionStorage.setItem(AK,d.accessToken);try{parent.sessionStorage.setItem(AK,d.accessToken)}catch{}}}
  async function api(path,opt={},retry=true){
    const h=new Headers(opt.headers||{});
    if(opt.body&&!h.has('Content-Type'))h.set('Content-Type','application/json');
    const t=tok();if(t)h.set('Authorization','Bearer '+t);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),SEND_TIMEOUT_MS);
    try{
      const r=await fetch(path,{...opt,headers:h,credentials:'include',signal:controller.signal});
      const d=await read(r);
      if(r.status===401&&retry){await refresh();return api(path,opt,false)}
      if(!r.ok||d.error)throw new Error(d.error||('HTTP '+r.status));
      return d;
    }catch(e){
      if(e?.name==='AbortError')throw new Error('Email yuborish juda uzoq davom etdi. Email yuborish sozlamalarini tekshiring.');
      throw e;
    }finally{clearTimeout(timer)}
  }
  async function sendDoc(actNo){
    const no=unref(actNo);
    if(!no)return setStatus('Акт рақами топилмади.','bad');
    if(!confirm(no+' ҳужжатини барча имзо чекувчиларга Gmail орқали юборишни тасдиқлайсизми?'))return;
    try{
      setStatus(no+' имзоловчиларга юборилмоқда...','sync');
      const result=await api(root()+'/documents/send',{method:'POST',body:JSON.stringify({actNo:no,sentBy:'KIP Administrator'})});
      const sent=(result.results||[]).filter(x=>x.status==='sent').length;
      const failed=(result.results||[]).filter(x=>x.status==='email-failed').length;
      const synced=result.signersSynced?(' · '+result.signersSynced+' imzolovchi sinxronlandi'):'';
      setStatus(no+': '+sent+' ta Gmail yuborildi'+(failed?', '+failed+' ta xatolik':'')+synced+'. Ҳолат: '+(result.status||'Кутилмоқда'),failed?'sync':'ok');
    }catch(e){setStatus(e.message,'bad')}
  }
  function patch(){ if(!window.ActsUI||window.ActsUI.__workspaceDocumentsPatched)return false; window.ActsUI.sendDoc=sendDoc; window.ActsUI.__workspaceDocumentsPatched=true; return true; }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(!patch()){const t=setInterval(()=>{if(patch())clearInterval(t)},100);setTimeout(()=>clearInterval(t),8000)}});else{if(!patch()){const t=setInterval(()=>{if(patch())clearInterval(t)},100);setTimeout(()=>clearInterval(t),8000)}}
})();
