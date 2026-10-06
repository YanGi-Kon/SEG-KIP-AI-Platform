(function localStateTransfer(){
  'use strict';
  const status=document.getElementById('transferStatus');
  const transfer=document.getElementById('transferButton');
  const home=document.getElementById('homeButton');
  const localHosts=new Set(['localhost','127.0.0.1']);
  const sourcePorts=new Set(['3002']);
  const targetPorts=new Set(['3001']);
  const blocked=/(token|password|secret|credential|service.?account|private.?key|chat.?history)/i;
  const exact=new Set(['sidebarCollapsed','spreadsheetUrl','currentLang']);
  const prefixes=['seg_kip_','acts_','ulchov_','to_','faults_','hisobot_','kuduk_'];
  const allowed=key=>!blocked.test(key)&&(exact.has(key)||prefixes.some(prefix=>key.startsWith(prefix)));
  const show=(text,tone='')=>{status.textContent=text;status.className=`status ${tone}`;};
  function encode(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value));
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decode(value){
    const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
    const binary=atob(normalized+'='.repeat((4-normalized.length%4)%4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,char=>char.charCodeAt(0))));
  }
  if(!localHosts.has(location.hostname))return show('Bu sahifa faqat localhost uchun.','bad');
  if(sourcePorts.has(location.port)){
    const entries={};
    for(let index=0;index<localStorage.length&&Object.keys(entries).length<200;index++){
      const key=localStorage.key(index);if(!key||!allowed(key))continue;
      const value=localStorage.getItem(key);if(value!==null&&value.length<=20000)entries[key]=value;
    }
    show(`${Object.keys(entries).length} ta xavfsiz lokal sozlama topildi.`);
    transfer.hidden=false;
    transfer.onclick=()=>{
      try{
        const payload=encode({version:1,createdAt:new Date().toISOString(),entries});
        if(payload.length>100000)throw new Error('Sozlamalar hajmi ko‘chirish chegarasidan oshdi.');
        transfer.disabled=true;show('3001 ga o‘tilmoqda…');
        location.href=`http://localhost:3001/local-state-transfer.html#${payload}`;
      }catch(error){transfer.disabled=false;show(error.message,'bad');}
    };
    return;
  }
  if(targetPorts.has(location.port)){
    const payload=location.hash.slice(1);
    if(!payload){show('3002 dagi ko‘chirish sahifasidan boshlang.','bad');return;}
    try{
      const data=decode(payload);
      if(data?.version!==1||!data.entries||typeof data.entries!=='object')throw new Error('Ko‘chirish ma’lumoti yaroqsiz.');
      let count=0;
      for(const [key,value] of Object.entries(data.entries)){
        if(!allowed(key)||typeof value!=='string'||value.length>20000)continue;
        localStorage.setItem(key,value);count++;
      }
      history.replaceState(null,'',location.pathname);
      show(`${count} ta sozlama 3001 ga muvaffaqiyatli ko‘chirildi.`, 'ok');
      home.hidden=false;
    }catch(error){show(`Ko‘chirish bajarilmadi: ${error.message}`,'bad');}
    return;
  }
  show('Sahifani localhost:3002 yoki localhost:3001 orqali oching.','bad');
})();
