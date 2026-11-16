// The app with and without its grain texture (theme.css body::before: an SVG noise filter
// tiled over the page and blended with multiply), for the comparison mockup. Signed in on
// the dev stack as a throwaway user, full Chrome, 1440x900: each page in light and dark,
// grain on and off, as a full screenshot at 1x and a detail at 2x.
//
//   npx tsx project-docs/preview-raster-perf/shoot-grain.ts
//
// Writes website/bbwp/2026-11-16-grain/<page>-<theme>-<on|off>[-detail].png (not committed).

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const OUT = 'website/bbwp/2026-11-16-grain';
const USER_ID = `perf-${randomUUID().slice(0, 8)}`;
const TOKEN = `perf-${randomUUID()}`;
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

function d1(sql: string): void {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'svg-path-extended-users',
      '--local',
      '--persist-to=../.wrangler/state',
      '--command',
      sql,
    ],
    { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] },
  );
}
const api = async (method: string, path: string, body?: unknown): Promise<Response> =>
  fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: `pathogen_session=${TOKEN}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const GEARS =
  'module;\n\nexport fn gear(at, r) {\n  star(at.x, at.y, r, r - 6, 12);\n  circle(at.x, at.y, r * 0.3);\n}\n';
const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\n\ndefine default PathLayer("gears") #{\n  stroke: oklch(0.55 0.2 330);\n  stroke-width: 1.5;\n  fill: oklch(0.9 0.06 330);\n};\n\ngear(Point(55, 50), 40);\ngear(Point(150, 50), 28);\n';

/** Where each page's 2x detail is taken (CSS pixels): a stretch of page background. */
const DETAIL: Record<string, { x: number; y: number; width: number; height: number }> = {
  home: { x: 0, y: 0, width: 640, height: 400 },
  workspaces: { x: 0, y: 0, width: 640, height: 400 },
  workspace: { x: 800, y: 0, width: 640, height: 400 },
  explore: { x: 0, y: 0, width: 640, height: 400 },
};

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Grain', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
let id = '';
try {
  const created = (await (
    await api('POST', '/workspace', {
      name: 'Gears',
      files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
      folders: ['parts'],
      entryPoints: ['main.pathogen'],
    })
  ).json()) as { id: string; slug: string };
  id = created.id;
  const PAGES: Record<string, string> = {
    home: '/',
    workspaces: '/workspaces',
    workspace: `/workspace/${created.slug}--${created.id}`,
    explore: '/explore',
  };

  const shoot = async (page: Page, name: string, theme: string, grain: string, scale: 1 | 2): Promise<void> => {
    const file = `${OUT}/${name}-${theme}-${grain}${scale === 2 ? '-detail' : ''}.png`;
    if (scale === 1) await page.screenshot({ path: file });
    else await page.screenshot({ path: file, clip: { ...DETAIL[name]!, scale: 1 } });
  };

  for (const scale of [1, 2] as const) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: scale });
      await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
      await page.evaluateOnNewDocument(`localStorage.setItem('pathogen-theme', ${JSON.stringify(theme)});`);
      for (const [name, path] of Object.entries(PAGES)) {
        await page.goto(`${PAGES_URL}${path}`, { waitUntil: 'networkidle2' });
        await pause(name === 'workspace' ? 5000 : 1500);
        // Is the grain there on this page at all?
        const grain = await page.evaluate(`getComputedStyle(document.body, '::before').backgroundImage.slice(0, 30)`);
        if (scale === 1) console.log(`${name} ${theme}: body::before ${JSON.stringify(grain)}`);
        await shoot(page, name, theme, 'on', scale);
        const off = await page.addStyleTag({ content: 'body::before { display: none !important; }' });
        await pause(400);
        await shoot(page, name, theme, 'off', scale);
        await off.evaluate((el) => el.remove());
      }
      await page.close();
    }
  }
  console.log(`screenshots in ${OUT}`);
} finally {
  if (id) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
  await Promise.race([browser.close(), pause(10_000)]);
  process.exit(0);
}
