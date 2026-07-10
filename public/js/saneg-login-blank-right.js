// Sanegplatform login right media stage
// Future-ready slot for images, GIF/WebP, video loops, SVG/Lottie/canvas animations.
(function installSanegLoginMediaStage(){
  if (window.__sanegLoginMediaStageLoaded) return;
  window.__sanegLoginMediaStageLoaded = true;

  const DEFAULT_IMAGE = '';

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
      #sanegLoginGate .saneg-login-right-content,
      #sanegLoginGate .saneg-hero,
      #sanegLoginGate .saneg-orbit,
      #sanegLoginGate .saneg-info,
      #sanegLoginGate .saneg-flow-hub,
      #sanegLoginGate .saneg-flow-line,
      #sanegLoginGate .saneg-nav,
      #sanegLoginGate .saneg-compliance,
      #sanegLoginGate .saneg-mini-label,
      #sanegLoginGate .saneg-servers,
      #sanegLoginGate .saneg-server,
      #sanegLoginGate .saneg-plant{
        display:none !important;
      }
      #sanegLoginGate .saneg-login-right::before{display:none !important;content:none !important;}
      #sanegLoginGate .saneg-login-media-stage{
        position:absolute;
        inset:0;
        overflow:hidden;
        background:
          radial-gradient(circle at 22% 18%,rgba(14,165,233,.14),transparent 34%),
          radial-gradient(circle at 78% 44%,rgba(16,185,129,.10),transparent 34%),
          linear-gradient(135deg,#020817,#031525 52%,#020817);
        isolation:isolate;
      }
      #sanegLoginGate .saneg-login-media-layer,
      #sanegLoginGate .saneg-login-animation-layer,
      #sanegLoginGate .saneg-login-overlay-layer{
        position:absolute;
        inset:0;
      }
      #sanegLoginGate .saneg-login-media-layer:empty::before{
        content:'';
        position:absolute;
        inset:0;
        background:
          repeating-linear-gradient(90deg,rgba(34,211,238,.055) 0 1px,transparent 1px 92px),
          repeating-linear-gradient(0deg,rgba(16,185,129,.035) 0 1px,transparent 1px 86px);
        opacity:.65;
      }
      #sanegLoginGate .saneg-login-media-layer:empty::after{
        content:'Media stage tayyor';
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        padding:12px 18px;
        border:1px dashed rgba(34,211,238,.34);
        border-radius:18px;
        color:rgba(226,244,255,.56);
        font:700 14px Inter,Arial,sans-serif;
        letter-spacing:.02em;
        background:rgba(2,8,23,.34);
      }
      #sanegLoginGate .saneg-login-media-img,
      #sanegLoginGate .saneg-login-media-video{
        width:100%;
        height:100%;
        display:block;
        object-fit:cover;
        object-position:center;
      }
      #sanegLoginGate .saneg-login-media-img.contain,
      #sanegLoginGate .saneg-login-media-video.contain{
        object-fit:contain;
        background:#020817;
      }
      #sanegLoginGate .saneg-login-animation-layer{
        z-index:2;
        pointer-events:none;
      }
      #sanegLoginGate .saneg-login-overlay-layer{
        z-index:3;
        pointer-events:none;
        background:linear-gradient(90deg,rgba(2,8,23,.08),transparent 18%,transparent 82%,rgba(2,8,23,.10));
      }
      #sanegLoginGate .saneg-login-media-layer{z-index:1;}
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
    stage.innerHTML = `
      <div class="saneg-login-media-layer" data-layer="media"></div>
      <div class="saneg-login-animation-layer" data-layer="animation"></div>
      <div class="saneg-login-overlay-layer" data-layer="overlay"></div>
    `;
    right.appendChild(stage);
    return stage;
  }

  function setImage(src, options = {}){
    const stage = createStage();
    if (!stage || !src) return;
    const layer = stage.querySelector('[data-layer="media"]');
    layer.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'saneg-login-media-img' + (options.fit === 'contain' ? ' contain' : '');
    img.alt = options.alt || 'Sanegplatform login infographic';
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = src;
    layer.appendChild(img);
  }

  function setVideo(src, options = {}){
    const stage = createStage();
    if (!stage || !src) return;
    const layer = stage.querySelector('[data-layer="media"]');
    layer.innerHTML = '';
    const video = document.createElement('video');
    video.className = 'saneg-login-media-video' + (options.fit === 'contain' ? ' contain' : '');
    video.src = src;
    video.autoplay = options.autoplay !== false;
    video.muted = options.muted !== false;
    video.loop = options.loop !== false;
    video.playsInline = true;
    layer.appendChild(video);
  }

  function setAnimationHtml(html){
    const stage = createStage();
    if (!stage) return;
    const layer = stage.querySelector('[data-layer="animation"]');
    layer.innerHTML = html || '';
  }

  function clearMedia(){
    const stage = createStage();
    if (!stage) return;
    stage.querySelector('[data-layer="media"]').innerHTML = '';
  }

  function clearAnimation(){
    setAnimationHtml('');
  }

  function setup(){
    createStage();
    if (DEFAULT_IMAGE) setImage(DEFAULT_IMAGE, { fit:'cover' });
  }

  window.sanegLoginMediaStage = {
    setup,
    setImage,
    setVideo,
    setAnimationHtml,
    clearMedia,
    clearAnimation,
    defaultImage: DEFAULT_IMAGE
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once:true });
  else setup();
})();
