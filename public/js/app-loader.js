(function installSegAppLoader(){
  if (window.__segAppLoaderInstalled) return;
  window.__segAppLoaderInstalled = true;

  const root = () => document.getElementById('segAppLoader');
  const FRAME_URLS = [
    '/assets/loader/pumpjack-frame-1.b64',
    '/assets/loader/pumpjack-frame-2.b64',
    '/assets/loader/pumpjack-frame-3.b64',
  ];
  const FRAME_SEQUENCE = [0, 1, 2, 1];

  let frameSources = [];
  let hydratePromise = null;
  let frameTimer = null;
  let frameCursor = 0;
  let hidden = false;

  function preload(src){
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(src);
      image.onerror = () => reject(new Error('Pumpjack frame preload failed.'));
      image.src = src;
    });
  }

  async function hydratePumpFrames(){
    const image = document.getElementById('segLoaderPumpImg');
    const stage = document.getElementById('segLoaderPumpStage');
    if (!image || !stage) return [];
    if (frameSources.length === FRAME_URLS.length) return frameSources;
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      try {
        const encodedFrames = await Promise.all(FRAME_URLS.map(async (url) => {
          const response = await fetch(url, { cache:'no-store' });
          if (!response.ok) throw new Error('loader frame ' + response.status);
          return (await response.text()).trim();
        }));
        const sources = encodedFrames.map((value) => 'data:image/webp;base64,' + value);
        await Promise.all(sources.map(preload));
        frameSources = sources;
        image.src = frameSources[0];
        stage.classList.add('is-ready');
        return frameSources;
      } catch (error) {
        console.warn('[loader] pumpjack frames failed', error);
        return [];
      }
    })();

    return hydratePromise;
  }

  function stopPumpFrames(){
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
  }

  function renderPumpFrame(){
    const image = document.getElementById('segLoaderPumpImg');
    if (!image || !frameSources.length) return;
    const sourceIndex = FRAME_SEQUENCE[frameCursor] ?? 0;
    image.src = frameSources[sourceIndex] || frameSources[0];
  }

  function startPumpFrames(){
    const image = document.getElementById('segLoaderPumpImg');
    if (!image || frameSources.length < 3) return;
    stopPumpFrames();
    frameCursor = 0;
    renderPumpFrame();

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    frameTimer = setInterval(() => {
      frameCursor = (frameCursor + 1) % FRAME_SEQUENCE.length;
      renderPumpFrame();
    }, 360);
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
