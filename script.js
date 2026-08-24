// Mobile menu toggle: shows/hides the nav links and swaps the
// hamburger icon for a close icon (both are Material Symbols,
// hidden/shown with CSS — see .menu-icon-open / .menu-icon-close in style.css)

const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

if (menuToggle && navLinks) {
  menuToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', isOpen);
    menuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });

  // Close the menu automatically after tapping a link,
  // so it doesn't stay open when the page jumps to a section
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open menu');
    });
  });
}

// Image lightbox: click any project image (hero or case-study figure)
// to view it enlarged, with keyboard/button navigation between all
// images on the page. Builds one shared overlay and reuses it.
const zoomableImages = Array.from(document.querySelectorAll('.project-hero img, .project-figure img'));

if (zoomableImages.length) {
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Image viewer');
  lightbox.innerHTML = `
    <button type="button" class="lightbox-close" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <button type="button" class="lightbox-prev" aria-label="Previous image">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
    </button>
    <div class="lightbox-img-wrap">
      <img src="" alt="">
    </div>
    <button type="button" class="lightbox-next" aria-label="Next image">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
    </button>
    <p class="lightbox-caption"></p>
  `;
  document.body.appendChild(lightbox);

  const lightboxImgWrap = lightbox.querySelector('.lightbox-img-wrap');
  const lightboxImg = lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('.lightbox-caption');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const prevBtn = lightbox.querySelector('.lightbox-prev');
  const nextBtn = lightbox.querySelector('.lightbox-next');

  let currentIndex = 0;
  let lastFocused = null;

  // Prefer the figcaption (case-study images); fall back to alt text (hero).
  function captionFor(img) {
    const figcaption = img.closest('figure')?.querySelector('figcaption');
    return figcaption ? figcaption.textContent : img.alt;
  }

  // Clicking the image toggles between fit-to-screen and its full
  // native size (scrollable, so you can pan around to see detail).
  function setZoomed(zoomed) {
    lightboxImgWrap.classList.toggle('zoomed', zoomed);
    lightboxImgWrap.scrollTop = 0;
    lightboxImgWrap.scrollLeft = 0;
  }

  function show(index) {
    currentIndex = (index + zoomableImages.length) % zoomableImages.length;
    const img = zoomableImages[currentIndex];
    lightboxImg.src = img.currentSrc || img.src;
    lightboxImg.alt = img.alt;
    lightboxCaption.textContent = captionFor(img);
    setZoomed(false);
  }

  function open(index) {
    lastFocused = document.activeElement;
    show(index);
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  zoomableImages.forEach((img, index) => {
    img.addEventListener('click', () => open(index));
  });

  lightboxImg.addEventListener('click', (event) => {
    event.stopPropagation();
    setZoomed(!lightboxImgWrap.classList.contains('zoomed'));
  });

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => show(currentIndex - 1));
  nextBtn.addEventListener('click', () => show(currentIndex + 1));

  // Clicking the dark backdrop (not the image or a control) closes it.
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) close();
  });

  document.addEventListener('keydown', (event) => {
    if (!lightbox.classList.contains('open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') show(currentIndex - 1);
    if (event.key === 'ArrowRight') show(currentIndex + 1);
  });
}