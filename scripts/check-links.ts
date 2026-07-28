import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BLOG_DIR = join(ROOT, 'website', 'blog');

const BASE = 'http://localhost:3000';

interface LinkResult {
  href: string;
  text: string;
  status: number | string;
  ok: boolean;
}

interface PageResults {
  page: string;
  links: LinkResult[];
}

/**
 * Discover all blog post slugs by reading frontmatter from website/blog/*.md
 */
async function discoverBlogSlugs(): Promise<string[]> {
  const files = await fs.readdir(BLOG_DIR);
  const slugs: string[] = [];

  for (const file of files) {
    if (!file.endsWith('.md') || file === 'CLAUDE.md') continue;

    const content = await fs.readFile(join(BLOG_DIR, file), 'utf-8');
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) continue;

    const slugMatch = frontmatterMatch[1].match(/^slug:\s*(.+)$/m);
    if (slugMatch) {
      slugs.push(slugMatch[1].trim().replace(/^["']|["']$/g, ''));
    }
  }

  return slugs.sort();
}

/**
 * Results are cached by resolved target so a link repeated across pages costs
 * one navigation, not one per occurrence.
 */
const targetCache = new Map<string, { status: number | string; ok: boolean }>();

/**
 * Extract and check every internal link on a page.
 *
 * Three link forms exist in this codebase and all three are checked:
 *  - `/pathogen/...`  absolute site paths (with or without a `#fragment`)
 *  - `#fragment`      same-page anchors — the form docs/*.md use for cross-
 *                     references, since every doc section renders into one page
 *  - `foo.md#frag`    relative markdown paths, which survive into the built
 *                     HTML unrewritten and therefore 404 when clicked
 *
 * Only the first form used to be checked, so the entire docs cross-reference
 * surface was unverified and drifted (prefixed vs unprefixed heading slugs).
 */
async function checkPageLinks(
  page: puppeteer.Page,
  pageUrl: string,
): Promise<LinkResult[]> {
  await page.goto(`${BASE}${pageUrl}`, {
    waitUntil: 'networkidle2',
    timeout: 15000,
  });

  // Wait for SPA to render content
  await page
    .waitForSelector('.blog-post, article, .markdown-body, h2, .doc-section', {
      timeout: 10000,
    })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));

  // Extract every internal link — external, mailto, and bare "#" are skipped.
  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href]');
    const seen = new Set<string>();
    return Array.from(anchors)
      .map((a) => ({
        href: a.getAttribute('href') || '',
        text: (a.textContent || '').trim().substring(0, 60),
      }))
      .filter((l) => {
        if (!l.href || l.href === '#') return false;
        if (/^[a-z]+:/i.test(l.href) || l.href.startsWith('//')) return false;
        if (seen.has(l.href)) return false;
        seen.add(l.href);
        return true;
      });
  });

  const results: LinkResult[] = [];

  // Phase 1 — same-page anchors. Verified against the DOM we are already on,
  // so this must run before any navigation below.
  const fragmentLinks = links.filter((l) => l.href.startsWith('#'));
  if (fragmentLinks.length > 0) {
    const found: boolean[] = await page.evaluate(
      (ids: string[]) =>
        ids.map(
          (id) =>
            !!(
              document.getElementById(id) ||
              document.querySelector(`[name="${id}"]`)
            ),
        ),
      fragmentLinks.map((l) => decodeURIComponent(l.href.slice(1))),
    );
    fragmentLinks.forEach((l, i) => {
      results.push({
        href: l.href,
        text: l.text,
        status: found[i] ? 200 : 'ANCHOR_NOT_FOUND',
        ok: found[i],
      });
    });
  }

  // Phase 2 — links that require navigating to a different document. Hrefs are
  // resolved against the current page URL so relative forms (`./sibling-post`,
  // `foo.md#frag`) are tested exactly as a browser would follow them.
  for (const link of links) {
    if (link.href.startsWith('#')) continue;

    let resolvedPath: string;
    let anchor = '';
    try {
      const url = new URL(link.href, `${BASE}${pageUrl}`);
      resolvedPath = url.pathname + url.search;
      anchor = url.hash.slice(1);
    } catch {
      results.push({
        href: link.href,
        text: link.text,
        status: 'UNRESOLVABLE_HREF',
        ok: false,
      });
      continue;
    }

    const cacheKey = resolvedPath + (anchor ? `#${anchor}` : '');
    const cached = targetCache.get(cacheKey);
    if (cached) {
      results.push({ href: link.href, text: link.text, ...cached });
      continue;
    }

    const path = resolvedPath;
    let outcome: { status: number | string; ok: boolean };
    try {
      const resp = await page.goto(`${BASE}${path}`, {
        waitUntil: 'networkidle2',
        timeout: 10000,
      });
      const status = resp?.status() || 0;
      if (status < 200 || status >= 400) {
        outcome = { status, ok: false };
      } else if (anchor) {
        await new Promise((r) => setTimeout(r, 2000));
        const anchorExists = await page.evaluate(
          (id: string) =>
            !!(
              document.getElementById(id) ||
              document.querySelector(`[name="${id}"]`)
            ),
          decodeURIComponent(anchor),
        );
        outcome = {
          status: anchorExists ? 200 : 'ANCHOR_NOT_FOUND',
          ok: anchorExists,
        };
      } else {
        outcome = { status, ok: true };
      }
    } catch (err: any) {
      outcome = { status: err.message, ok: false };
    }

    // A relative markdown path survives the docs build unrewritten, so it
    // resolves to a path the site doesn't serve. Say so — the fix is always
    // the same-page `#section-anchor` form.
    if (!outcome.ok && /\.md(\?|#|$)/.test(link.href)) {
      outcome = {
        status: `${outcome.status} — relative .md link; use the #section-anchor form`,
        ok: false,
      };
    }

    targetCache.set(cacheKey, outcome);
    results.push({ href: link.href, text: link.text, ...outcome });
  }

  return results;
}

async function checkLinks(opts: { base: string }): Promise<void> {
  if (opts.base) {
    // Allow override but we use the constant for simplicity
  }

  console.log('Discovering blog posts...');
  const slugs = await discoverBlogSlugs();
  console.log(`  Found ${slugs.length} blog posts: ${slugs.join(', ')}\n`);

  const pagesToCheck = [
    // Documentation page
    '/pathogen/docs',
    // All blog posts
    ...slugs.map((s) => `/pathogen/blog/${s}`),
  ];

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const allResults: PageResults[] = [];
  let totalBroken = 0;
  let totalChecked = 0;

  for (const pageUrl of pagesToCheck) {
    console.log(`--- Checking: ${pageUrl} ---`);

    const results = await checkPageLinks(page, pageUrl);
    const broken = results.filter((r) => !r.ok);

    totalChecked += results.length;
    totalBroken += broken.length;

    for (const r of results) {
      if (r.ok) {
        console.log(`  ✓ ${r.href}`);
      } else {
        console.log(`  ✗ ${r.href} — ${r.status}`);
      }
    }

    allResults.push({ page: pageUrl, links: results });
    console.log('');
  }

  await browser.close();

  // Summary
  console.log('========================================');
  console.log(`Pages checked: ${pagesToCheck.length}`);
  console.log(`Links checked: ${totalChecked}`);
  console.log(`Broken links:  ${totalBroken}`);

  if (totalBroken > 0) {
    console.log('\nBroken links by page:');
    for (const { page: p, links } of allResults) {
      const broken = links.filter((l) => !l.ok);
      if (broken.length > 0) {
        console.log(`\n  ${p}:`);
        for (const l of broken) {
          console.log(`    ${l.href} (${l.status}) — "${l.text}"`);
        }
      }
    }
    process.exit(1);
  } else {
    console.log('\nAll links OK!');
    process.exit(0);
  }
}

const program = new Command();
program
  .name('check-links')
  .description(
    'Check all internal links across blog posts and documentation pages',
  )
  .option(
    '--base <url>',
    'Base URL of the local server',
    'http://localhost:3000',
  )
  .action(async (opts) => {
    try {
      await checkLinks(opts);
    } catch (err) {
      console.error('Fatal error:', err);
      process.exit(2);
    }
  });
program.parse();
