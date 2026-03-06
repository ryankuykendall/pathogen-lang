// Blog Post View - Individual blog post page
// Route: /blog/:slug

import { store } from '../../state/store.js';
import { blogIndex, posts } from '../../utils/blog-content.js';
import { hljsThemeDark } from '../../utils/docs-content.js';
import '../blog/reactive-svg.js';
import '../blog/mini-workspace.js';

const styles = `
  :host {
    display: block;
    height: 100%;
    overflow-y: auto;
    background: var(--bg-primary, #ffffff);
  }

  .post-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    padding-block-end: 8rem;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-bottom: 1.5rem;
    color: var(--accent-color, #0066cc);
    text-decoration: none;
    font-size: 0.875rem;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    font-family: inherit;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .post-meta {
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .post-meta h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .post-date {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-tertiary, #999);
  }

  .post-content {
    color: var(--text-primary, #1a1a1a);
  }

  /* Markdown content styles - matching docs-view */
  .post-content h1 {
    margin: 2rem 0 1rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--accent-color, #0066cc);
  }

  .post-content h2 {
    margin: 1.5rem 0 1rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .post-content h3 {
    margin: 1.5rem 0 0.75rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .post-content h4 {
    margin: 1rem 0 0.5rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .post-content p {
    margin: 0 0 1rem 0;
    color: var(--text-primary, #1a1a1a);
    line-height: 1.6;
  }

  /* Inline code only (not in pre blocks) */
  .post-content code:not(.hljs) {
    font-family: var(--font-mono, monospace);
    font-size: 0.875em;
    background: var(--bg-secondary, #f5f5f5);
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
  }

  .post-content pre {
    border-radius: 8px;
    overflow-x: auto;
    font-family: var(--font-mono, monospace);
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0 0 1rem 0;
  }

  .post-content pre code {
    padding: 1rem;
    display: block;
    font-size: inherit;
  }

  /* highlight.js theme */
  ${hljsThemeDark}

  .post-content ul, .post-content ol {
    margin: 0 0 1rem 0;
    padding-left: 1.5rem;
    color: var(--text-primary, #1a1a1a);
  }

  .post-content li {
    margin-bottom: 0.5rem;
    line-height: 1.5;
  }

  .post-content blockquote {
    margin: 0 0 1rem 0;
    padding: 0.75rem 1rem;
    border-left: 4px solid var(--accent-color, #0066cc);
    background: var(--bg-secondary, #f5f5f5);
    color: var(--text-secondary, #666);
  }

  .post-content blockquote p {
    margin: 0;
  }

  .post-content hr {
    border: none;
    border-top: 1px solid var(--border-color, #e0e0e0);
    margin: 2rem 0;
  }

  .post-content strong {
    font-weight: 600;
  }

  .post-content a {
    color: var(--accent-color, #0066cc);
    text-decoration: none;
  }

  .post-content a:hover {
    text-decoration: underline;
    color: var(--accent-hover, #0055aa);
  }

  .not-found {
    text-align: center;
    padding: 3rem;
  }

  .not-found h2 {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    color: var(--text-primary, #1a1a1a);
  }

  .not-found p {
    margin: 0;
    color: var(--text-secondary, #666);
  }

  @media (max-width: 600px) {
    .post-container {
      padding: 1rem;
      padding-block-end: 8rem;
    }

    .post-meta h1 {
      font-size: 1.5rem;
    }

    .post-content pre {
      font-size: 0.8125rem;
    }
  }
`;

class BlogPostView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.unsubscribe = null;
  }

  connectedCallback() {
    this.render();

    // Subscribe to route param changes
    this.unsubscribe = store.subscribe(['routeParams'], () => {
      this.render();
    });

    this.setupEventListeners();
  }

  disconnectedCallback() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  setupEventListeners() {
    this.shadowRoot.addEventListener('click', (e) => {
      const backLink = e.target.closest('.back-link');
      if (backLink) {
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('navigate', {
          bubbles: true,
          composed: true,
          detail: { path: '/blog' }
        }));
      }
    });
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  render() {
    const routeParams = store.get('routeParams') || {};
    const slug = routeParams.slug;
    const postContent = posts[slug];
    const postMeta = blogIndex.find(p => p.slug === slug);

    if (!postContent || !postMeta) {
      this.shadowRoot.innerHTML = `
        <style>${styles}</style>
        <div class="post-container">
          <button class="back-link">&larr; Back to Blog</button>
          <div class="not-found">
            <h2>Post not found</h2>
            <p>The blog post you're looking for doesn't exist.</p>
          </div>
        </div>
      `;
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>${styles}</style>

      <div class="post-container">
        <button class="back-link">&larr; Back to Blog</button>

        <header class="post-meta">
          <h1>${postMeta.title}</h1>
          <p class="post-date">${this.formatDate(postMeta.date)}</p>
        </header>

        <article class="post-content">
          ${postContent}
        </article>
      </div>
    `;
  }
}

customElements.define('blog-post-view', BlogPostView);

export default BlogPostView;
