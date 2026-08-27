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

// Project page table of contents. If a project page already writes its
// own <nav class="project-toc"> (see projects/plots.html for an example
// you can copy/edit directly), this leaves it alone. Otherwise it's a
// fallback: auto-builds one from whatever H2/H3s exist in .project-body
// and wraps it with the Role/Tool/Timeline/Team stats in
// .project-meta-grid (a two-column layout — see style.css to reposition
// or restack them). Anchor links + the site's smooth-scroll CSS handle
// the jump either way.
const projectStats = document.querySelector('.project-stats');
const projectBody = document.querySelector('.project-body');
const hasStaticToc = document.querySelector('.project-toc');

if (projectStats && projectBody && !hasStaticToc) {
  const headings = Array.from(projectBody.querySelectorAll('h2, h3'));

  if (headings.length) {
    const usedIds = new Set();
    const slugify = (text) => {
      const base = text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      let slug = base;
      let suffix = 2;
      while (usedIds.has(slug)) slug = `${base}-${suffix++}`;
      usedIds.add(slug);
      return slug;
    };

    const toc = document.createElement('nav');
    toc.className = 'project-toc';
    toc.setAttribute('aria-label', 'On this page');

    const label = document.createElement('p');
    label.className = 'project-toc-label';
    label.textContent = 'On this page';
    toc.appendChild(label);

    const list = document.createElement('ul');
    headings.forEach((heading) => {
      if (!heading.id) heading.id = slugify(heading.textContent);

      const item = document.createElement('li');
      if (heading.tagName === 'H3') item.className = 'project-toc-sub';

      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent;

      item.appendChild(link);
      list.appendChild(item);
    });

    toc.appendChild(list);

    const metaGrid = document.createElement('div');
    metaGrid.className = 'project-meta-grid';
    projectStats.insertAdjacentElement('afterend', metaGrid);
    metaGrid.appendChild(projectStats);
    metaGrid.appendChild(toc);
  }
}

// Carousel: alternates between however many .carousel-slide elements
// are inside a .project-carousel. Builds the dots to match, and wires
// up the prev/next buttons — see projects/plots.html for an example.
document.querySelectorAll('.project-carousel').forEach((carousel) => {
  const track = carousel.querySelector('.carousel-track');
  const slides = Array.from(carousel.querySelectorAll('.carousel-slide'));
  const prevBtn = carousel.querySelector('.carousel-prev');
  const nextBtn = carousel.querySelector('.carousel-next');
  const caption = carousel.querySelector('.carousel-caption');
  const dotsWrap = carousel.querySelector('.carousel-dots');
  if (!track || slides.length < 2) return;

  const dots = slides.map((slide, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot';
    dot.setAttribute('aria-label', `Show image ${index + 1}`);
    dot.addEventListener('click', () => show(index));
    dotsWrap.appendChild(dot);
    return dot;
  });

  let current = 0;

  function show(index) {
    current = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    if (caption) caption.textContent = slides[current].dataset.caption || '';
    dots.forEach((dot, i) => dot.classList.toggle('active', i === current));
  }

  prevBtn?.addEventListener('click', () => show(current - 1));
  nextBtn?.addEventListener('click', () => show(current + 1));

  // Swipe: track the pointer 1:1 while dragging (no waiting for a
  // "swipeleft"-type gesture event, so it can be redirected mid-drag),
  // then commit to the nearest slide based on how far it moved.
  const viewport = carousel.querySelector('.carousel-viewport');
  let pointerId = null;
  let startX = 0;
  let dragX = 0;
  let dragging = false;
  let didSwipe = false;

  function setDragTransform(offset) {
    track.style.transition = 'none';
    track.style.transform = `translateX(calc(-${current * 100}% + ${offset}px))`;
  }

  viewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    dragX = 0;
    dragging = true;
    didSwipe = false;
    try {
      viewport.setPointerCapture(pointerId);
    } catch {
      // Rare browser edge cases can reject capture; the drag still
      // works via normal event bubbling, just without it.
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragX = event.clientX - startX;
    if (Math.abs(dragX) > 10) didSwipe = true;
    setDragTransform(dragX);
  });

  function endDrag(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    track.style.transition = '';
    const threshold = viewport.getBoundingClientRect().width * 0.15;
    if (dragX < -threshold) show(current + 1);
    else if (dragX > threshold) show(current - 1);
    else show(current); // snap back
  }

  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  // A swipe shouldn't also open the lightbox — only a real tap should.
  viewport.addEventListener('click', (event) => {
    if (didSwipe) {
      event.preventDefault();
      event.stopPropagation();
      didSwipe = false;
    }
  }, true);

  show(0);
});

// Image lightbox: click any project image (hero or case-study figure)
// to view it enlarged, with keyboard/button navigation between all
// images on the page. Builds one shared overlay and reuses it.
const zoomableImages = Array.from(document.querySelectorAll('.project-hero img, .project-figure img, .carousel-slide img'));

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

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sets lightboxImg's transform so it visually overlaps `sourceEl`'s
  // current on-screen position/size, even though it's laid out at its
  // normal centered lightbox size. Clearing the transform afterwards
  // (see open/close) is what makes it animate from there to centered,
  // or centered back to there — growing from/shrinking to the thumbnail
  // instead of just cross-fading in place.
  function setOriginTransform(sourceEl) {
    const sourceRect = sourceEl.getBoundingClientRect();
    const targetRect = lightboxImg.getBoundingClientRect();
    if (!targetRect.width || !targetRect.height) return false;

    const scaleX = sourceRect.width / targetRect.width;
    const scaleY = sourceRect.height / targetRect.height;
    const originX = (sourceRect.left + sourceRect.width / 2) - (targetRect.left + targetRect.width / 2);
    const originY = (sourceRect.top + sourceRect.height / 2) - (targetRect.top + targetRect.height / 2);

    lightboxImg.style.transition = 'none';
    lightboxImg.style.transform = `translate(${originX}px, ${originY}px) scale(${scaleX}, ${scaleY})`;
    lightboxImg.offsetHeight; // force reflow so the browser registers the start position
    lightboxImg.style.transition = '';
    return true;
  }

  function open(index) {
    lastFocused = document.activeElement;
    const sourceImg = zoomableImages[index];
    show(index);
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();

    if (!prefersReducedMotion) {
      requestAnimationFrame(() => {
        if (setOriginTransform(sourceImg)) {
          requestAnimationFrame(() => { lightboxImg.style.transform = ''; });
        }
      });
    }
  }

  function close() {
    const sourceImg = zoomableImages[currentIndex];
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();

    // Reset zoom first so the source rect below is measured against the
    // fit-to-screen image, not a possibly-huge zoomed-in one.
    setZoomed(false);

    const animated = !prefersReducedMotion && setOriginTransform(sourceImg);
    lightbox.classList.remove('open');
    if (animated) {
      window.setTimeout(() => { lightboxImg.style.transform = ''; }, 400);
    } else {
      lightboxImg.style.transform = '';
    }
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

// Back-to-top FAB: only on project pages (.project-body), appears once
// you've scrolled past one screen height, smooth-scrolls to top on click.
if (document.querySelector('.project-body')) {
  const backToTop = document.createElement('button');
  backToTop.type = 'button';
  backToTop.className = 'back-to-top';
  backToTop.setAttribute('aria-label', 'Back to top');
  backToTop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  document.body.appendChild(backToTop);

  const toggleBackToTop = () => {
    backToTop.classList.toggle('visible', window.scrollY > window.innerHeight);
  };
  toggleBackToTop();
  window.addEventListener('scroll', toggleBackToTop, { passive: true });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}