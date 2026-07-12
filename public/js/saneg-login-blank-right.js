// Sanegplatform login right media stage
// Keeps the existing login hero visible until a real image/video has loaded.
(function installSanegLoginMediaStage(){
  if (window.__sanegLoginMediaStageLoaded) return;
  window.__sanegLoginMediaStageLoaded = true;

  function injectStyle(){
    if (document.getElementById('sanegLoginMediaStageStyle')) return;
    const style = document.createElement('style');
    style.id = 'sanegLoginMediaStageStyle';
    style.textContent = `
      #sanegLoginGate .saneg-login-right{
        background:#020817 !important;
        padding:0 !important;
        overflow:hidden !important;
        position:relative !important;
      }
      #sanegLoginGate .saneg-login-right-bg,
      #sanegLoginGate .saneg-login-right-overlay,
      #sanegLoginGate .saneg-login-right-content{
        transition:opacity .35s ease,visibility .35s ease;
      }
      #sanegLoginGate .saneg-login-media-stage{
        position:absolute;
        inset:0;
        z-index:5;
        overflow:hidden;
        opacity:0;
        visibility:hidden;
        transition:opacity .35s ease,visibility .35s ease;
        background:#020817;
        isolation:isolate;
      }
      #sanegLoginGate .saneg-login-right.saneg-media-ready .saneg-login-media-stage{
        opacity:1;
        visibility:visible;
      }
      #sanegLoginGate .saneg-login-right.saneg-media-ready .saneg-login-right-bg,
      #sanegLoginGate .saneg-login-right.saneg-media-ready .saneg-login-right-overlay,
      #sanegLoginGate .saneg-login-right.saneg-media-ready .saneg-login-right-content{
        opacity:0 !important;
        visibility:hidden !important;
        pointer-events:none !important;
      }
      #sanegLoginGate .saneg-login-media-layer,
      #sanegLoginGate .saneg-login-animation-layer,
      #sanegLoginGate .saneg-login-overlay-layer{
        position:absolute;
        inset:0;
      }
      #sanegLoginGate .saneg-login-media-layer{z-index:1;}
      #sanegLoginGate .saneg-login-animation-layer{z-index:2;pointer-events:none;}
      #sanegLoginGate .saneg-login-overlay-layer{
        z-index:3;
        pointer-events:none;
        background:linear-gradient(90deg,rgba(2,8,23,.08),transparent 18%,transparent 82%,rgba(2,8,23,.10));
      }
      #sanegLoginGate .saneg-login-media-img,
      #sanegLoginGate .saneg-login-media-video{
        width:100%;
        height:100%;
        display:block;
        object-fit:cover;
        object-position:center;
        background:#020817;
      }
      #sanegLoginGate .saneg-login-media-img.contain,
      #sanegLoginGate .saneg-login-media-video.contain{
        object-fit:contain;
      }
      @media(max-width:980px){
        #sanegLoginGate .saneg-login-right{display:none !important;}
      }
    `;
    document.head.appendChild(style);
  }

  function getRightPanel(){
    return document.querySelector('#sanegLoginGate .saneg-login-right');
  }

  function createStage(){
    injectStyle();
    const right = getRightPanel();
    if (!right) return null;
    let stage = right.querySelector('.saneg-login-media-stage');
    if (stage) return stage;

    stage = document.createElement('div');
    stage.className = 'saneg-login-media-stage';
    stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML = `
      <div class="saneg-login-media-layer" data-layer="media"></div>
      <div class="saneg-login-animation-layer" data-layer="animation"></div>
      <div class="saneg-login-overlay-layer" data-layer="overlay"></div>
    `;
    right.appendChild(stage);
    return stage;
  }

  function stopCurrentMedia(layer){
    const video = layer?.querySelector('video');
    if (video) {
      try { video.pause(); } catch (_) {}
      video.removeAttribute('src');
      try { video.load(); } catch (_) {}
    }
    if (layer) layer.replaceChildren();
  }

  function markReady(right){
    right?.classList.add('saneg-media-ready');
    right?.classList.remove('saneg-media-failed');
  }

  function markFailed(right, error){
    right?.classList.remove('saneg-media-ready');
    right?.classList.add('saneg-media-failed');
    console.warn('[login-media] media yuklanmadi, mavjud hero fallback saqlandi.', error || 'unknown error');
  }

  function setImage(src, options = {}){
    const stage = createStage();
    const right = getRightPanel();
    if (!stage || !right || !src) return Promise.reject(new Error('Login media stage tayyor emas'));
    const layer = stage.querySelector('[data-layer="media"]');
    stopCurrentMedia(layer);
    right.classList.remove('saneg-media-ready','saneg-media-failed');

    return new Promise((resolve, reject) => {
      const img = document.createElement('img');
      img.className = 'saneg-login-media-img' + (options.fit === 'contain' ? ' contain' : '');
      img.alt = options.alt || 'Sanegplatform login infographic';
      img.decoding = 'async';
      img.loading = 'eager';
      img.addEventListener('load', () => {
        markReady(right);
        resolve(img);
      }, { once:true });
      img.addEventListener('error', () => {
        const error = new Error(`Login rasmi yuklanmadi: ${src}`);
        markFailed(right, error);
        reject(error);
      }, { once:true });
      layer.appendChild(img);
      img.src = src;
    });
  }

  function setVideo(src, options = {}){
    const stage = createStage();
    const right = getRightPanel();
    if (!stage || !right || !src) return Promise.reject(new Error('Login media stage tayyor emas'));
    const layer = stage.querySelector('[data-layer="media"]');
    stopCurrentMedia(layer);
    right.classList.remove('saneg-media-ready','saneg-media-failed');

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.className = 'saneg-login-media-video' + (options.fit === 'contain' ? ' contain' : '');
      video.autoplay = options.autoplay !== false;
      video.muted = options.muted !== false;
      video.defaultMuted = video.muted;
      video.loop = options.loop !== false;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      if (options.poster) video.poster = options.poster;

      video.addEventListener('loadeddata', () => {
        markReady(right);
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((error) => console.warn('[login-media] autoplay bloklandi.', error));
        }
        resolve(video);
      }, { once:true });
      video.addEventListener('error', () => {
        const error = new Error(`Login videosi yuklanmadi: ${src}`);
        markFailed(right, error);
        reject(error);
      }, { once:true });

      layer.appendChild(video);
      video.src = src;
      video.load();
    });
  }

  function setAnimationHtml(html){
    const stage = createStage();
    if (!stage) return;
    const layer = stage.querySelector('[data-layer="animation"]');
    layer.innerHTML = html || '';
  }

  function clearMedia(){
    const stage = createStage();
    const right = getRightPanel();
    if (!stage) return;
    stopCurrentMedia(stage.querySelector('[data-layer="media"]'));
    right?.classList.remove('saneg-media-ready','saneg-media-failed');
  }

  function clearAnimation(){
    setAnimationHtml('');
  }

  function setup(){
    return createStage();
  }

  window.sanegLoginMediaStage = {
    setup,
    setImage,
    setVideo,
    setAnimationHtml,
    clearMedia,
    clearAnimation
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once:true });
  else setup();
})();
