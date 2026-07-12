// Sanegplatform login media config
// Video is preferred; the existing SVG hero remains a safe fallback.
(function configureSanegLoginMedia(){
  const VIDEO_URL = '/assets/login/slides/slide-1.mp4?v=loginmedia2';
  const POSTER_URL = '/assets/login/saneg-login-hero.svg?v=hero1a';
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
      const videoMeta = await probe(VIDEO_URL, 'video/mp4');
      await api.setVideo(VIDEO_URL, {
        fit:'cover',
        autoplay:true,
        muted:true,
        loop:true,
        poster:POSTER_URL
      });
      console.info('[login-media] MP4 yuklandi.', videoMeta);
      return { type:'video', ...videoMeta };
    } catch (videoError) {
      console.warn('[login-media] MP4 ishlamadi, SVG fallback tekshirilmoqda.', videoError);
    }

    try {
      const imageMeta = await probe(POSTER_URL, 'image/svg+xml');
      await api.setImage(POSTER_URL, {
        fit:'cover',
        alt:'Sanegplatform KIP automation banner'
      });
      console.info('[login-media] SVG fallback yuklandi.', imageMeta);
      return { type:'image', ...imageMeta };
    } catch (imageError) {
      api.clearMedia();
      console.warn('[login-media] Media fayllari ishlamadi. Mavjud login hero fallback ko‘rsatiladi.', imageError);
      return { type:'fallback', error:imageError.message };
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
    videoUrl:VIDEO_URL,
    posterUrl:POSTER_URL,
    start,
    showCurrent:start,
    loadMedia
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
