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
  function emailCodeMessage(code){
    const map={
      EMAIL_INVALID_RECIPIENT:'Gmail manzil noto‘g‘ri yoki to‘liq emas.',
      EMAIL_PROVIDER_RECIPIENT_NOT_ALLOWED:'Resend test rejimi bu qabul qiluvchiga yuborishga ruxsat bermadi.',
      EMAIL_DOMAIN_NOT_VERIFIED:'Email domen tasdiqlanmagan. Resend’da domain verification qiling.',
      EMAIL_AUTH_FAILED:'Email provider kaliti noto‘g‘ri yoki bekor qilingan.',
      EMAIL_SEND_TIMEOUT:'Email provider javob bermadi.',
      EMAIL_HTTP_FAILED:'Email provider xatosi.'
    };
    return map[code]||'';
  }
  function failedText(item){
    const who=[item.signer,item.gmail].filter(Boolean).join(' / ');
    const reason=emailCodeMessage(item.code)||item.error||'Email yuborishda xatolik.';
    return (who?who+' — ':'')+reason;
  }
  async function sendDoc(actNo){
    const no=unref(actNo);
    if(!no)return setStatus('Акт рақами топилмади.','bad');
    if(!confirm(no+' ҳужжатини барча имзо чекувчиларга Gmail орқали юборишни тасдиқлайсизми?'))return;
    try{
      setStatus(no+' имзоловчиларга юборилмоқда...','sync');
      const result=await api(root()+'/documents/send',{method:'POST',body:JSON.stringify({actNo:no,sentBy:'KIP Administrator'})});
      const results=result.results||[];
      const sent=Number.isFinite(Number(result.sent))?Number(result.sent):results.filter(x=>x.status==='sent').length;
      const failed=Number.isFinite(Number(result.failed))?Number(result.failed):results.filter(x=>x.status==='email-failed').length;
      const firstFailed=results.find(x=>x.status==='email-failed');
      const synced=result.signersSynced?(' · '+result.signersSynced+' imzolovchi sinxronlandi'):'';
      if(sent===0&&failed>0){
        setStatus(no+': email yuborilmadi. '+failedText(firstFailed)+synced+'. Ҳолат: '+(result.status||'Email xatosi'),'bad');
        await window.ActsUI?.loadReports?.();
        return;
      }
      const detail=failed&&firstFailed?(' · Xato: '+failedText(firstFailed)):'';
      setStatus(no+': '+sent+' ta Gmail yuborildi'+(failed?', '+failed+' ta xatolik':'')+synced+detail+'. Ҳолат: '+(result.status||'Кутилмоқда'),failed?'sync':'ok');
      await window.ActsUI?.loadReports?.();
    }catch(e){setStatus(e.message,'bad')}
  }
  function cellText(row,index){return String(row?.children?.[index]?.innerText||'').trim()}
  function exportReportsExcel(){
    const table=document.querySelector('#reports table');
    const rows=Array.from(document.querySelectorAll('#dailyRows tr')).filter(tr=>!tr.querySelector('td[colspan]'));
    if(!table||!rows.length){setStatus('Экспорт учун ҳисоботлар рўйхати йўқ. Аввал Хисоботлар бўлимини янгиланг.','bad');return;}
    const headers=['№','Akt raqami','Sana','Asbob nomi','Zavod raqami','Joy','Ijrochi','Holat'];
    const body=rows.map((tr,i)=>[i+1,cellText(tr,1),cellText(tr,2),cellText(tr,3),cellText(tr,4),cellText(tr,5),cellText(tr,6),cellText(tr,7)]);
    const html='<html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+body.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></body></html>';
    const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='SEG-KIP-Aktlar-Hisobotlar-'+new Date().toISOString().slice(0,10)+'.xls';
    document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
    setStatus('Excel ҳисобот экспорт қилинди.','ok');
  }
  function patch(){
    if(!window.ActsUI||window.ActsUI.__workspaceDocumentsPatched)return false;
    window.ActsUI.sendDoc=sendDoc;
    window.ActsUI.openExcel=exportReportsExcel;
    window.ActsUI.__workspaceDocumentsPatched=true;
    return true;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(!patch()){const t=setInterval(()=>{if(patch())clearInterval(t)},100);setTimeout(()=>clearInterval(t),8000)}});else{if(!patch()){const t=setInterval(()=>{if(patch())clearInterval(t)},100);setTimeout(()=>clearInterval(t),8000)}}
})();
