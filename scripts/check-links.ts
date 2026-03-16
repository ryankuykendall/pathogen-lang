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
 * Extract and check all internal links on a page
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

  // Extract all internal links
  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href]');
    return Array.from(anchors)
      .map((a) => ({
        href: a.getAttribute('href') || '',
        text: (a.textContent || '').trim().substring(0, 60),
      }))
      .filter((l) => l.href.startsWith('/pathogen/'));
  });

  const results: LinkResult[] = [];

  for (const link of links) {
    if (link.href.includes('#')) {
      // Anchor link — navigate to page and verify anchor exists
      const [path, anchor] = link.href.split('#');
      const navUrl = `${BASE}${path}`;

      try {
        await page.goto(navUrl, { waitUntil: 'networkidle2', timeout: 10000 });
        await new Promise((r) => setTimeout(r, 2000));

        const anchorExists = await page.evaluate((id) => {
          return !!(
            document.getElementById(id) ||
            document.querySelector(`[name="${id}"]`)
          );
        }, anchor);

        results.push({
          href: link.href,
          text: link.text,
          status: anchorExists ? 200 : 'ANCHOR_NOT_FOUND',
          ok: anchorExists,
        });
      } catch (err: any) {
        results.push({
          href: link.href,
          text: link.text,
          status: err.message,
          ok: false,
        });
      }
    } else {
      // Non-anchor link — check HTTP status
      try {
        const resp = await page.goto(`${BASE}${link.href}`, {
          waitUntil: 'networkidle2',
          timeout: 10000,
        });
        const status = resp?.status() || 0;
        const ok = status >= 200 && status < 400;
        results.push({ href: link.href, text: link.text, status, ok });
      } catch (err: any) {
        results.push({
          href: link.href,
          text: link.text,
          status: err.message,
          ok: false,
        });
      }
    }
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
