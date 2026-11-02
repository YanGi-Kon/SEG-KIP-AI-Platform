// Sanegplatform login media config
// Uses MP4 video as primary and the existing local PNG as fallback.
(function configureSanegLoginMedia(){
  const VIDEO_URL = '/assets/login/slides/slide-1.mp4?v=loginvideo1';
  const IMAGE_URL = '/assets/images/saneg-industrial-background.png?v=1';
  const WAIT_TIMEOUT_MS = 5000;
  const PROBE_TIMEOUT_MS = 3000;
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
        cache:'default',
        credentials:'same-origin',
        signal:controller.signal
      });
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      if (!contentType.startsWith(expectedType)) throw new Error(`${url} noto'g'ri Content-Type: ${contentType || null}`);
      if (!Number.isFinite(contentLength) || contentLength <= 0) throw new Error(`${url} bo'sh media fayl`);
      return { contentType, contentLength };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadMedia(){
    const { api } = await waitForStage();
    api.setup();

    // 1. MP4 video - asosiy media
    try {
      await probe(VIDEO_URL, 'video/');
      await api.setVideo(VIDEO_URL, {
        autoplay: true,
        muted: true,
        loop: true,
        fit: 'cover'
      });
      console.info('[login-media] MP4 video yuklandi.');
      return { type:'video', source:'mp4' };
    } catch (videoError) {
      console.warn('[login-media] MP4 ishlamadi, PNG rasm ishlatiladi.', videoError);
    }

    // 2. Existing local PNG image - fallback
    try {
      await probe(IMAGE_URL, 'image/png');
      await api.setImage(IMAGE_URL, {
        fit:'cover',
        alt:'Sanegplatform login banner'
      });
      console.info('[login-media] PNG fallback yuklandi.');
      return { type:'image', source:'png' };
    } catch (imageError) {
      api.clearMedia();
      console.warn('[login-media] Hech bir media yuklanmadi.', imageError);
      return { type:'fallback', error:imageError.message };
    }
  }

  function start(){
    if (!startPromise) startPromise = loadMedia().catch((error) => {
      startPromise = null;
      const gateActive = Boolean(document.getElementById('sanegLoginGate') || document.body?.classList?.contains('saneg-login-active'));
      if (!gateActive && error?.message === 'Login media stage vaqtida yaratilmadi') {
        return { type:'skipped', reason:'login-inactive' };
      }
      console.warn('[login-media] Ishga tushirish xatosi.', error);
      return { type:'fallback', error:error.message };
    });
    return startPromise;
  }

  window.sanegLoginMediaConfig = {
    videoUrl: VIDEO_URL,
    imageUrl: IMAGE_URL,
    fallbackUrl: IMAGE_URL,
    start,
    showCurrent:start,
    loadMedia
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
