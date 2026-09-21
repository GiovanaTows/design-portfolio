// Softens scrolling site-wide — inertia with an eased deceleration
// instead of the browser's stock 1:1 wheel scroll, so motion settles
// gently rather than stopping abruptly (most noticeable coasting into
// the end of a page). Lenis is loaded from a CDN <script> tag placed
// right before this file in every page, hence the typeof guard: if
// that request ever fails, the rest of the site still works with
// normal scrolling — including the CSS scroll-behavior: smooth in
// style.css, which is left in place as that fallback and only turned
// off here once Lenis actually takes over, since running both at once
// fights over scroll position (each render frame flip-flopping
// between Lenis's eased target and the browser's own native-smooth
// destination) and produces a single instant-looking jump instead of
// either animation. Skipped under prefers-reduced-motion, matching the
// same rule for anchor-link scrolling in style.css.
// Declared out here so the back-to-top button further down can drive the
// same Lenis instance (and cancel any in-flight anchor tracking) instead
// of starting a native smooth scroll that fights it.
let lenis = null;
let stopAnchorTracking = () => {};

if (typeof Lenis !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.style.scrollBehavior = 'auto';

  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1 - Math.pow(2, -10 * t)),
    // Without this, Lenis hijacks every wheel event for the page scroll
    // even while the cursor is over a nested scrollable area — like the
    // vertically-scrolling .carousel-viewport-scroll slides (the
    // Website/Instagram-feed phone and browser mockups) — so their own
    // scroll stopped responding. This makes Lenis detect a genuinely
    // scrollable ancestor under the cursor and hand wheel input to it
    // until that element hits its own scroll limit.
    allowNestedScroll: true,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // Lenis's own built-in anchors option doesn't call preventDefault,
  // so the browser's instant hash-jump fires right behind it and wins
  // before a single eased frame renders — same double-driver problem
  // as scroll-behavior: smooth above, just for clicks instead of
  // wheel/touch. Handling "On this page" / nav hash links ourselves
  // lets us prevent that default so only the eased scroll runs.
  // The target's position is only known at the moment scrollTo runs,
  // but the images above it are loading="lazy" with no reserved height
  // — each one that loads as the page scrolls past pushes the section
  // further down, so a single scrollTo stops short (worse on a long
  // page like Civi, and on first click before anything has loaded).
  // Clicks are handled by chaseTo() below, which re-reads the target
  // every frame; this tracking covers the instant jump when arriving on
  // page.html#section, re-aiming whenever the page's height changes.
  // It stops on the first real user input, or after a timeout, so it
  // never fights someone scrolling away.
  let anchorTarget = null;
  let anchorTimer;
  // Index/anchor clicks don't use a fixed-duration tween: a critically
  // damped spring chases the target's *live* position every frame. That
  // gives a soft start and a soft landing (a plain eased tween starts
  // abruptly), a speed cap so a long jump doesn't become a whoosh, and —
  // because the target is re-read each frame — lazy images loading
  // mid-scroll just move the goal instead of restarting the animation.
  let chaseFrame = null;
  const cancelChase = () => {
    if (chaseFrame) cancelAnimationFrame(chaseFrame);
    chaseFrame = null;
  };
  const chaseTo = (getTargetY) => {
    cancelChase();
    const OMEGA = 5;
    const MAX_SPEED = 4500;
    let pos = window.scrollY;
    let velocity = 0;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const target = Math.min(Math.max(getTargetY(), 0), max);
      velocity += (OMEGA * OMEGA * (target - pos) - 2 * OMEGA * velocity) * dt;
      velocity = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, velocity));
      pos += velocity * dt;
      if (Math.abs(target - pos) < 0.5 && Math.abs(velocity) < 8) {
        lenis.scrollTo(target, { immediate: true, force: true });
        chaseFrame = null;
        return;
      }
      lenis.scrollTo(pos, { immediate: true, force: true });
      chaseFrame = requestAnimationFrame(step);
    };
    chaseFrame = requestAnimationFrame(step);
  };

  stopAnchorTracking = () => {
    anchorTarget = null;
    clearTimeout(anchorTimer);
    cancelChase();
  };
  const trackAnchor = (target) => {
    anchorTarget = target;
    clearTimeout(anchorTimer);
    anchorTimer = setTimeout(stopAnchorTracking, 8000);
  };
  ['wheel', 'touchstart', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, stopAnchorTracking, { passive: true });
  });
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (!anchorTarget) return;
      // Lenis keeps its own copy of the page's scroll limit and clamps
      // scrollTo against it, so make it re-measure first — otherwise
      // it aims at the new position but stops at the old, shorter limit.
      lenis.resize();
      lenis.scrollTo(anchorTarget, { immediate: true });
    }).observe(document.body);
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    if (hash.length < 2) return;
    const target = document.querySelector(hash);
    if (!target) return;
    e.preventDefault();
    stopAnchorTracking();
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    chaseTo(() => window.scrollY + target.getBoundingClientRect().top - margin);
  });

  // Arriving on page.html#section (e.g. the "← Civi" link back to the
  // Case Studies section) has the same problem: the browser's own hash
  // jump runs before the lazy images load.
  if (location.hash.length > 1) {
    const hashTarget = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (hashTarget) {
      trackAnchor(hashTarget);
      lenis.scrollTo(hashTarget, { immediate: true });
    }
  }
}

// Sweep hover: shared engine behind both the button hover-stroke and
// the text-link underline (see the "13. HOVER STROKE" / "14.
// UNDERLINE HOVER" comments in style.css for why this needs JS rather
// than a plain :hover rule — CSS alone can't make entering and
// leaving hover animate two different custom properties in a way that
// always sweeps the same direction). Injects a real child element
// (not a ::before — a pseudo-element with a var()-driven mask/
// gradient didn't reliably repaint when the custom properties
// changed) carrying --<varPrefix>-start/-end, and wires up
// mouseenter/mouseleave/focus/blur to grow one or the other depending
// on direction: entering grows -end forward from a pinned -start: 0%;
// leaving advances -start forward instead while -end stays pinned at
// 100%, so the sweep always starts from the same corner/edge whether
// it's drawing in or erasing out.
function setUpSweepHover(el, overlayClass, varPrefix, resetDelay) {
  const overlay = document.createElement('span');
  overlay.className = overlayClass;
  overlay.setAttribute('aria-hidden', 'true');
  el.appendChild(overlay);

  const setVars = (start, end) => {
    overlay.style.setProperty(`--${varPrefix}-start`, start + '%');
    overlay.style.setProperty(`--${varPrefix}-end`, end + '%');
  };
  let resetTimer;
  const enter = () => {
    clearTimeout(resetTimer);
    setVars(0, 100);
  };
  const leave = () => {
    setVars(100, 100);
    clearTimeout(resetTimer);
    // Back to the (0, 0) baseline once the erase settles, so the next
    // hover-in grows -end forward again instead of un-growing -start
    // backward. (100, 100) and (0, 0) both render as "nothing
    // visible", and since both properties travel the same distance
    // over the same duration here, they stay equal to each other
    // throughout — so this reset never actually becomes visible.
    resetTimer = setTimeout(() => setVars(0, 0), resetDelay);
  };
  el.addEventListener('mouseenter', enter);
  el.addEventListener('mouseleave', leave);
  // Only a real focus should draw the stroke — not a silent
  // programmatic one, like the lightbox calling .focus() on its close
  // button when it opens (for keyboard users tabbing through
  // afterward). :focus-visible alone isn't a reliable enough signal
  // for that across browsers, so silentFocus() below explicitly flags
  // which calls to ignore instead of guessing from the event itself.
  el.addEventListener('focus', () => {
    if (el.dataset.suppressFocusStroke) return;
    enter();
  });
  el.addEventListener('blur', leave);
}

// Focuses an element without triggering its sweep-hover stroke (see
// setUpSweepHover above) — for focus calls that exist purely to
// position the browser's next Tab stop, not to react to real user
// input.
function silentFocus(el, options) {
  el.dataset.suppressFocusStroke = 'true';
  el.focus(options);
  delete el.dataset.suppressFocusStroke;
}

function setUpHoverStroke(btn) {
  setUpSweepHover(btn, 'hover-stroke-overlay', 'stroke', 450);
}

function setUpUnderlineHover(el) {
  setUpSweepHover(el, 'underline-hover-overlay', 'underline', 350);
}

document.querySelectorAll('.index-nav a, .back-link, .timeline-link, .link a, .project-nav a, .inline-link, .project-index a')
  .forEach(setUpUnderlineHover);

document.querySelectorAll('.social-links a, .social-links .copy-email-btn')
  .forEach(setUpHoverStroke);

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

  const closeMenu = () => {
    navLinks.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
  };

  // Close the menu automatically after tapping a link,
  // so it doesn't stay open when the page jumps to a section
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  // It's a dropdown now, so a tap outside it or Escape closes it too.
  document.addEventListener('click', (event) => {
    if (!navLinks.classList.contains('open')) return;
    if (navLinks.contains(event.target) || menuToggle.contains(event.target)) return;
    closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navLinks.classList.contains('open')) {
      closeMenu();
      menuToggle.focus();
    }
  });
}

// The top-menu link for the page you're already on (marked
// aria-current="page" in the HTML) scrolls back to the top instead of
// reloading the page — same eased scroll as the back-to-top button.
document.querySelectorAll('.index-nav a[aria-current="page"]').forEach(link => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    stopAnchorTracking();
    if (lenis) lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// Sticky header: shrinks a little once you've scrolled past the very
// top, and returns to full size back at the top — see .site-header.scrolled
// in style.css for the actual size change.
const siteHeader = document.querySelector('.site-header');
if (siteHeader) {
  // Two thresholds with a dead zone between them, not one — a single
  // cutoff means the tiniest scroll jitter right at that pixel (normal
  // with a trackpad) flips the class back and forth rapidly, which
  // shows up as the header trembling instead of settling into either
  // state.
  let headerScrolled = false;
  const toggleHeaderScrolled = () => {
    if (!headerScrolled && window.scrollY > 80) {
      headerScrolled = true;
      siteHeader.classList.add('scrolled');
    } else if (headerScrolled && window.scrollY < 30) {
      headerScrolled = false;
      siteHeader.classList.remove('scrolled');
    }
  };
  toggleHeaderScrolled();
  window.addEventListener('scroll', toggleHeaderScrolled, { passive: true });
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

  if (prevBtn) setUpHoverStroke(prevBtn);
  if (nextBtn) setUpHoverStroke(nextBtn);

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
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let captionSwapTimer;

  // Videos inside carousel slides need different handling than a
  // standalone video: visibility alone (the observer below) can't
  // express "which slide is active", so playback is driven directly by
  // show() instead — only the current slide's video ever plays, the
  // one being switched away from is always paused, and the one being
  // switched to always restarts from frame one rather than resuming
  // wherever an earlier view left it.
  const slideVideos = slides.map((slide) => slide.querySelector('video'));
  const hasSlideVideos = slideVideos.some(Boolean);
  let carouselVisible = false;

  function show(index) {
    const previous = current;
    current = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;

    // Crossfades the caption instead of swapping its text instantly —
    // clearTimeout guards against a caption still fading back in from
    // the previous click if the buttons are clicked again quickly,
    // which would otherwise leave two overlapping swaps racing to set
    // .textContent. Skipped entirely when the incoming caption is the
    // same string as the outgoing one (several slides in a row sharing
    // one caption, e.g. the Instagram/pitch-deck carousels) — nothing
    // is actually changing, so fading out and back in would just be
    // a flicker with no content change behind it. See
    // .carousel-caption's opacity transition in style.css.
    if (caption) {
      clearTimeout(captionSwapTimer);
      const nextCaption = slides[current].dataset.caption || '';
      if (prefersReducedMotion || nextCaption === caption.textContent) {
        caption.textContent = nextCaption;
      } else {
        caption.style.opacity = '0';
        captionSwapTimer = setTimeout(() => {
          caption.textContent = nextCaption;
          caption.style.opacity = '1';
        }, 350);
      }
    }

    dots.forEach((dot, i) => dot.classList.toggle('active', i === current));

    if (hasSlideVideos) {
      if (previous !== current) slideVideos[previous]?.pause();
      const incoming = slideVideos[current];
      if (incoming) {
        incoming.currentTime = 0;
        if (carouselVisible) incoming.play().catch(() => {});
      }
    }
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
    // Swipe is for touch/pen only. On a mouse, dragging the pointer
    // capture through pointerdown/up was intermittently swallowing the
    // plain click that should open the lightbox — desktop has no need
    // for swipe anyway, since the prev/next buttons are always visible
    // and easy to click.
    if (event.pointerType === 'mouse') return;
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

  // Pauses the active slide's video when the carousel itself scrolls
  // out of view, and resumes it (from wherever it was, not restarted —
  // only a slide change restarts from zero) once it scrolls back in.
  if (hasSlideVideos) {
    const carouselVideoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        carouselVisible = entry.isIntersecting;
        const video = slideVideos[current];
        if (!video) return;
        if (carouselVisible) video.play().catch(() => {});
        else video.pause();
      });
    });
    carouselVideoObserver.observe(viewport);
  }

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
    <button type="button" class="lightbox-btn lightbox-close" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <button type="button" class="lightbox-btn lightbox-prev" aria-label="Previous image">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
    </button>
    <div class="lightbox-img-wrap">
      <img src="" alt="">
    </div>
    <button type="button" class="lightbox-btn lightbox-next" aria-label="Next image">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
    </button>
    <div class="lightbox-zoom">
      <button type="button" class="lightbox-btn lightbox-zoom-out" aria-label="Zoom out">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>
      </button>
      <span class="lightbox-zoom-level">100%</span>
      <button type="button" class="lightbox-btn lightbox-zoom-in" aria-label="Zoom in">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
    <p class="lightbox-caption"></p>
  `;
  document.body.appendChild(lightbox);

  // Not the zoom in/out buttons — they're too small for the stroke
  // sweep to read as anything but noise.
  lightbox.querySelectorAll('.lightbox-btn:not(.lightbox-zoom-in):not(.lightbox-zoom-out)').forEach(setUpHoverStroke);

  const lightboxImgWrap = lightbox.querySelector('.lightbox-img-wrap');
  const lightboxImg = lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('.lightbox-caption');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const prevBtn = lightbox.querySelector('.lightbox-prev');
  const nextBtn = lightbox.querySelector('.lightbox-next');
  const zoomInBtn = lightbox.querySelector('.lightbox-zoom-in');
  const zoomOutBtn = lightbox.querySelector('.lightbox-zoom-out');
  const zoomLevelLabel = lightbox.querySelector('.lightbox-zoom-level');

  let currentIndex = 0;
  let lastFocused = null;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Prefer the figcaption (case-study images); fall back to alt text (hero).
  function captionFor(img) {
    const figcaption = img.closest('figure')?.querySelector('figcaption');
    return figcaption ? figcaption.textContent : img.alt;
  }

  // --- Zoom: stepped levels (not just fit/native), with +/- controls for
  // navigating detail-heavy images. Uses real width/height (not
  // transform: scale) so the wrap's overflow: auto actually has
  // somewhere to scroll to — a scaled-only box keeps its original
  // layout size and doesn't gain real scrollable area.
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 5;
  const ZOOM_STEP = 0.5;
  let zoomLevel = ZOOM_MIN;
  let baseSize = null; // the fit-to-screen {width, height}, measured lazily per image

  // Zoom animation (buttons and click-to-toggle only — a pinch calls
  // applyZoom on every touchmove and tracks the fingers directly). The
  // new size is still applied instantly, since it has to be real
  // width/height for the wrap's scrolling to work, and then FLIPped: the
  // image is put back to where it visually was with a transform (about
  // its center, which is also the zoom's center) and the transform is
  // released, so it glides to the new size. The wrap's overflow is
  // hidden for the duration, otherwise the scaled-up image would
  // briefly add scrollbars while zooming out.
  let zoomAnimTimer;
  function playZoomTransition(before) {
    const after = lightboxImg.getBoundingClientRect();
    if (!after.width || !after.height) return;
    const scale = before.width / after.width;
    const dx = (before.left + before.width / 2) - (after.left + after.width / 2);
    const dy = (before.top + before.height / 2) - (after.top + after.height / 2);
    if (Math.abs(scale - 1) < 0.001 && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    lightboxImgWrap.classList.add('zoom-animating');
    lightboxImg.style.transition = 'none';
    lightboxImg.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    lightboxImg.offsetHeight; // force reflow so the start position registers
    lightboxImg.style.transition = '';
    lightboxImg.style.transform = '';
    clearTimeout(zoomAnimTimer);
    zoomAnimTimer = window.setTimeout(() => {
      lightboxImgWrap.classList.remove('zoom-animating');
    }, 400);
  }

  function applyZoom(animate = false) {
    // Where the image is drawn right now, including any zoom animation
    // still in flight (so a second click mid-animation continues from
    // where it visually is), before that transform is dropped to
    // measure the real layout below.
    let before = null;
    if (animate && !prefersReducedMotion) {
      before = lightboxImg.getBoundingClientRect();
      lightboxImg.style.transition = 'none';
      lightboxImg.style.transform = '';
    }

    const zoomed = zoomLevel > ZOOM_MIN;
    lightboxImgWrap.classList.toggle('zoomed', zoomed);

    if (!zoomed) {
      // At rest, don't pin an explicit size at all — let CSS
      // (max-width/max-height: 100%, width/height: auto) size it from
      // whatever the image's real natural dimensions are. That's
      // always correct regardless of load timing. Explicitly pinning
      // a measured size here (even one equal to "auto") used to be
      // needed to support a width/height transition, but that
      // animation is gone now, and pinning a size measured before the
      // image had actually finished loading (e.g. right after
      // switching via prev/next) was locking in the *previous*
      // image's box — squishing the new one into it once it loaded.
      lightboxImg.style.width = '';
      lightboxImg.style.height = '';
    } else {
      if (!baseSize && lightboxImg.complete && lightboxImg.naturalWidth) {
        // Measure the fit-to-screen size — with .zoomed forced off, so
        // max-width/max-height:100% are definitely constraining it —
        // and only once the image has actually finished loading, so
        // this reflects its real aspect ratio rather than whatever was
        // on screen a moment ago.
        lightboxImgWrap.classList.remove('zoomed');
        lightboxImg.style.width = '';
        lightboxImg.style.height = '';
        const rect = lightboxImg.getBoundingClientRect();
        if (rect.width && rect.height) {
          baseSize = { width: rect.width, height: rect.height };
        }
        lightboxImgWrap.classList.add('zoomed');
      }

      if (baseSize) {
        lightboxImg.style.width = `${baseSize.width * zoomLevel}px`;
        lightboxImg.style.height = `${baseSize.height * zoomLevel}px`;
      }
      // Still loading and no baseSize yet: leave width/height alone
      // (unconstrained by .zoomed's max-width/max-height:none, so it
      // just shows at natural size for a moment) rather than guess —
      // it'll size correctly on the next zoom interaction once loaded.
    }

    // Keep the same point centered as it grows/shrinks, rather than
    // leaving the scroll position wherever it happened to land — this
    // is what makes zooming via the buttons (as opposed to a
    // pointer-anchored pinch) still feel like it's zooming "into the
    // middle" instead of drifting toward a corner.
    if (zoomed) {
      lightboxImgWrap.scrollLeft = (lightboxImgWrap.scrollWidth - lightboxImgWrap.clientWidth) / 2;
      lightboxImgWrap.scrollTop = (lightboxImgWrap.scrollHeight - lightboxImgWrap.clientHeight) / 2;
    } else {
      lightboxImgWrap.scrollTop = 0;
      lightboxImgWrap.scrollLeft = 0;
    }

    zoomInBtn.disabled = zoomLevel >= ZOOM_MAX;
    zoomOutBtn.disabled = zoomLevel <= ZOOM_MIN;
    zoomLevelLabel.textContent = `${Math.round(zoomLevel * 100)}%`;

    if (before && before.width && before.height) playZoomTransition(before);
  }

  function setZoomLevel(level, animate = false) {
    zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
    applyZoom(animate);
  }

  function resetZoom() {
    zoomLevel = ZOOM_MIN;
    baseSize = null;
    applyZoom();
  }

  // --- Show a given image. `direction` (1 = next, -1 = prev, 0 = no
  // animation — used when first opening) makes it slide out toward
  // where you're headed and the new one slide in from where it came
  // from, instead of just popping to the new image.
  function show(index, direction = 0) {
    const nextIndex = (index + zoomableImages.length) % zoomableImages.length;

    const swap = () => {
      currentIndex = nextIndex;
      const img = zoomableImages[currentIndex];
      lightboxImg.src = img.currentSrc || img.src;
      lightboxImg.alt = img.alt;
      lightboxImg.classList.toggle('lightbox-img-on-white', img.dataset.lightboxBg === 'white');
      lightboxCaption.textContent = captionFor(img);
      resetZoom();
    };

    if (!direction || prefersReducedMotion) {
      swap();
      return;
    }

    lightboxImg.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
    lightboxImg.style.opacity = '0';
    lightboxImg.style.transform = `translateX(${direction > 0 ? -24 : 24}px)`;

    window.setTimeout(() => {
      swap();
      lightboxImg.style.transition = 'none';
      lightboxImg.style.transform = `translateX(${direction > 0 ? 24 : -24}px)`;
      lightboxImg.offsetHeight; // force reflow before animating back in
      lightboxImg.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      lightboxImg.style.opacity = '1';
      lightboxImg.style.transform = 'translateX(0)';
      window.setTimeout(() => { lightboxImg.style.transition = ''; }, 200);
    }, 150);
  }

  // Where the picture itself is drawn inside `img`'s box. An <img> with
  // object-fit: contain/cover (carousel slides, the cropped mobile
  // heroes) has a box whose shape differs from the picture's — a wide
  // carousel frame around a squarer photo, say — so animating from the
  // *box* stretches the picture. This returns the picture's own rect
  // (same aspect ratio as the file), which can be smaller (contain, with
  // empty bars) or larger (cover, with the overflow cropped) than the box.
  function paintedRect(img) {
    const box = img.getBoundingClientRect();
    const fit = getComputedStyle(img).objectFit;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh || !box.width || !box.height || !['contain', 'cover', 'scale-down'].includes(fit)) {
      return { box, painted: box };
    }
    const containScale = Math.min(box.width / nw, box.height / nh);
    const scale = fit === 'cover' ? Math.max(box.width / nw, box.height / nh)
      : fit === 'scale-down' ? Math.min(1, containScale)
      : containScale;
    const width = nw * scale;
    const height = nh * scale;
    return {
      box,
      painted: {
        left: box.left + (box.width - width) / 2,
        top: box.top + (box.height - height) / 2,
        width,
        height,
      },
    };
  }

  // Sets lightboxImg's transform so it visually overlaps where
  // `sourceEl`'s picture is currently drawn, even though it's laid out at
  // its normal centered lightbox size. Clearing the transform afterwards
  // (see open/close) is what makes it animate from there to centered,
  // or centered back to there — growing from/shrinking to the thumbnail
  // instead of just cross-fading in place. The scale is one number for
  // both axes so the picture always keeps its proportions; for a cropped
  // (object-fit: cover) thumbnail the parts outside the crop are hidden
  // with a clip-path that opens up as it grows.
  function setOriginTransform(sourceEl) {
    const { box, painted } = paintedRect(sourceEl);
    const targetRect = lightboxImg.getBoundingClientRect();
    if (!targetRect.width || !targetRect.height) return false;

    const scale = painted.width / targetRect.width;
    const originX = (painted.left + painted.width / 2) - (targetRect.left + targetRect.width / 2);
    const originY = (painted.top + painted.height / 2) - (targetRect.top + targetRect.height / 2);

    let clip = '';
    if (painted.width > box.width + 1 || painted.height > box.height + 1) {
      const top = Math.max(0, (box.top - painted.top) / painted.height * 100);
      const left = Math.max(0, (box.left - painted.left) / painted.width * 100);
      const bottom = Math.max(0, (painted.top + painted.height - box.top - box.height) / painted.height * 100);
      const right = Math.max(0, (painted.left + painted.width - box.left - box.width) / painted.width * 100);
      clip = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
    }

    lightboxImg.style.transition = 'none';
    lightboxImg.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
    lightboxImg.style.clipPath = clip;
    lightboxImg.offsetHeight; // force reflow so the browser registers the start position
    lightboxImg.style.transition = '';
    return true;
  }

  const clearOriginTransform = () => {
    lightboxImg.style.transform = '';
    lightboxImg.style.clipPath = '';
  };

  function open(index) {
    lastFocused = document.activeElement;
    const sourceImg = zoomableImages[index];
    // Cancel a close that's still fading out, so it can't wipe the
    // starting state below halfway through this open.
    clearTimeout(closeTimer);
    lightboxImg.style.opacity = '';
    show(index);
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    silentFocus(closeBtn);

    if (!prefersReducedMotion) {
      requestAnimationFrame(() => {
        if (setOriginTransform(sourceImg)) {
          requestAnimationFrame(clearOriginTransform);
        }
      });
    }
  }

  // Closing is a plain fade: the backdrop, controls, caption and the image
  // all fade away together (the backdrop's own fade is the .lightbox
  // opacity transition in style.css). The image gets its own opacity
  // and a slight settle-down on top, and finishes a beat before the
  // backdrop, so it visibly fades rather than just riding the overlay's
  // opacity. The inline values are cleared once the overlay is fully
  // hidden, ready for the next open.
  let closeTimer;
  function close() {
    document.body.style.overflow = '';
    if (lastFocused) silentFocus(lastFocused);

    // Reset zoom first so the image fades from its fit-to-screen size,
    // not a possibly-huge zoomed-in one.
    resetZoom();

    lightbox.classList.remove('open');
    clearTimeout(closeTimer);
    if (prefersReducedMotion) {
      clearOriginTransform();
      return;
    }
    lightboxImg.style.opacity = '0';
    lightboxImg.style.transform = 'scale(0.97)';
    closeTimer = window.setTimeout(() => {
      lightboxImg.style.opacity = '';
      clearOriginTransform();
    }, 450);
  }

  zoomableImages.forEach((img, index) => {
    img.addEventListener('click', () => open(index));
  });

  // Clicking the image is a quick toggle between fit and 2x; the +/-
  // buttons give finer control for images with a lot of detail. Not on
  // mobile — no zoom there at all (matches .lightbox-zoom being
  // hidden below 640px in style.css).
  const isMobileLightbox = () => window.matchMedia('(max-width: 640px)').matches;

  lightboxImg.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isMobileLightbox()) return;
    setZoomLevel(zoomLevel > ZOOM_MIN ? ZOOM_MIN : ZOOM_MIN + 1, true);
  });

  zoomInBtn.addEventListener('click', () => setZoomLevel(zoomLevel + ZOOM_STEP, true));
  zoomOutBtn.addEventListener('click', () => setZoomLevel(zoomLevel - ZOOM_STEP, true));

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => show(currentIndex - 1, -1));
  nextBtn.addEventListener('click', () => show(currentIndex + 1, 1));

  // Clicking the dark backdrop (not the image or a control) closes it.
  // lightboxImgWrap counts as backdrop too — it's often larger than the
  // image itself (e.g. a portrait image in a landscape viewport), so a
  // tap in its empty padding should close the same as one further out.
  // The image's own click handler stops propagation, so a real image
  // tap never reaches here.
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox || event.target === lightboxImgWrap) close();
  });

  // --- Touch: pinch-to-zoom the image, single-finger pan once zoomed,
  // swipe left/right to navigate when not zoomed. touch-action: none on
  // .lightbox (style.css) routes every touch gesture in here instead of
  // to the browser's native page-zoom/scroll; preventDefault below is
  // what actually stops that native behavior from also happening
  // underneath (dragging the fixed backdrop/buttons, or scrolling the
  // page behind the overlay).
  let pinchStartDistance = null;
  let pinchStartZoom = ZOOM_MIN;
  let touchStartX = 0;
  let touchStartY = 0;
  let isPanning = false;
  let panStartScrollLeft = 0;
  let panStartScrollTop = 0;

  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  lightbox.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) {
      pinchStartDistance = touchDistance(event.touches);
      pinchStartZoom = zoomLevel;
    } else if (event.touches.length === 1) {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      isPanning = zoomLevel > ZOOM_MIN;
      if (isPanning) {
        panStartScrollLeft = lightboxImgWrap.scrollLeft;
        panStartScrollTop = lightboxImgWrap.scrollTop;
      }
    }
  }, { passive: true });

  lightbox.addEventListener('touchmove', (event) => {
    if (event.touches.length === 2 && pinchStartDistance) {
      event.preventDefault();
      const scale = touchDistance(event.touches) / pinchStartDistance;
      setZoomLevel(pinchStartZoom * scale);
    } else if (event.touches.length === 1) {
      event.preventDefault();
      if (isPanning) {
        const dx = event.touches[0].clientX - touchStartX;
        const dy = event.touches[0].clientY - touchStartY;
        lightboxImgWrap.scrollLeft = panStartScrollLeft - dx;
        lightboxImgWrap.scrollTop = panStartScrollTop - dy;
      }
    }
  }, { passive: false });

  lightbox.addEventListener('touchend', (event) => {
    pinchStartDistance = null;
    if (isPanning) {
      isPanning = false;
      return;
    }
    // Swipe to navigate — only when not zoomed in (otherwise a single
    // finger is panning around the zoomed image, handled above) and a
    // clear horizontal gesture (mostly-sideways, past a small threshold
    // so an ordinary tap never mis-fires as a swipe).
    if (zoomLevel === ZOOM_MIN && event.changedTouches.length === 1) {
      const dx = event.changedTouches[0].clientX - touchStartX;
      const dy = event.changedTouches[0].clientY - touchStartY;
      const SWIPE_THRESHOLD = 50;
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const direction = dx < 0 ? 1 : -1;
        show(currentIndex + direction, direction);
      }
    }
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (!lightbox.classList.contains('open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') show(currentIndex - 1, -1);
    if (event.key === 'ArrowRight') show(currentIndex + 1, 1);
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
  setUpHoverStroke(backToTop);

  const toggleBackToTop = () => {
    backToTop.classList.toggle('visible', window.scrollY > window.innerHeight);
  };
  toggleBackToTop();
  window.addEventListener('scroll', toggleBackToTop, { passive: true });

  backToTop.addEventListener('click', () => {
    stopAnchorTracking();
    if (lenis) lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
    // youtubePlayers is populated further down the file (see the
    // YouTube coordination block below) — defined later, but this
    // callback only ever runs on a later click, by which point the
    // rest of the script has already finished running once.
    youtubePlayers.forEach(pauseIfPlaying);
  });
}

// Lazy-load heavy iframes (Figma embeds, YouTube players): each one is
// a full app running inside the page, and loading a dozen of them at
// once on page load is enough to crash memory-constrained browsers
// (notably mobile Safari). Instead of a src attribute, these iframes
// carry a data-src in the HTML — this swaps it in only once the iframe
// is about to scroll into view, so they load progressively instead of
// all at once.
//
// Figma embeds are the heaviest of these — on phones they crash the page
// often enough that they're not shown there at all: style.css hides
// .figma-imbeded-div at phone widths, and an element with no box never
// intersects, so its iframe never gets a src and never loads. The
// sentence above each embed is swapped for a plain link to the Figma file
// (see the .figma-note code just below).
const lazyIframes = Array.from(document.querySelectorAll('iframe[data-src]'));

// Each sentence introducing a Figma embed ("Check the flow below, or open
// it in a new tab →") is a <p class="figma-note" data-mobile-text="Check
// the flow on Figma →">. On desktop it reads as written; at phone widths
// (see the media query in style.css) the whole sentence is replaced by
// one link, built here from the existing link's URL, saying what
// data-mobile-text says. Both versions are always in the page and CSS
// picks one, so it also follows a rotation or a window resize.
document.querySelectorAll('.figma-note[data-mobile-text]').forEach((note) => {
  const source = note.querySelector('a[href]');
  if (!source) return;

  const desktop = document.createElement('span');
  desktop.className = 'figma-note-desktop';
  while (note.firstChild) desktop.appendChild(note.firstChild);

  const mobile = document.createElement('a');
  mobile.className = 'inline-link figma-note-mobile';
  mobile.href = source.href;
  mobile.target = '_blank';
  mobile.rel = 'noopener noreferrer';
  // Non-breaking space before the arrow, so it can't wrap onto a line of its own.
  mobile.textContent = note.dataset.mobileText.replace(/ →$/, '\u00a0→');
  setUpUnderlineHover(mobile);

  note.append(desktop, mobile);
});

// Coordinates every YouTube embed on the page through the official
// IFrame Player API (loaded from a CDN <script> tag placed before this
// file — see civi.html/civi-marketing.html, the only pages with
// YouTube embeds) so that playing one pauses every other one, and
// scrolling a playing one out of view pauses it too — also what the
// back-to-top button (above) drains on click. Player objects can only
// wrap an iframe that already has a real embed src, so wrapping
// happens right after the lazy-load observer below swaps in
// data-src — youtubeApiReady/pendingYouTubeIframes cover the (likely)
// case where that happens before the API itself has finished loading.
const youtubePlayers = [];
let youtubeApiReady = false;
const pendingYouTubeIframes = [];

function pauseIfPlaying(player) {
  if (typeof player.getPlayerState === 'function' && player.getPlayerState() === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  }
}

function wrapYouTubeIframe(iframe) {
  const player = new YT.Player(iframe, {
    events: {
      onStateChange: (e) => {
        if (e.data !== YT.PlayerState.PLAYING) return;
        youtubePlayers.forEach((other) => { if (other !== player) pauseIfPlaying(other); });
      },
    },
  });
  youtubePlayers.push(player);

  // threshold: 0 fires only once the very last pixel leaves the
  // viewport, not the first — so normal scrolling past a video mid-
  // playback doesn't cut it off the instant its edge touches the
  // viewport boundary.
  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) pauseIfPlaying(player);
    });
  }, { threshold: 0 });
  visibilityObserver.observe(iframe);
}

window.onYouTubeIframeAPIReady = () => {
  youtubeApiReady = true;
  pendingYouTubeIframes.forEach(wrapYouTubeIframe);
  pendingYouTubeIframes.length = 0;
};

if (lazyIframes.length) {
  const iframeObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const iframe = entry.target;
      iframe.src = iframe.dataset.src;
      iframe.removeAttribute('data-src');
      observer.unobserve(iframe);

      if (iframe.classList.contains('video-embed') && iframe.src.includes('youtube.com')) {
        if (youtubeApiReady) wrapYouTubeIframe(iframe);
        else pendingYouTubeIframes.push(iframe);
      }
    });
  }, { rootMargin: '400px 0px' });

  lazyIframes.forEach(iframe => iframeObserver.observe(iframe));
}

// Pause/resume looping inline videos based on visibility — they decode
// continuously while playing, so there's no reason to keep spending
// CPU/battery on a video the user has scrolled past. Resumes on its
// own once it's back in view. Carousel-slide videos are excluded: the
// .project-carousel logic above already controls their play/pause
// based on which slide is active, and having both observers act on
// the same element would fight over its playback state.
const inlineVideos = Array.from(document.querySelectorAll('.video')).filter(
  (video) => !video.closest('.carousel-slide')
);
if (inlineVideos.length) {
  // Swap in the lighter mobile file on narrow screens. Done in JS
  // rather than a <source media="..."> child — browser support for
  // re-evaluating that on a <video> (as opposed to <picture>, where
  // it's standard) is inconsistent, so an explicit matchMedia check
  // is more reliable. Also re-checked on resize (debounced), so a
  // window resize or orientation change still picks the right file —
  // a video mid-playback won't swap source on its own otherwise.
  const applyVideoSource = () => {
    const isMobile = window.matchMedia('(max-width: 700px)').matches;
    inlineVideos.forEach(video => {
      const wantedSrc = isMobile && video.dataset.srcMobile
        ? video.dataset.srcMobile
        : video.dataset.srcDesktop;
      if (wantedSrc && video.getAttribute('src') !== wantedSrc) {
        const wasPlaying = !video.paused;
        video.src = wantedSrc;
        if (wasPlaying) video.play().catch(() => {});
      }
    });
  };
  applyVideoSource();
  window.addEventListener('load', applyVideoSource);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyVideoSource, 200);
  });

  const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  });

  inlineVideos.forEach(video => videoObserver.observe(video));
}

// Small toast used for copy-to-clipboard confirmations. Created once
// on demand and reused — an aria-live region so screen reader users
// get the same "copied" confirmation the icon swap gives everyone
// else, since an icon change alone isn't announced.
let toastEl;
let toastTimer;
const showToast = (message) => {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2500);
};

// Copy-to-clipboard buttons next to email addresses. Icon feedback
// works two ways: older buttons swap a single Material Symbols
// glyph's text content; newer ones (e.g. the social-icons row) carry
// a separate .icon-default/.icon-copied pair and just toggle the
// .copied class, letting CSS show/hide between them instead — so
// icon is only looked up/used for the former case.
document.querySelectorAll('.copy-email-btn').forEach(btn => {
  const hasIconPair = btn.querySelector('.icon-copied') !== null;
  const icon = hasIconPair ? null : btn.querySelector('.material-symbols-outlined');
  const originalIcon = icon ? icon.textContent : null;
  let resetTimer;

  // Fallback for browsers/contexts where the async Clipboard API is
  // missing or denied (e.g. no clipboard-write permission) — a
  // temporary offscreen textarea + execCommand still works broadly.
  const legacyCopy = (text) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    let succeeded = false;
    try {
      succeeded = document.execCommand('copy');
    } catch (e) {
      succeeded = false;
    }
    document.body.removeChild(textarea);
    return succeeded;
  };

  const showCopied = () => {
    clearTimeout(resetTimer);
    if (icon) icon.textContent = 'check';
    btn.classList.add('copied');
    btn.setAttribute('title', 'Copied!');
    showToast('Email address copied to clipboard');
    resetTimer = setTimeout(() => {
      if (icon) icon.textContent = originalIcon;
      btn.classList.remove('copied');
      btn.setAttribute('title', 'Copy email address');
    }, 1500);
  };

  btn.addEventListener('click', () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(btn.dataset.email).then(showCopied, () => {
        if (legacyCopy(btn.dataset.email)) showCopied();
      });
    } else if (legacyCopy(btn.dataset.email)) {
      showCopied();
    }
  });
});

// Homepage tagline typewriter: types "<prefix><word>" out on load, then
// loops through the word list forever — backspacing down to the end of
// the (never-deleted) prefix and typing the next word back in. The
// prefix/word split lives in data attributes (see index.html's
// .typewriter span) rather than hardcoded here, so the sentence and
// word list can be edited without touching this file. Reusing the same
// typeString() call for both the very first render and every later
// word works because it always types forward from the element's
// current text length — on the first call that's 0 (so it types the
// whole prefix+word), and on every call after a delete it's exactly
// prefix.length (so it only types the new word).
document.querySelectorAll('.typewriter').forEach(el => {
  const textEl = el.querySelector('.typewriter-text');
  const prefix = el.dataset.prefix || '';
  const words = (el.dataset.words || '').split(',').map(w => w.trim()).filter(Boolean);
  if (!textEl || !words.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    textEl.textContent = prefix + words[0];
    return;
  }

  const TYPE_MS = 70;
  const DELETE_MS = 40;
  const PAUSE_AFTER_TYPE_MS = 1800;
  const PAUSE_AFTER_DELETE_MS = 300;

  const typeString = (target, speed, done) => {
    let i = textEl.textContent.length;
    (function step() {
      textEl.textContent = target.slice(0, i);
      i++;
      if (i <= target.length) {
        setTimeout(step, speed);
      } else {
        done();
      }
    })();
  };

  const deleteToLength = (minLength, speed, done) => {
    (function step() {
      if (textEl.textContent.length > minLength) {
        textEl.textContent = textEl.textContent.slice(0, -1);
        setTimeout(step, speed);
      } else {
        done();
      }
    })();
  };

  let wordIndex = 0;
  textEl.textContent = '';

  (function loop() {
    typeString(prefix + words[wordIndex], TYPE_MS, () => {
      setTimeout(() => {
        deleteToLength(prefix.length, DELETE_MS, () => {
          wordIndex = (wordIndex + 1) % words.length;
          setTimeout(loop, PAUSE_AFTER_DELETE_MS);
        });
      }, PAUSE_AFTER_TYPE_MS);
    });
  })();
});

// The page H1, every section H2, each About-page timeline logo, and
// the About-page portrait fade/slide in every time they scroll into
// view — and back out (removing .in-view) once they leave, so
// scrolling back up or down past one replays the animation instead of
// it firing only once (see the ".h1-reveal"/".h2-reveal"/
// ".timeline-logo-reveal"/".about-portrait-reveal" comments in
// style.css for why the hidden starting state is applied here in JS
// rather than living directly on the base rule — it keeps content
// visible by default if this script never runs). Skipped entirely
// under prefers-reduced-motion, or if IntersectionObserver isn't
// supported, so everything just renders normally with no animation in
// either case. The H1 lives in .project-header, a sibling of <main>,
// not inside it — hence the separate selector rather than folding it
// into the others.
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealH1s = document.querySelectorAll('.project-header h1:not(.visually-hidden)');
  const revealH2s = document.querySelectorAll('main h2:not(.visually-hidden)');
  const revealTimelineLogos = document.querySelectorAll('.timeline-logo-link');
  const revealPortraits = document.querySelectorAll('.about-portrait');
  // Running text: paragraphs and Problem/Solution-style sub-headings
  // inside a project's body copy, plus the homepage's intro tagline
  // (the only piece of body text that lives outside .project-body).
  // The About page's subtitle and its Based in / Availability / Languages /
  // Contact badge blocks are part of its opening sequence too.
  const revealText = document.querySelectorAll('main.project-body p, main.project-body h3, main.project-body h4, .introduction-text, .project-header-about .project-meta, #specs-about-desktop .badge-block, #specs-about-mobile .badge-block');
  // Images: hero shots, case-study figures, and every project/case-study
  // grid card (.case-study-card is always paired with .project-card, so
  // this catches both grids with one selector).
  const revealImages = document.querySelectorAll('.project-hero, .project-figure, .project-card');
  const revealCarousels = document.querySelectorAll('.project-carousel');
  revealH1s.forEach(h => h.classList.add('h1-reveal'));
  revealH2s.forEach(h => h.classList.add('h2-reveal'));
  revealTimelineLogos.forEach(l => l.classList.add('timeline-logo-reveal'));
  revealPortraits.forEach(p => p.classList.add('about-portrait-reveal'));
  revealText.forEach(el => el.classList.add('p-reveal'));
  revealImages.forEach(el => el.classList.add('image-reveal'));
  revealCarousels.forEach(el => el.classList.add('carousel-reveal'));
  const revealElements = [
    ...revealH1s, ...revealH2s, ...revealTimelineLogos, ...revealPortraits,
    ...revealText, ...revealImages, ...revealCarousels,
  ];
  if (revealElements.length) {
    // Elements that scroll into view together — a paragraph/image pair
    // in a two-column layout, or several cards in the same grid row —
    // land in the same IntersectionObserver callback, since whatever
    // scroll step first pushes one of them past the 15% threshold
    // pushes its row-mates past it too, in that same frame. Grouping
    // by (near-enough) equal top position and staggering each group
    // left-to-right is what turns "everything in a row fades in at
    // once" into "one at a time" without needing to know anything
    // about which CSS layout (grid, split-columns, etc.) put them
    // there. Leaving elements skip the stagger — they drop out
    // immediately, and have their delay cleared so a later re-entry
    // (possibly grouped differently next time) starts clean.
    const STAGGER_STEP_MS = 120;
    // Loose on purpose: a text/image pair in a centered two-column
    // layout (.text-image-columns, align-items: center) doesn't share
    // an exact top edge — a tall figure sits centered against a short
    // paragraph, so their tops can be 50-100px apart even though
    // they're visually the same "row". A true unrelated section is
    // typically 200px+ further down (section margins/padding), so this
    // stays well clear of merging two actually-separate rows.
    const ROW_TOLERANCE_PX = 100;

    // Cards already on screen when the page opens arrive in the very
    // first callback. Grouping those by row (below) would start every row
    // at 0ms, so a screenful of cards pops in a few at a time — while
    // scrolling, rows arrive at different moments and it reads as one by
    // one. So on open they're run as one sequence, left to right and top
    // to bottom, starting a beat after load so the first card isn't
    // already halfway in by the time the page has painted.
    const OPEN_START_MS = 150;
    let firstBatch = true;
    const sequenceEverything = document.documentElement.classList.contains('js-reveal-all');

    const headingObserver = new IntersectionObserver((entries) => {
      const entering = [];
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entering.push(entry);
        } else {
          entry.target.classList.remove('in-view');
          entry.target.style.transitionDelay = '';
        }
      });

      const sortedByPosition = (list) => list
        .map(entry => ({ entry, rect: entry.target.getBoundingClientRect() }))
        .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

      if (firstBatch) {
        firstBatch = false;
        // Which elements run as the opening sequence: the project cards
        // on the homepage, or — on pages whose <head> sets
        // .js-reveal-all (the About page) — everything on screen.
        const openingEntries = sequenceEverything
          ? entering.slice()
          : entering.filter(entry => entry.target.classList.contains('project-card'));
        entering.splice(0, entering.length, ...entering.filter(entry => !openingEntries.includes(entry)));

        // Hold the sequence until the pictures involved are in (or 2.5s
        // pass), so things fade in with their images instead of as
        // empty tiles that the pictures then pop into. Everything is
        // already hidden by CSS in the meantime.
        const pictureReady = (el) => {
          const img = el.tagName === 'IMG' ? el : el.querySelector('img');
          if (!img || (img.complete && img.naturalWidth)) return Promise.resolve();
          return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        };
        Promise.race([
          Promise.all(openingEntries.map(entry => pictureReady(entry.target))),
          new Promise(resolve => setTimeout(resolve, 2500)),
        ]).then(() => {
          // A long list gets a tighter step so the whole sequence stays
          // within about a second.
          const step = Math.min(STAGGER_STEP_MS, 1000 / Math.max(openingEntries.length, 1));
          sortedByPosition(openingEntries).forEach(({ entry, rect }, index) => {
            // Scrolled away while waiting: leave it for the observer to
            // reveal when it comes back into view.
            if (rect.bottom < 0 || rect.top > window.innerHeight) return;
            entry.target.style.transitionDelay = `${OPEN_START_MS + index * step}ms`;
            entry.target.classList.add('in-view');
          });
        });
      }

      sortedByPosition(entering)
        .reduce((rows, item) => {
          const currentRow = rows[rows.length - 1];
          if (currentRow && Math.abs(item.rect.top - currentRow[0].rect.top) <= ROW_TOLERANCE_PX) {
            currentRow.push(item);
          } else {
            rows.push([item]);
          }
          return rows;
        }, [])
        .forEach(row => {
          row.forEach(({ entry }, index) => {
            entry.target.style.transitionDelay = `${index * STAGGER_STEP_MS}ms`;
            entry.target.classList.add('in-view');
          });
        });
    }, { threshold: 0.15 });
    revealElements.forEach(el => headingObserver.observe(el));
  }
}