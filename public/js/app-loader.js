(function installSegAppLoader(){
  if (window.__segAppLoaderInstalled) return;
  window.__segAppLoaderInstalled = true;

  const root = () => document.getElementById('segAppLoader');
  const PUMP_PARTS = [
    '/assets/loader/pumpjack-real-0.txt',
    '/assets/loader/pumpjack-real-1.txt',
    '/assets/loader/pumpjack-real-2.txt',
    '/assets/loader/pumpjack-real-3.txt',
  ];

  async function hydratePumpImage(){
    const stage = document.getElementById('segLoaderPumpStage');
    if (!stage || stage.dataset.ready === '1') return;
    try {
      const chunks = await Promise.all(PUMP_PARTS.map(async (url) => {
        const res = await fetch(url, { cache:'no-store' });
        if (!res.ok) throw new Error('loader asset ' + res.status);
        return (await res.text()).trim();
      }));
      const src = 'data:image/webp;base64,' + chunks.join('');
      stage.querySelectorAll('.seg-pump-layer').forEach((img) => { img.src = src; });
      stage.dataset.ready = '1';
      stage.classList.add('is-ready');
      startPumpFrames();
    } catch (error) {
      console.warn('[loader] realistic pumpjack asset failed', error);
    }
  }
  let hidden = false;
  let frameTimer = null;
  let frameCursor = 0;
  const FRAME_SEQUENCE = [0, 1, 2, 1];

  function stopPumpFrames(){
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
  }

  function startPumpFrames(){
    const stage = document.getElementById('segLoaderPumpStage');
    if (!stage || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    stopPumpFrames();
    frameCursor = 0;
    stage.dataset.frame = String(FRAME_SEQUENCE[frameCursor]);
    frameTimer = setInterval(() => {
      frameCursor = (frameCursor + 1) % FRAME_SEQUENCE.length;
      stage.dataset.frame = String(FRAME_SEQUENCE[frameCursor]);
    }, 390);
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
    void hydratePumpImage();
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

  window.addEventListener('seg:auth-ready', hide, { once: true });
  window.addEventListener('seg:login-ready', hide, { once: true });

  // Failsafe: never block the interface forever if an unexpected boot error occurs.
  window.setTimeout(() => {
    if (!hidden) hide();
  }, 12000);

  void hydratePumpImage();
  window.segAppLoader = { show, hide, setStatus };
})();
