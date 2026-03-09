// Blog View - Blog listing page
// Route: /blog

import { blogIndex } from '../../utils/blog-content.js';

const styles = `
  :host {
    display: block;
    height: 100%;
    overflow-y: auto;
    background: var(--bg-primary, #ffffff);
  }

  .blog-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    padding-block-end: 8rem;
  }

  h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .subtitle {
    margin: 0 0 2rem 0;
    color: var(--text-secondary, #666);
    font-size: 0.875rem;
  }

  .posts-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .post-card {
    padding: 1.5rem;
    background: var(--bg-secondary, #f5f5f5);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
  }

  .post-card:hover {
    border-color: var(--accent-color, #0066cc);
    background: var(--bg-primary, #ffffff);
  }

  .post-title {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .post-card:hover .post-title {
    color: var(--accent-color, #0066cc);
  }

  .post-date {
    margin: 0 0 0.75rem 0;
    font-size: 0.8125rem;
    color: var(--text-tertiary, #999);
  }

  .post-description {
    margin: 0;
    color: var(--text-secondary, #666);
    font-size: 0.9375rem;
    line-height: 1.5;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    color: var(--text-secondary, #666);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9375rem;
  }

  @media (max-width: 600px) {
    .blog-container {
      padding: 1rem;
      padding-block-end: 8rem;
    }

    .post-card {
      padding: 1rem;
    }

    .post-title {
      font-size: 1.125rem;
    }
  }
`;

class BlogView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  setupEventListeners() {
    this.shadowRoot.addEventListener('click', (e) => {
      const card = e.target.closest('[data-slug]');
      if (card) {
        const slug = card.dataset.slug;
        this.dispatchEvent(
          new CustomEvent('navigate', {
            bubbles: true,
            composed: true,
            detail: { path: '/blog/:slug', params: { slug } },
          }),
        );
      }
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>

      <div class="blog-container">
        <h1>Blog</h1>
        <p class="subtitle">Thoughts, tutorials, and updates about svg-path-extended</p>

        ${
          blogIndex.length === 0
            ? `
          <div class="empty-state">
            <p>No blog posts yet. Check back soon!</p>
          </div>
        `
            : `
          <div class="posts-list">
            ${blogIndex
              .map(
                (post) => `
              <article class="post-card" data-slug="${post.slug}">
                <h2 class="post-title">${post.title}</h2>
                <p class="post-date">${this.formatDate(post.date)}</p>
                ${post.description ? `<p class="post-description">${post.description}</p>` : ''}
              </article>
            `,
              )
              .join('')}
          </div>
        `
        }
      </div>
    `;
  }
}

customElements.define('blog-view', BlogView);

export default BlogView;
