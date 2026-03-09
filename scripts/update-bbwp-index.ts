import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BBWP_DIR = join(__dirname, '..', 'website', 'bbwp');
const INDEX_PATH = join(BBWP_DIR, 'index.html');

interface ParsedFile {
  date: string;
  roadmap: string;
  feature: string;
  type: 'bbwp' | 'mw';
  filename: string;
}

function parseFilename(filename: string): ParsedFile | null {
  // Expected: YYYY-MM-DD-HH:MM:SS--roadmapName--featureName.(bbwp|mw).html
  const match = /^(\d{4}-\d{2}-\d{2}-\d{2}:\d{2}:\d{2})--(.+?)--(.+?)\.(bbwp|mw)\.html$/.exec(filename);
  if (!match) return null;
  return {
    date: match[1].replace(/-(\d{2}:\d{2}:\d{2})$/, ' $1'),
    roadmap: match[2].replace(/-/g, ' '),
    feature: match[3].replace(/-/g, ' '),
    type: match[4] as 'bbwp' | 'mw',
    filename,
  };
}

/** Group key: everything before the .(bbwp|mw).html suffix */
function groupKey(filename: string): string {
  return filename.replace(/\.(bbwp|mw)\.html$/, '');
}

const program = new Command();
program
  .name('update-bbwp-index')
  .description('Regenerate website/bbwp/index.html from BBWP files in the directory')
  .action(async () => {
    // Scan for .bbwp.html and .mw.html files (excluding index.html)
    const files = readdirSync(BBWP_DIR)
      .filter((f) => /\.(bbwp|mw)\.html$/.test(f))
      .sort()
      .reverse(); // Descending (newest first)

    // Group by shared prefix (timestamp--roadmap--feature)
    const groups = new Map<string, { bbwp?: ParsedFile; mw?: ParsedFile }>();
    for (const f of files) {
      const parsed = parseFilename(f);
      if (!parsed) continue;
      const key = groupKey(f);
      if (!groups.has(key)) groups.set(key, {});
      groups.get(key)![parsed.type] = parsed;
    }

    let listHtml: string;
    const groupCount = groups.size;
    if (groupCount === 0) {
      listHtml = '  <p class="empty">No BBWP files yet.</p>';
    } else {
      const items = Array.from(groups.entries())
        .map(([, group]) => {
          const ref = group.bbwp || group.mw!;
          const links: string[] = [];
          if (group.bbwp) links.push(`<a href="./${group.bbwp.filename}">bbwp</a>`);
          if (group.mw) links.push(`<a href="./${group.mw.filename}">mw</a>`);
          return `    <li><span class="date">${ref.date}</span><span class="links">${links.join(' <span class="sep">|</span> ')}</span><span class="meta">${ref.roadmap} / ${ref.feature}</span></li>`;
        })
        .join('\n');
      listHtml = `  <p class="count">${groupCount} artifact${groupCount !== 1 ? 's' : ''}</p>\n  <ul>\n${items}\n  </ul>`;
    }

    // Read existing index and replace between markers
    const indexContent = readFileSync(INDEX_PATH, 'utf-8');
    const updated = indexContent.replace(
      /<!-- BBWP_INDEX_START -->[\s\S]*?<!-- BBWP_INDEX_END -->/,
      `<!-- BBWP_INDEX_START -->\n${listHtml}\n  <!-- BBWP_INDEX_END -->`,
    );

    writeFileSync(INDEX_PATH, updated);
    console.log(`Updated bbwp/index.html with ${groupCount} group(s) from ${files.length} file(s)`);
  });

program.parse();
