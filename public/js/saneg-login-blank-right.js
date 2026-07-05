// Temporarily blank the right login infographic area for the next redesign stage.
(function blankSanegLoginRightArea(){
  if (window.__sanegLoginRightBlankLoaded) return;
  window.__sanegLoginRightBlankLoaded = true;

  function inject(){
    if (document.getElementById('sanegLoginBlankRightStyle')) return;
    const style = document.createElement('style');
    style.id = 'sanegLoginBlankRightStyle';
    style.textContent = `
      #sanegLoginGate .saneg-login-right{
        background:#020817 !important;
        padding:0 !important;
        overflow:hidden !important;
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
        background:
          radial-gradient(circle at 20% 18%,rgba(14,165,233,.10),transparent 30%),
          radial-gradient(circle at 80% 42%,rgba(16,185,129,.08),transparent 32%),
          linear-gradient(135deg,#020817,#031525 52%,#020817);
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject, { once:true });
  else inject();
})();
