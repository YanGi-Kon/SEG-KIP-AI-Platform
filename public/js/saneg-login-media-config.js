// Sanegplatform login media config
// Final login image path:
// public/assets/login/slides/slide-1.webp

(function configureSanegLoginMedia(){
  const slides = [
    '/assets/login/slides/slide-1.webp?v=slide2'
  ];

  const intervalMs = 120000;
  const retryMs = 250;
  let index = 0;
  let timer = null;
  let retryTimer = null;
  let observer = null;

  function stage(){
    return window.sanegLoginMediaStage;
  }

  function clearRetry(){
    if (!retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  function retry(){
    clearRetry();
    retryTimer = setTimeout(showCurrent, retryMs);
  }

  function showCurrent(){
    const api = stage();
    const rightPanel = document.querySelector('#sanegLoginGate .saneg-login-right');

    // The login gate and media scripts are loaded dynamically. On fast loads the
    // media config can run before the right panel exists, so keep retrying until
    // the real media stage is mounted.
    if (!api || typeof api.setImage !== 'function' || !rightPanel) {
      retry();
      return false;
    }

    if (typeof api.setup === 'function') api.setup();

    const stageElement = document.querySelector('#sanegLoginGate .saneg-login-media-stage');
    if (!stageElement || !slides.length) {
      retry();
      return false;
    }

    clearRetry();
    api.setImage(slides[index], {
      fit: 'cover',
      alt: 'Sanegplatform login KIP automation banner'
    });

    const image = stageElement.querySelector('.saneg-login-media-img');
    if (!image) {
      retry();
      return false;
    }

    image.addEventListener('error', retry, { once: true });
    image.addEventListener('load', clearRetry, { once: true });
    return true;
  }

  function watchLoginGate(){
    if (observer || !document.body) return;
    observer = new MutationObserver(() => {
      if (document.querySelector('#sanegLoginGate .saneg-login-right')) showCurrent();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function start(){
    watchLoginGate();
    showCurrent();

    if (timer || slides.length < 2) return;
    timer = setInterval(() => {
      index = (index + 1) % slides.length;
      showCurrent();
    }, intervalMs);
  }

  window.sanegLoginMediaConfig = {
    slides,
    intervalMs,
    start,
    showCurrent,

    addSlide(src){
      if (src && !slides.includes(src)) slides.push(src);
      return slides;
    },

    setSlides(nextSlides){
      slides.splice(
        0,
        slides.length,
        ...(Array.isArray(nextSlides) ? nextSlides.filter(Boolean) : [])
      );

      index = 0;
      showCurrent();
      return slides;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
