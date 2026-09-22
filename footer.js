// Shared site footer: the social-links row plus the credit/copyright
// lines. Every page carries just an empty <footer class="site-footer">
// placeholder and this file fills it, so the footer is edited in one
// place instead of in every HTML file. It has to load *before*
// script.js — script.js wires up the icon hover effects and the
// copy-email button on these elements as soon as it runs.
(function () {
  const footer = document.querySelector('footer.site-footer');
  if (!footer) return;

  footer.innerHTML = `
    <div class="social-links">
      <button type="button" class="copy-email-btn" data-email="giovana.tows@gmail.com" aria-label="Copy email address" title="Copy email address">
        <span class="material-symbols-outlined icon-default">mail</span>
        <span class="material-symbols-outlined icon-copied">check</span>
      </button>
      <a href="https://www.linkedin.com/in/giovanatows/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.114 20.452H3.558V9h3.556v11.452z"/>
        </svg>
      </a>
      <a href="https://www.instagram.com/giovanatows/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5"/>
          <circle cx="12" cy="12" r="4.2"/>
          <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/>
        </svg>
      </a>
      <a href="https://giovanatows.com/" target="_blank" rel="noopener noreferrer" aria-label="Painting portfolio" title="Painting portfolio">
        <span class="material-symbols-outlined">palette</span>
      </a>
    </div>
    <p style="margin-bottom: 0.6rem;">Website designed and developed by Giovana Tows<br class="footer-line-break"> — Powered by Claude Code</p>
    <p class="site-footer-small">&copy; 2026 Giovana Tows — All rights reserved</p>
  `;
})();
