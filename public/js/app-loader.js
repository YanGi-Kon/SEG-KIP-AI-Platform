(function installSegAppLoader(){
  if (window.__segAppLoaderInstalled) return;
  window.__segAppLoaderInstalled = true;

  const root = () => document.getElementById('segAppLoader');
  const sourceImage = () => document.getElementById('segLoaderPumpSource');
  const canvas = () => document.getElementById('segLoaderPumpCanvas');
  const stage = () => document.getElementById('segLoaderPumpStage');

  const PUMP_SOURCE = '/assets/loader/pump_jack.gif';
  const FRAME_DELAY = 80;
  let paintTimer = null;
  let hidden = false;

  function chromaKeyFrame(){
    const img = sourceImage();
    const out = canvas();
    const st = stage();
    if (!img || !out || !st || !img.complete || !img.naturalWidth) return false;

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (out.width !== w || out.height !== h){
      out.width = w;
      out.height = h;
    }

    const ctx = out.getContext('2d', { willReadFrequently:true });
    if (!ctx) return false;

    ctx.clearRect(0,0,w,h);
    ctx.drawImage(img,0,0,w,h);

    try {
      const frame = ctx.getImageData(0,0,w,h);
      const p = frame.data;

      for (let i=0; i<p.length; i+=4){
        const r=p[i], g=p[i+1], b=p[i+2];
        const hi=Math.max(r,g,b), lo=Math.min(r,g,b);
        const neutral=(hi-lo)<=10;

        // The source GIF has a light grey/white preview checkerboard.
        // Remove only those near-neutral light pixels; pumpjack colours stay intact.
        if (neutral && lo>=218){
          p[i+3]=0;
        } else if (neutral && lo>=202){
          p[i+3]=Math.min(p[i+3], Math.max(0, Math.round((218-lo)*16)));
        }
      }

      ctx.putImageData(frame,0,0);
      st.classList.add('is-ready');
      st.classList.remove('is-error');
      return true;
    } catch (error) {
      console.error('[loader] transparent canvas render failed', error);
      st.classList.add('is-error');
      return false;
    }
  }

  function stopPump(){
    if (paintTimer){
      window.clearInterval(paintTimer);
      paintTimer=null;
    }
  }

  function startPump(){
    const img=sourceImage();
    if (!img) return;

    const begin=()=>{
      chromaKeyFrame();
      stopPump();
      paintTimer=window.setInterval(chromaKeyFrame, FRAME_DELAY);
    };

    if (img.complete && img.naturalWidth) begin();
    else img.addEventListener('load', begin, { once:true });

    img.addEventListener('error', ()=>{
      const st=stage();
      if (st) st.classList.add('is-error');
      console.error('[loader] pumpjack source GIF failed to load:', PUMP_SOURCE);
    }, { once:true });
  }

  function setStatus(message){
    const el=document.getElementById('segAppLoaderStatus');
    if (el && message) el.textContent=String(message);
  }

  function show(message){
    hidden=false;
    const el=root();
    if (!el) return;
    if (message) setStatus(message);
    el.style.display='grid';
    el.classList.remove('is-hidden');
    el.setAttribute('aria-hidden','false');
    startPump();
  }

  function hide(){
    if (hidden) return;
    hidden=true;
    stopPump();
    const el=root();
    if (!el) return;
    el.classList.add('is-hidden');
    el.setAttribute('aria-hidden','true');
    window.setTimeout(()=>{ if(hidden) el.style.display='none'; },420);
  }

  window.addEventListener('seg:auth-ready',hide,{once:true});
  window.addEventListener('seg:login-ready',hide,{once:true});
  window.setTimeout(()=>{ if(!hidden) hide(); },12000);

  const img=sourceImage();
  if (img && img.getAttribute('src')!==PUMP_SOURCE) img.src=PUMP_SOURCE;
  startPump();

  window.segAppLoader={show,hide,setStatus};
})();
