import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = join(__dirname, '..', 'website', 'blog');

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

async function prompt(rl: readline.Interface, question: string, defaultValue = ''): Promise<string> {
  return new Promise((resolve) => {
    const defaultHint = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${defaultHint}: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

interface Options {
  title?: string;
  slug?: string;
  date?: string;
  description?: string;
}

const program = new Command();
program
  .name('new-blog-post')
  .description('Bootstrap a new blog post with frontmatter')
  .option('--title <title>', 'Post title')
  .option('--slug <slug>', 'URL slug (auto-generated from title if omitted)')
  .option('--date <date>', 'Publication date (defaults to today)')
  .option('--description <desc>', 'Post description')
  .action(async (opts: Options) => {
    // Ensure blog directory exists
    await fs.mkdir(BLOG_DIR, { recursive: true });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // Check if running non-interactively (all required args provided)
      const nonInteractive = opts.title && opts.slug;

      // Get title
      const title = opts.title || (await prompt(rl, 'Title'));
      if (!title) {
        console.error('Error: Title is required');
        process.exit(1);
      }

      // Generate defaults
      const defaultSlug = slugify(title);
      const defaultDate = getToday();

      // Get other fields
      const slug = opts.slug || (await prompt(rl, 'Slug', defaultSlug));
      const date = opts.date || (nonInteractive ? defaultDate : await prompt(rl, 'Date', defaultDate));
      const description = opts.description || (nonInteractive ? '' : await prompt(rl, 'Description (optional)'));

      // Generate frontmatter
      const frontmatter = `---
title: "${title}"
date: "${date}"
slug: "${slug}"
description: "${description}"
---

# ${title}

<!-- Prerequisites callout: name what the reader should already know, with
     links to earlier posts or docs pages. See
     website/guidelines/voice-and-audience.md. Delete the callout (and this
     comment) only if the post is truly standalone. -->
> **Prerequisites:**

`;

      // Write file
      const filename = `${slug}.md`;
      const filepath = join(BLOG_DIR, filename);

      // Check if file exists
      try {
        await fs.access(filepath);
        console.error(`Error: ${filename} already exists`);
        process.exit(1);
      } catch {
        // File doesn't exist, good to proceed
      }

      await fs.writeFile(filepath, frontmatter);

      console.log(`\nCreated: website/blog/${filename}`);
      console.log('\nBefore you write: read website/guidelines/voice-and-audience.md');
      console.log('\nNext steps:');
      console.log(`  1. Edit website/blog/${filename}`);
      console.log('  2. Run: npm run build:blog');
      console.log('  3. Run: npm run dev:website');
    } finally {
      rl.close();
    }
  });
program.parse();
