// Place the approved final right-side login infographic as a single asset.
(function placeSanegLoginRightInfographic(){
  if (window.__sanegLoginRightFinalLoaded) return;
  window.__sanegLoginRightFinalLoaded = true;

  function inject(){
    if (document.getElementById('sanegLoginRightFinalStyle')) return;
    const style = document.createElement('style');
    style.id = 'sanegLoginRightFinalStyle';
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
      #sanegLoginGate .saneg-login-right::before{
        content:'';
        position:absolute;
        inset:0;
        background-image:url('/assets/login/saneg-login-right-final.svg?v=final1a');
        background-size:cover;
        background-position:center;
        background-repeat:no-repeat;
      }
      @media(max-width:980px){
        #sanegLoginGate .saneg-login-right{display:none !important;}
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject, { once:true });
  else inject();
})();
