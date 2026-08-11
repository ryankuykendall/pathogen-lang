// Blog View - Blog listing page
// Route: /blog

import { blogIndex } from '../../utils/blog-content.js';
import styles from './blog-view.css';

interface BlogPost {
  slug: string;
  title: string;
  date: string;
  description?: string;
  series?: string;
  seriesPart?: number;
  seriesDescription?: string;
}

type BlogIndexGroup = { series: string; entries: BlogPost[] } | { series?: undefined; entry: BlogPost };

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

  // Group same-series posts — wherever they fall in the date-desc index, so an
  // interleaved non-series post can't split the section — into one labeled
  // series section anchored at the series' newest post; mirrors build-blog.ts.
  private groupPosts(posts: BlogPost[]): BlogIndexGroup[] {
    const seriesEntries = new Map<string, BlogPost[]>();
    for (const post of posts) {
      if (!post.series) continue;
      const run = seriesEntries.get(post.series) ?? [];
      run.push(post);
      seriesEntries.set(post.series, run);
    }
    const groups: BlogIndexGroup[] = [];
    const emittedSeries = new Set<string>();
    for (const post of posts) {
      if (post.series) {
        if (emittedSeries.has(post.series)) continue;
        emittedSeries.add(post.series);
        groups.push({ series: post.series, entries: seriesEntries.get(post.series)! });
      } else {
        groups.push({ entry: post });
      }
    }
    return groups;
  }

  // Card titles are h3 inside a series group so the series h2 keeps
  // heading authority over its children.
  private renderCard(post: BlogPost, headingTag: 'h2' | 'h3' = 'h2'): string {
    return `
              <article class="post-card" data-slug="${post.slug}">
                <${headingTag} class="post-title">${post.title}</${headingTag}>
                <p class="post-date">${this.formatDate(post.date)}${post.seriesPart ? `<span class="post-part"> · Part ${post.seriesPart}</span>` : ''}</p>
                ${post.description ? `<p class="post-description">${post.description}</p>` : ''}
              </article>
            `;
  }

  private renderGroup(group: BlogIndexGroup): string {
    if (group.series === undefined) return this.renderCard(group.entry);
    const parts = [...group.entries].sort((a, b) => (a.seriesPart ?? 0) - (b.seriesPart ?? 0));
    const seriesDescription = parts.find((p) => p.seriesDescription)?.seriesDescription;
    const seriesId = `series-${group.series
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`;
    return `
              <section class="series-group" aria-labelledby="${seriesId}">
                <header class="series-header">
                  <p class="series-eyebrow">Series · ${parts.length} ${parts.length === 1 ? 'part' : 'parts'}</p>
                  <h2 class="series-title" id="${seriesId}">${group.series}</h2>
                  ${seriesDescription ? `<p class="series-description">${seriesDescription}</p>` : ''}
                </header>
                ${parts.map((p) => this.renderCard(p, 'h3')).join('')}
              </section>
            `;
  }

  private render(): void {
    const posts = blogIndex as BlogPost[];

    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="blog-container">
        <h1>Blog</h1>
        <p class="subtitle">Tutorials, deep-dives, and updates about pathogen-lang — written in plain language for people who build things with code</p>

        ${
          posts.length === 0
            ? `
          <div class="empty-state">
            <p>No blog posts yet. Check back soon!</p>
          </div>
        `
            : `
          <div class="posts-list">
            ${this.groupPosts(posts)
              .map((group) => this.renderGroup(group))
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
