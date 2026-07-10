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
  function injectEmailUxStyles(){
    if(document.getElementById('actsEmailUxStyles'))return;
    const s=document.createElement('style');
    s.id='actsEmailUxStyles';
    s.textContent='.email-diagnostic-card{margin:12px 0;padding:14px 16px;border-radius:14px;border:1px solid rgba(239,68,68,.35);background:rgba(127,29,29,.18);color:#fecaca;font-size:13px;line-height:1.5}.email-diagnostic-card.ok{border-color:rgba(34,197,94,.35);background:rgba(20,83,45,.16);color:#bbf7d0}.email-diagnostic-title{font-weight:900;color:#fff;margin-bottom:8px}.email-diagnostic-row{margin:4px 0}.email-diagnostic-fix{margin-top:10px;padding:10px;border-radius:10px;background:rgba(15,23,42,.55);color:#fde68a}.status-badge{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;font-weight:800;font-size:12px;white-space:nowrap}.status-error{color:#fecaca;background:rgba(239,68,68,.18);border:1px solid rgba(239,68,68,.35)}.status-approved{color:#bbf7d0;background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.35)}.status-pending{color:#fef3c7;background:rgba(245,158,11,.16);border:1px solid rgba(245,158,11,.35)}.email-detail-btn{margin-left:6px;padding:5px 8px;border-radius:9px;border:1px solid rgba(34,211,238,.28);background:rgba(255,255,255,.06);color:#dffbff;font-weight:800;cursor:pointer;font-size:11px}';
    document.head.appendChild(s);
  }
  function emailCodeMessage(item,result){
    const code=item?.code||'';
    const raw=String((item?.error||'')+' '+(item?.providerMessage||'')+' '+(result?.warning||'')).toLowerCase();
    const providerStatus=String(item?.providerStatus||'');
    if(code==='EMAIL_PROVIDER_RECIPIENT_NOT_ALLOWED')return 'Resend test rejimi bu qabul qiluvchiga yubora olmaydi.';
    if(code==='EMAIL_AUTH_FAILED'&&providerStatus==='403')return 'Resend ruxsat bermadi: sender yoki domen tasdiqlanishi kerak.';
    if(code==='EMAIL_AUTH_FAILED'&&/(domain|verify|testing|recipient|from)/i.test(raw))return 'Resend ruxsat bermadi: domen/recipient tasdiqlanishi kerak.';
    const map={
      EMAIL_INVALID_RECIPIENT:'Gmail manzil noto‘g‘ri yoki to‘liq emas.',
      EMAIL_DOMAIN_NOT_VERIFIED:'Email domen tasdiqlanmagan.',
      EMAIL_AUTH_FAILED:'Resend API key noto‘g‘ri yoki bekor qilingan.',
      EMAIL_RATE_LIMITED:'Email provider vaqtincha rate-limitga tushdi.',
      EMAIL_SEND_TIMEOUT:'Email provider javob bermadi.',
      EMAIL_HTTP_FAILED:'Email provider xatosi.'
    };
    return map[code]||item?.error||'Email yuborishda xatolik.';
  }
  function recommendedFix(result,item){
    if(result?.recommendedFix)return result.recommendedFix;
    if(item?.code==='EMAIL_PROVIDER_RECIPIENT_NOT_ALLOWED')return 'Resend’da domain verification qiling. Keyin Railway Variables’da EMAIL_FROM=noreply@verified-domain.uz qiling.';
    if(item?.code==='EMAIL_DOMAIN_NOT_VERIFIED')return 'Resend’da domain verification qiling va EMAIL_FROM ni verified domain emailiga almashtiring.';
    if(item?.code==='EMAIL_AUTH_FAILED')return 'Railway Variables’da email provider kalitini tekshiring va redeploy qiling.';
    if(item?.code==='EMAIL_INVALID_RECIPIENT')return 'Imzolovchi Gmail manzilini to‘liq formatda kiriting: name@gmail.com.';
    return 'Email provider sozlamasini tekshiring.';
  }
  function clearEmailDiagnostics(){document.getElementById('actsEmailDiagnostics')?.remove()}
  function showEmailDiagnostics(result){
    clearEmailDiagnostics();
    const failed=(result?.results||[]).filter(x=>x.status==='email-failed');
    if(!failed.length)return;
    const first=failed[0];
    const box=document.createElement('div');
    box.id='actsEmailDiagnostics';
    box.className='email-diagnostic-card error';
    const rows=failed.slice(0,4).map(item=>'<div class="email-diagnostic-row"><b>Imzolovchi:</b> '+esc(item.signer||'-')+'</div><div class="email-diagnostic-row"><b>Gmail:</b> '+esc(item.gmail||'-')+'</div><div class="email-diagnostic-row"><b>Sabab:</b> '+esc(emailCodeMessage(item,result))+'</div>').join('');
    box.innerHTML='<div class="email-diagnostic-title">Email yuborilmadi</div><div class="email-diagnostic-row"><b>Hujjat:</b> '+esc(result.actNo||'-')+'</div><div class="email-diagnostic-row"><b>Provider:</b> '+esc(result.provider||'resend')+' · '+esc(result.fromMode||'')+'</div>'+rows+'<div class="email-diagnostic-fix"><b>Yechim:</b> '+esc(recommendedFix(result,first))+'</div>';
    const host=document.getElementById('reports');
    if(!host)return;
    const anchor=host.querySelector('.subtabs')||host.querySelector('.tablewrap')||host.firstChild;
    host.insertBefore(box,anchor?.nextSibling||anchor||null);
  }
  function statusClass(value){
    const v=String(value||'').toLowerCase();
    if(v.includes('email')||v.includes('юборилмади'))return 'status-error';
    if(v.includes('тасдиқ')||v.includes('tasdiq'))return 'status-approved';
    return 'status-pending';
  }
  function decorateReportStatuses(){
    document.querySelectorAll('#dailyRows tr').forEach(tr=>{
      const cells=tr.children;if(cells.length<8||tr.querySelector('td[colspan]'))return;
      const cell=cells[7];
      const text=cell.innerText.trim();
      if(!text||cell.querySelector('.status-badge'))return;
      cell.innerHTML='<span class="status-badge '+statusClass(text)+'">'+esc(text)+'</span>';
      if(text.toLowerCase().includes('email')){
        const btn=document.createElement('button');
        btn.type='button';btn.className='email-detail-btn';btn.textContent='Batafsil';
        btn.onclick=()=>{const data=window.__lastActsEmailResult;if(data)showEmailDiagnostics(data);else setStatus('Bu xato uchun batafsil diagnostika mavjud emas. Hujjatni qayta yuborib tekshiring.','bad')};
        cell.appendChild(btn);
      }
    });
  }
  async function sendDoc(actNo){
    const no=unref(actNo);
    if(!no)return setStatus('Акт рақами топилмади.','bad');
    if(!confirm(no+' ҳужжатини барча имзо чекувчиларга Gmail орқали юборишни тасдиқлайсизми?'))return;
    try{
      clearEmailDiagnostics();
      setStatus(no+' имзоловчиларга юборилмоқда...','sync');
      const result=await api(root()+'/documents/send',{method:'POST',body:JSON.stringify({actNo:no,sentBy:'KIP Administrator'})});
      window.__lastActsEmailResult=result;
      const results=result.results||[];
      const sent=Number.isFinite(Number(result.sent))?Number(result.sent):results.filter(x=>x.status==='sent').length;
      const failed=Number.isFinite(Number(result.failed))?Number(result.failed):results.filter(x=>x.status==='email-failed').length;
      const synced=result.signersSynced?(' · '+result.signersSynced+' imzolovchi sinxronlandi'):'';
      if(sent===0&&failed>0){
        setStatus(no+': email yuborilmadi. Ҳолат: '+(result.status||'Email xatosi'),'bad');
        showEmailDiagnostics(result);
        await window.ActsUI?.loadReports?.();
        setTimeout(decorateReportStatuses,80);
        return;
      }
      if(failed>0)showEmailDiagnostics(result);
      setStatus(no+': '+sent+' ta Gmail yuborildi'+(failed?', '+failed+' ta xatolik':'')+synced+'. Ҳолат: '+(result.status||'Кутилмоқда'),failed?'sync':'ok');
      await window.ActsUI?.loadReports?.();
      setTimeout(decorateReportStatuses,80);
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
    injectEmailUxStyles();
    if(!window.ActsUI)return false;
    if(!window.ActsUI.__workspaceReportsDecorated){
      const originalLoad=window.ActsUI.loadReports;
      if(typeof originalLoad==='function'){
        window.ActsUI.loadReports=async function(...args){const out=await originalLoad.apply(this,args);setTimeout(decorateReportStatuses,60);return out};
        window.ActsUI.__workspaceReportsDecorated=true;
      }
    }
    if(window.ActsUI.__workspaceDocumentsPatched)return true;
    window.ActsUI.sendDoc=sendDoc;
    window.ActsUI.openExcel=exportReportsExcel;
    window.ActsUI.showEmailDiagnostics=showEmailDiagnostics;
    window.ActsUI.__workspaceDocumentsPatched=true;
    setTimeout(decorateReportStatuses,100);
    return true;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(!patch()){const t=setInterval(()=>{if(patch())clearInterval(t)},100);setTimeout(()=>clearInterval(t),8000)}});else{if(!patch()){const t=setInterval(()=>{if(patch())clearInterval(t)},100);setTimeout(()=>clearInterval(t),8000)}}
})();
