(function installSegAppLoader(){
  if (window.__segAppLoaderInstalled) return;
  window.__segAppLoaderInstalled = true;

  const root = () => document.getElementById('segAppLoader');
  const FRAME_FILES = [
    '/assets/loader/pumpjack-frame-1.b64',
    '/assets/loader/pumpjack-frame-2.b64',
    '/assets/loader/pumpjack-frame-3.b64'
  ];
  const FRAME_ORDER = [0,1,2,1];
  const FRAME_DELAY = 220;

  let frameSources = [];
  let hydratePromise = null;
  let frameTimer = null;
  let frameCursor = 0;
  let hidden = false;

  async function loadFrame(path){
    const response = await fetch(path, { cache:'force-cache' });
    if (!response.ok) throw new Error('Pumpjack frame load failed: '+response.status);
    const b64 = (await response.text()).replace(/\s+/g,'');
    if (!b64) throw new Error('Pumpjack frame is empty.');
    const src = 'data:image/webp;base64,' + b64;
    await new Promise((resolve,reject)=>{
      const image = new Image();
      image.onload = resolve;
      image.onerror = () => reject(new Error('Pumpjack frame decode failed.'));
      image.src = src;
    });
    return src;
  }

  async function hydratePumpFrames(){
    const image = document.getElementById('segLoaderPumpImg');
    const stage = document.getElementById('segLoaderPumpStage');
    if (!image || !stage) return [];
    if (frameSources.length) return frameSources;
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      try {
        frameSources = await Promise.all(FRAME_FILES.map(loadFrame));
        image.src = frameSources[0];
        stage.classList.add('is-ready');
        stage.classList.remove('is-error');
        return frameSources;
      } catch (error) {
        console.error('[loader] pumpjack image failed', error);
        stage.classList.add('is-error');
        return [];
      }
    })();

    return hydratePromise;
  }

  function stopPumpFrames(){
    if (frameTimer){
      window.clearInterval(frameTimer);
      frameTimer = null;
    }
  }

  function startPumpFrames(){
    const image = document.getElementById('segLoaderPumpImg');
    if (!image || frameSources.length < 3) return;
    stopPumpFrames();
    frameCursor = 0;
    image.src = frameSources[FRAME_ORDER[frameCursor]];
    frameTimer = window.setInterval(() => {
      frameCursor = (frameCursor + 1) % FRAME_ORDER.length;
      image.src = frameSources[FRAME_ORDER[frameCursor]];
    }, FRAME_DELAY);
  }

  function setStatus(message){
    const el = document.getElementById('segAppLoaderStatus');
    if (el && message) el.textContent = String(message);
  }

  async function show(message){
    hidden = false;
    const el = root();
    if (!el) return;

    if (message) setStatus(message);
    el.style.display = 'grid';
    el.classList.remove('is-hidden');
    el.setAttribute('aria-hidden', 'false');

    await hydratePumpFrames();
    if (!hidden) startPumpFrames();
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

  void hydratePumpFrames().then(() => {
    if (!hidden) startPumpFrames();
  });

  window.segAppLoader = { show, hide, setStatus };
})();
