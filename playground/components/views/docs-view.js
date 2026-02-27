// Docs View - Full-page documentation with sidebar navigation
// Route: /docs

import { gettingStarted, syntax, stdlib, layers, pathBlocks, debug, cli, examples, tocData, hljsThemeDark } from '../../utils/docs-content.js';

const contentMap = { gettingStarted, syntax, stdlib, layers, pathBlocks, debug, cli, examples };

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const styles = `
  :host {
    display: flex;
    height: 100%;
    overflow: hidden;
    background: var(--bg-primary, #ffffff);
  }

  /* ── Sidebar ── */

  .sidebar {
    width: 260px;
    min-width: 260px;
    background: var(--bg-primary, #ffffff);
    border-right: 1px solid var(--border-color, #e0e0e0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .sidebar-header h1 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .sidebar-header .subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
  }

  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .sidebar-section {
    margin-bottom: 0.125rem;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    padding: 0.5rem 1rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: background-color 0.15s;
  }

  .section-toggle:hover {
    background: var(--bg-secondary, #f5f5f5);
  }

  .section-toggle .chevron {
    font-size: 0.625rem;
    transition: transform 0.15s;
    color: var(--text-tertiary, #999);
  }

  .sidebar-section.expanded .chevron {
    transform: rotate(90deg);
  }

  .section-headings {
    display: none;
    padding-bottom: 0.25rem;
  }

  .sidebar-section.expanded .section-headings {
    display: block;
  }

  .sidebar-heading {
    display: block;
    width: 100%;
    padding: 0.3125rem 1rem 0.3125rem 1.75rem;
    font-size: 0.8125rem;
    color: var(--text-secondary, #666);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    text-decoration: none;
    transition: background-color 0.15s, color 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-heading[data-level="3"] {
    padding-left: 2.5rem;
    font-size: 0.75rem;
  }

  .sidebar-heading:hover {
    background: var(--bg-secondary, #f5f5f5);
    color: var(--text-primary, #1a1a1a);
  }

  .sidebar-heading.active {
    background: var(--accent-bg, #e6f0ff);
    color: var(--accent-color, #0066cc);
    font-weight: 500;
  }

  /* ── Content area ── */

  .content-area {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
  }

  .content-inner {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }

  section {
    margin-bottom: 3rem;
  }

  /* Section titles from markdown h1 */
  section h1 {
    margin: 0 0 1rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--accent-color, #0066cc);
  }

  section h2 {
    margin: 1.5rem 0 1rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  section h3 {
    margin: 1.5rem 0 0.75rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  section h4 {
    margin: 1rem 0 0.5rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  p {
    margin: 0 0 1rem 0;
    color: var(--text-primary, #1a1a1a);
    line-height: 1.6;
  }

  code {
    font-family: var(--font-mono, monospace);
    font-size: 0.875em;
    background: var(--bg-secondary, #f5f5f5);
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
  }

  pre {
    border-radius: 8px;
    overflow-x: auto;
    font-family: var(--font-mono, monospace);
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0 0 1rem 0;
  }

  pre code {
    background: none;
    padding: 1rem;
    display: block;
    font-size: inherit;
  }

  /* highlight.js theme */
  ${hljsThemeDark}

  ul, ol {
    margin: 0 0 1rem 0;
    padding-left: 1.5rem;
    color: var(--text-primary, #1a1a1a);
  }

  li {
    margin-bottom: 0.5rem;
    line-height: 1.5;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
  }

  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  th {
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    background: var(--bg-secondary, #f5f5f5);
  }

  td {
    color: var(--text-primary, #1a1a1a);
  }

  td code {
    white-space: nowrap;
  }

  hr {
    border: none;
    border-top: 1px solid var(--border-color, #e0e0e0);
    margin: 2rem 0;
  }

  a {
    color: var(--accent-color, #0066cc);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
    color: var(--accent-hover, #0055aa);
  }

  .external-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--accent-color, #0066cc);
    text-decoration: none;
  }

  .external-link:hover {
    text-decoration: underline;
  }

  .external-link::after {
    content: '\\2197';
    font-size: 0.75em;
  }

  /* ── Mobile toggle ── */

  .sidebar-toggle {
    display: none;
    position: fixed;
    bottom: 1rem;
    left: 1rem;
    z-index: 10;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid var(--border-color, #e0e0e0);
    background: var(--bg-primary, #ffffff);
    box-shadow: var(--shadow-md, 0 2px 8px rgba(0,0,0,0.15));
    cursor: pointer;
    font-size: 1.125rem;
    display: none;
    align-items: center;
    justify-content: center;
    color: var(--text-primary, #1a1a1a);
  }

  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 20;
      transform: translateX(-100%);
      transition: transform 0.2s ease;
      box-shadow: var(--shadow-lg, 0 4px 16px rgba(0,0,0,0.2));
    }

    .sidebar.open {
      transform: translateX(0);
    }

    .sidebar-toggle {
      display: flex;
    }

    .sidebar-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 15;
      background: rgba(0, 0, 0, 0.3);
    }

    .sidebar-backdrop.visible {
      display: block;
    }

    .content-inner {
      padding: 1.5rem 1rem;
    }

    pre {
      font-size: 0.8125rem;
    }

    table {
      display: block;
      overflow-x: auto;
    }
  }
`;

class DocsView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._observer = null;
    this._activeId = null;
    this._expandedSections = new Set();
    this._scrollSpySuppressed = false;
  }

  connectedCallback() {
    this.render();
    this.setupSidebarClicks();
    this.setupScrollSpy();
    this.scrollToHash();
    this.setupMobileToggle();
  }

  disconnectedCallback() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  get contentArea() {
    return this.shadowRoot.querySelector('.content-area');
  }

  render() {
    const sectionKeys = tocData.map(s => s.key);

    // Determine which section to expand initially
    const hash = location.hash.slice(1);
    if (hash) {
      const owning = this.findSectionForHeading(hash);
      if (owning) this._expandedSections.add(owning);
    }
    if (this._expandedSections.size === 0) {
      this._expandedSections.add('gettingStarted');
    }

    this.shadowRoot.innerHTML = `
      <style>${styles}</style>

      <div class="sidebar-backdrop"></div>

      <aside class="sidebar">
        <div class="sidebar-header">
          <h1>Documentation</h1>
          <p class="subtitle">svg-path-extended</p>
        </div>
        <nav class="sidebar-nav">
          ${tocData.map(section => `
            <div class="sidebar-section ${this._expandedSections.has(section.key) ? 'expanded' : ''}" data-section="${section.key}">
              <button class="section-toggle" data-section-toggle="${section.key}">
                <span class="chevron">\u25B6</span>
                ${escapeHtml(section.title)}
              </button>
              <div class="section-headings">
                ${section.headings.map(h => `
                  <button class="sidebar-heading" data-heading-id="${h.id}" data-level="${h.level}" title="${escapeHtml(h.title)}">
                    ${escapeHtml(h.title)}
                  </button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </nav>
      </aside>

      <div class="content-area">
        <div class="content-inner">
          ${sectionKeys.map(key => `
            <section class="doc-section" data-section-key="${key}">
              ${contentMap[key] || ''}
            </section>
          `).join('')}
        </div>
      </div>

      <button class="sidebar-toggle" aria-label="Toggle sidebar">\u2630</button>
    `;
  }

  findSectionForHeading(headingId) {
    for (const section of tocData) {
      if (section.headings.some(h => h.id === headingId)) {
        return section.key;
      }
    }
    return null;
  }

  setupSidebarClicks() {
    const nav = this.shadowRoot.querySelector('.sidebar-nav');
    nav.addEventListener('click', (e) => {
      // Section toggle
      const toggle = e.target.closest('[data-section-toggle]');
      if (toggle) {
        const key = toggle.dataset.sectionToggle;
        const el = this.shadowRoot.querySelector(`.sidebar-section[data-section="${key}"]`);
        if (el) {
          el.classList.toggle('expanded');
          if (el.classList.contains('expanded')) {
            this._expandedSections.add(key);
          } else {
            this._expandedSections.delete(key);
          }
        }
        return;
      }

      // Heading click
      const heading = e.target.closest('[data-heading-id]');
      if (heading) {
        const id = heading.dataset.headingId;
        this.scrollToId(id);

        // Close mobile sidebar
        this.shadowRoot.querySelector('.sidebar')?.classList.remove('open');
        this.shadowRoot.querySelector('.sidebar-backdrop')?.classList.remove('visible');
      }
    });
  }

  scrollToId(id) {
    const target = this.shadowRoot.getElementById(id);
    if (!target) return;

    // Suppress scroll spy during programmatic scroll to prevent
    // intermediate headings from flickering the sidebar highlight
    this._scrollSpySuppressed = true;
    this.setActiveHeading(id);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `${location.pathname}#${id}`);

    // Re-enable after scroll settles
    clearTimeout(this._scrollSpyTimer);
    this._scrollSpyTimer = setTimeout(() => {
      this._scrollSpySuppressed = false;
    }, 800);
  }

  scrollToHash() {
    const hash = location.hash.slice(1);
    if (hash) {
      // Defer to allow DOM to settle
      requestAnimationFrame(() => {
        const target = this.shadowRoot.getElementById(hash);
        if (target) {
          target.scrollIntoView({ block: 'start' });
          this.setActiveHeading(hash);
        }
      });
    }
  }

  setupScrollSpy() {
    // Collect all heading elements with IDs in the content area
    const contentArea = this.contentArea;
    if (!contentArea) return;

    const allIds = new Set();
    for (const section of tocData) {
      for (const h of section.headings) {
        allIds.add(h.id);
      }
    }

    // Wait for DOM, then observe
    requestAnimationFrame(() => {
      const headingEls = Array.from(
        this.shadowRoot.querySelectorAll('h2[id], h3[id]')
      ).filter(el => allIds.has(el.id));

      if (headingEls.length === 0) return;

      // Track which headings are visible; the topmost wins
      const visibleHeadings = new Map();

      this._observer = new IntersectionObserver(
        (entries) => {
          if (this._scrollSpySuppressed) return;
          for (const entry of entries) {
            if (entry.isIntersecting) {
              visibleHeadings.set(entry.target.id, entry.target);
            } else {
              visibleHeadings.delete(entry.target.id);
            }
          }

          // Find the topmost visible heading by DOM order
          if (visibleHeadings.size > 0) {
            let topmost = null;
            let topY = Infinity;
            for (const el of visibleHeadings.values()) {
              const rect = el.getBoundingClientRect();
              if (rect.top < topY) {
                topY = rect.top;
                topmost = el;
              }
            }
            if (topmost) {
              this.setActiveHeading(topmost.id);
            }
          }
        },
        {
          root: contentArea,
          rootMargin: '0px 0px -70% 0px',
          threshold: 0,
        }
      );

      for (const el of headingEls) {
        this._observer.observe(el);
      }
    });
  }

  setActiveHeading(id) {
    if (this._activeId === id) return;
    this._activeId = id;

    // Remove old active
    const prev = this.shadowRoot.querySelector('.sidebar-heading.active');
    if (prev) prev.classList.remove('active');

    // Expand the containing section (only opens, never closes others)
    const owning = this.findSectionForHeading(id);
    if (owning) {
      const el = this.shadowRoot.querySelector(`.sidebar-section[data-section="${owning}"]`);
      if (el && !el.classList.contains('expanded')) {
        el.classList.add('expanded');
        this._expandedSections.add(owning);
      }
    }

    // Set new active and scroll sidebar to keep it visible
    const next = this.shadowRoot.querySelector(`.sidebar-heading[data-heading-id="${id}"]`);
    if (next) {
      next.classList.add('active');
      next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  setupMobileToggle() {
    const toggle = this.shadowRoot.querySelector('.sidebar-toggle');
    const sidebar = this.shadowRoot.querySelector('.sidebar');
    const backdrop = this.shadowRoot.querySelector('.sidebar-backdrop');

    if (toggle) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        backdrop.classList.toggle('visible');
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop.classList.remove('visible');
      });
    }
  }
}

customElements.define('docs-view', DocsView);

export default DocsView;
