(function installSegAppLoader(){
  if (window.__segAppLoaderInstalled) return;
  window.__segAppLoaderInstalled = true;

  const root = () => document.getElementById('segAppLoader');
  const image = () => document.getElementById('segLoaderPumpImg');
  const stage = () => document.getElementById('segLoaderPumpStage');

  const FRAME_FILES = [
    '/assets/loader/pumpjack-frame-1.webp',
    '/assets/loader/pumpjack-frame-2.webp',
    '/assets/loader/pumpjack-frame-3.webp'
  ];
  const FRAME_ORDER = [0,1,2,1];
  const FRAME_DELAY = 220;

  let frameTimer = null;
  let frameCursor = 0;
  let hidden = false;

  function preloadFrames(){
    FRAME_FILES.forEach((src)=>{
      const pre = new Image();
      pre.src = src;
    });
  }

  function stopPumpFrames(){
    if (frameTimer){
      window.clearInterval(frameTimer);
      frameTimer = null;
    }
  }

  function startPumpFrames(){
    const img = image();
    const st = stage();
    if (!img || !st) return;
    stopPumpFrames();
    frameCursor = 0;
    img.src = FRAME_FILES[FRAME_ORDER[frameCursor]];
    st.classList.add('is-ready');

    frameTimer = window.setInterval(() => {
      frameCursor = (frameCursor + 1) % FRAME_ORDER.length;
      img.src = FRAME_FILES[FRAME_ORDER[frameCursor]];
    }, FRAME_DELAY);
  }

  function setStatus(message){
    const el = document.getElementById('segAppLoaderStatus');
    if (el && message) el.textContent = String(message);
  }

  function show(message){
    hidden = false;
    const el = root();
    if (!el) return;
    if (message) setStatus(message);
    el.style.display = 'grid';
    el.classList.remove('is-hidden');
    el.setAttribute('aria-hidden', 'false');
    startPumpFrames();
  }

  function hide(){
    if (hidden) return;
    hidden = true;
    stopPumpFrames();

    const el = root();
    if (!el) return;
    el.classList.add('is-hidden');
    el.setAttribute('aria-hidden', 'true');

    window.setTimeout(() => {
      if (hidden) el.style.display = 'none';
    }, 420);
  }

  window.addEventListener('seg:auth-ready', hide, { once:true });
  window.addEventListener('seg:login-ready', hide, { once:true });

  window.setTimeout(() => {
    if (!hidden) hide();
  }, 12000);

  preloadFrames();
  startPumpFrames();

  window.segAppLoader = { show, hide, setStatus };
})();
