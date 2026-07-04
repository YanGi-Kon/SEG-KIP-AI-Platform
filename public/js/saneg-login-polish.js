// Sanegplatform login visual polish
// Aligns the right infographic to the approved enterprise mockup without touching auth logic.
(function sanegLoginPolish(){
  if (window.__sanegLoginPolishLoaded) return;
  window.__sanegLoginPolishLoaded = true;

  function inject(){
    if (document.getElementById('sanegLoginPolishStyle')) return;
    const style = document.createElement('style');
    style.id = 'sanegLoginPolishStyle';
    style.textContent = `
      #sanegLoginGate .saneg-login-right{padding:32px !important;background:#020817 !important;}
      #sanegLoginGate .saneg-login-right-bg{background-image:url('/assets/login/saneg-login-hero.svg?v=hero1a') !important;background-size:cover !important;background-position:center !important;transform:scale(1.02) !important;filter:saturate(1.08) contrast(1.08) brightness(.82) !important;}
      #sanegLoginGate .saneg-login-right-overlay{background:linear-gradient(180deg,rgba(2,8,23,.06),rgba(2,8,23,.10)),radial-gradient(circle at 50% 50%,rgba(34,211,238,.05),transparent 44%) !important;}
      #sanegLoginGate .saneg-login-right-content{width:min(1040px,100%) !important;min-height:790px !important;position:relative !important;justify-content:flex-start !important;gap:0 !important;padding-top:42px !important;}
      #sanegLoginGate .saneg-login-right-content>div:first-child{width:100% !important;text-align:center !important;margin-bottom:22px !important;}
      #sanegLoginGate .saneg-hero h2{font-size:34px !important;line-height:1.1 !important;margin:0 0 10px !important;color:#fff !important;text-shadow:0 3px 22px rgba(0,0,0,.55) !important;}
      #sanegLoginGate .saneg-hero p{font-size:18px !important;color:#e5edf5 !important;text-shadow:0 2px 16px rgba(0,0,0,.55) !important;}
      #sanegLoginGate .saneg-orbit{width:100% !important;height:520px !important;margin:0 !important;position:relative !important;}
      #sanegLoginGate .saneg-flow-hub{top:0 !important;left:50% !important;width:220px !important;height:96px !important;border-radius:18px !important;transform:translateX(-50%) !important;background:linear-gradient(180deg,rgba(15,42,68,.88),rgba(2,8,23,.74)) !important;}
      #sanegLoginGate .saneg-sheets-icon{width:52px !important;height:52px !important;font-size:26px !important;}
      #sanegLoginGate .saneg-flow-hub small{font-size:18px !important;margin-top:0 !important;}
      #sanegLoginGate .saneg-flow-hub span{font-size:13px !important;}
      #sanegLoginGate .saneg-flow-line{left:12% !important;right:12% !important;top:92px !important;height:155px !important;border-top:2px dashed rgba(45,212,191,.78) !important;opacity:.92 !important;}
      #sanegLoginGate .saneg-info{min-width:255px !important;max-width:280px !important;padding:22px !important;border-radius:18px !important;background:linear-gradient(180deg,rgba(15,42,68,.90),rgba(2,8,23,.80)) !important;border:1px solid rgba(45,212,191,.62) !important;box-shadow:0 20px 54px rgba(0,0,0,.36),0 0 30px rgba(34,211,238,.10) !important;}
      #sanegLoginGate .saneg-info b{font-size:20px !important;margin-bottom:14px !important;line-height:1.2 !important;}
      #sanegLoginGate .saneg-info span{font-size:14px !important;line-height:1.45 !important;color:#eef8ff !important;margin-top:8px !important;}
      #sanegLoginGate .saneg-info small{font-size:14px !important;color:#34d399 !important;}
      #sanegLoginGate .saneg-card-icon{width:48px !important;height:48px !important;font-size:24px !important;margin-bottom:12px !important;}
      #sanegLoginGate .saneg-info.registry{left:36px !important;top:120px !important;transform:none !important;}
      #sanegLoginGate .saneg-info.monitor{left:36px !important;top:320px !important;transform:none !important;}
      #sanegLoginGate .saneg-info.approval{right:36px !important;top:120px !important;transform:none !important;}
      #sanegLoginGate .saneg-info.ai{right:36px !important;top:320px !important;bottom:auto !important;min-width:250px !important;max-width:265px !important;text-align:center !important;}
      #sanegLoginGate .saneg-ai-face{width:72px !important;height:56px !important;margin:12px auto 18px !important;}
      #sanegLoginGate .saneg-mini-label{display:none !important;}
      #sanegLoginGate .saneg-nav{position:absolute !important;left:28px !important;right:28px !important;bottom:54px !important;width:auto !important;display:grid !important;grid-template-columns:repeat(6,minmax(0,1fr)) !important;gap:12px !important;background:transparent !important;border:0 !important;padding:0 !important;box-shadow:none !important;backdrop-filter:none !important;}
      #sanegLoginGate .saneg-nav span{height:58px !important;border:1px solid rgba(45,212,191,.42) !important;border-radius:12px !important;background:rgba(2,8,23,.62) !important;box-shadow:0 12px 32px rgba(0,0,0,.26) !important;font-size:14px !important;}
      #sanegLoginGate .saneg-compliance{position:absolute !important;bottom:4px !important;left:50% !important;transform:translateX(-50%) !important;margin:0 !important;font-size:15px !important;color:#e8f4f8 !important;white-space:nowrap !important;}
      @media(max-width:1280px){#sanegLoginGate .saneg-login-right-content{transform:scale(.90) !important;transform-origin:center top !important;}#sanegLoginGate .saneg-info{min-width:245px !important;max-width:260px !important;}}
      @media(max-width:980px){#sanegLoginGate .saneg-login-right-content{transform:none !important;}}
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject, { once:true });
  else inject();
})();
