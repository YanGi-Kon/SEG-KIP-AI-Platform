// Sanegplatform login media config
// Final login image path:
// public/assets/login/slides/slide-1.webp

(function configureSanegLoginMedia(){
  const slides = [
    '/assets/login/slides/slide-1.webp?v=slide1'
  ];

  const intervalMs = 120000;
  let index = 0;
  let timer = null;

  function stage(){
    return window.sanegLoginMediaStage;
  }

  function showCurrent(){
    const api = stage();

    if (!api || typeof api.setImage !== 'function') {
      setTimeout(showCurrent, 200);
      return;
    }

    if (!slides.length) return;

    api.setImage(slides[index], {
      fit: 'cover',
      alt: 'Sanegplatform login KIP automation banner'
    });
  }

  function start(){
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
