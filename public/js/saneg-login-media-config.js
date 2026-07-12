// Sanegplatform login media config
// Uses the uploaded login image when available and keeps the SVG hero as fallback.
(function configureSanegLoginMedia(){
  const IMAGE_URL = '/assets/login/slides/slide-1.webp?v=loginimage3';
  const FALLBACK_URL = '/assets/login/saneg-login-hero.svg?v=hero1a';
  const WAIT_TIMEOUT_MS = 12000;
  const PROBE_TIMEOUT_MS = 6000;
  let startPromise = null;

  function stage(){
    return window.sanegLoginMediaStage;
  }

  function waitForStage(){
    const ready = () => {
      const api = stage();
      const right = document.querySelector('#sanegLoginGate .saneg-login-right');
      return api && typeof api.setup === 'function' && right ? { api, right } : null;
    };

    const immediate = ready();
    if (immediate) return Promise.resolve(immediate);

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (value, error) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timeout);
        if (error) reject(error); else resolve(value);
      };
      const observer = new MutationObserver(() => {
        const value = ready();
        if (value) finish(value);
      });
      observer.observe(document.documentElement, { childList:true, subtree:true });
      const timeout = setTimeout(() => finish(null, new Error('Login media stage vaqtida yaratilmadi')), WAIT_TIMEOUT_MS);
    });
  }

  async function probe(url, expectedType){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method:'HEAD',
        cache:'no-store',
        credentials:'same-origin',
        signal:controller.signal
      });
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      if (!contentType.startsWith(expectedType)) throw new Error(`${url} noto‘g‘ri Content-Type: ${contentType || 'yo‘q'}`);
      if (!Number.isFinite(contentLength) || contentLength <= 0) throw new Error(`${url} bo‘sh media fayl`);
      return { contentType, contentLength };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadMedia(){
    const { api } = await waitForStage();
    api.setup();

    try {
      const imageMeta = await probe(IMAGE_URL, 'image/webp');
      await api.setImage(IMAGE_URL, {
        fit:'cover',
        alt:'Sanegplatform login banner'
      });
      console.info('[login-media] WEBP yuklandi.', imageMeta);
      return { type:'image', source:'webp', ...imageMeta };
    } catch (imageError) {
      console.warn('[login-media] WEBP ishlamadi, SVG fallback ishlatiladi.', imageError);
    }

    try {
      await api.setImage(FALLBACK_URL, {
        fit:'cover',
        alt:'Sanegplatform KIP automation banner'
      });
      console.info('[login-media] SVG fallback yuklandi.');
      return { type:'image', source:'svg-fallback' };
    } catch (fallbackError) {
      api.clearMedia();
      console.warn('[login-media] Hech bir media yuklanmadi. Mavjud login hero fallback ko‘rsatiladi.', fallbackError);
      return { type:'fallback', error:fallbackError.message };
    }
  }

  function start(){
    if (!startPromise) startPromise = loadMedia().catch((error) => {
      startPromise = null;
      console.warn('[login-media] Ishga tushirish xatosi. SVG fallback saqlandi.', error);
      return { type:'fallback', error:error.message };
    });
    return startPromise;
  }

  window.sanegLoginMediaConfig = {
    imageUrl: IMAGE_URL,
    fallbackUrl: FALLBACK_URL,
    start,
    showCurrent:start,
    loadMedia
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
