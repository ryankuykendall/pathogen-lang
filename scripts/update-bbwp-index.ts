import { Command } from 'commander';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BBWP_DIR = join(__dirname, '..', 'website', 'bbwp');
const INDEX_PATH = join(BBWP_DIR, 'index.html');

function parseFilename(filename: string): { date: string; roadmap: string; feature: string } | null {
  // Expected: YYYY-MM-DD-HH:MM:SS--roadmapName--featureName.html
  const match = filename.match(/^(\d{4}-\d{2}-\d{2}-\d{2}:\d{2}:\d{2})--(.+?)--(.+?)\.html$/);
  if (!match) return null;
  return {
    date: match[1].replace(/-(\d{2}:\d{2}:\d{2})$/, ' $1'),
    roadmap: match[2].replace(/-/g, ' '),
    feature: match[3].replace(/-/g, ' '),
  };
}

const program = new Command();
program
  .name('update-bbwp-index')
  .description('Regenerate website/bbwp/index.html from BBWP files in the directory')
  .action(async () => {
    // Scan for .html files (excluding index.html)
    const files = readdirSync(BBWP_DIR)
      .filter(f => f.endsWith('.html') && f !== 'index.html')
      .sort()
      .reverse(); // Descending (newest first)

    let listHtml: string;
    if (files.length === 0) {
      listHtml = '  <p class="empty">No BBWP files yet.</p>';
    } else {
      const items = files.map(f => {
        const parsed = parseFilename(f);
        const meta = parsed
          ? `<span class="meta">${parsed.roadmap} / ${parsed.feature}</span>`
          : '';
        return `    <li><a href="./${f}">${f}${meta}</a></li>`;
      }).join('\n');
      listHtml = `  <p class="count">${files.length} file${files.length !== 1 ? 's' : ''}</p>\n  <ul>\n${items}\n  </ul>`;
    }

    // Read existing index and replace between markers
    const indexContent = readFileSync(INDEX_PATH, 'utf-8');
    const updated = indexContent.replace(
      /<!-- BBWP_INDEX_START -->[\s\S]*?<!-- BBWP_INDEX_END -->/,
      `<!-- BBWP_INDEX_START -->\n${listHtml}\n  <!-- BBWP_INDEX_END -->`,
    );

    writeFileSync(INDEX_PATH, updated);
    console.log(`Updated bbwp/index.html with ${files.length} file(s)`);
  });

program.parse();
