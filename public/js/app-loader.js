(function installSegAppLoader(){
  if (window.__segAppLoaderInstalled) return;
  window.__segAppLoaderInstalled = true;

  const root = () => document.getElementById('segAppLoader');
  const FRAME_PARTS = [
    '/assets/loader/frames/frame-1-0.txt',
    '/assets/loader/frames/frame-1-1.txt',
    '/assets/loader/frames/frame-1-2.txt',
  ];

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
    if (frameSources.length) return frameSources;
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      try {
        const parts = await Promise.all(FRAME_PARTS.map(async (url) => {
          const response = await fetch(url, { cache:'no-store' });
          if (!response.ok) throw new Error('loader part ' + response.status + ': ' + url);
          return (await response.text()).trim();
        }));
        const src = 'data:image/webp;base64,' + parts.join('');
        await preload(src);
        frameSources = [src];
        image.src = src;
        stage.classList.add('is-ready');
        return frameSources;
      } catch (error) {
        console.error('[loader] pumpjack image failed', error);
        stage.classList.add('is-error');
        return [];
      }
    })();

    return hydratePromise;
  }

  function stopPumpFrames(){}

  function startPumpFrames(){
    const image = document.getElementById('segLoaderPumpImg');
    if (image && frameSources[0]) image.src = frameSources[0];
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
