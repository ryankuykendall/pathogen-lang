// Blog View - Blog listing page
// Route: /blog

import { blogIndex } from '../../utils/blog-content.js';
import styles from './blog-view.css';

interface BlogPost {
  slug: string;
  title: string;
  date: string;
  description?: string;
}

class BlogView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  private setupEventListeners(): void {
    this.shadowRoot!.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const card = target.closest('[data-slug]') as HTMLElement | null;
      if (card) {
        const slug = card.dataset.slug!;
        this.dispatchEvent(
          new CustomEvent<{ path: string; params: Record<string, string> }>('navigate', {
            bubbles: true,
            composed: true,
            detail: { path: '/blog/:slug', params: { slug } },
          }),
        );
      }
    });
  }

  private render(): void {
    const posts = blogIndex as BlogPost[];

    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="blog-container">
        <h1>Blog</h1>
        <p class="subtitle">Thoughts, tutorials, and updates about pathogen-lang</p>

        ${
          posts.length === 0
            ? `
          <div class="empty-state">
            <p>No blog posts yet. Check back soon!</p>
          </div>
        `
            : `
          <div class="posts-list">
            ${posts
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
