// Storage step 6 (note 50): the detail page (/u/:handle/:slug) and its
// source.json read an approval's files through the API Worker's
// GET /approval-source/:id, on the real Pages worker (localhost:3000) and
// API Worker (localhost:8787).
//
// Sign-in and admin are set up as in steps 4 and 5: a throwaway user and
// session written to the local D1, and the dev API's ADMIN_TOKEN from
// api/.dev.vars (never printed) for requeue + approve. It approves a
// workspace that is just main.pathogen and one with several files, edits the
// first after approval, and checks what visitors see. Everything is deleted
// after.
//
//   npm run dev:stack, then PATHOGEN_API_BASE=http://localhost:8787 npm run build:website
//   npx tsx project-docs/modules/verify/verify-storage-step6-detail-page.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const HANDLE = `verify6${randomUUID().slice(0, 8)}`;
const USER_ID = `verify6-${randomUUID().slice(0, 8)}`;
const TOKEN = `verify6-${randomUUID()}`;
const COOKIE = `pathogen_session=${TOKEN}`;
const SPIRAL = 'define ViewBox(0, 0, 100, 100);\n// STEP6 approved\ncircle(50, 50, 40);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\n// STEP6 main\ngear(4);\n';

const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').replace(
  /^"(.*)"$/,
  '$1',
);
if (!ADMIN_TOKEN) {
  console.error('api/.dev.vars has no ADMIN_TOKEN, so the dev API has no admin to act as.');
  process.exit(1);
}

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  if (!ok) failures++;
};
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function d1(sql: string): void {
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'svg-path-extended-users', '--local', '--persist-to=../.wrangler/state', '--command', sql],
    { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] },
  );
}

async function api(method: string, path: string, body?: unknown, admin = false): Promise<Response> {
  const url = admin ? `${DEV_API}${path}?token=${encodeURIComponent(ADMIN_TOKEN)}` : `${DEV_API}${path}`;
  return fetch(url, {
    method,
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function approveNew(name: string, body: Record<string, unknown>): Promise<{ id: string; slug: string }> {
  const created = await api('POST', '/workspace', { name, ...body });
  const id = ((await created.json()) as { id: string }).id;
  await api('POST', `/admin/requeue/${id}`, {}, true);
  const approved = await api('POST', `/admin/review/${id}`, { decision: 'approve', svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' }, true);
  const { slug } = (await approved.json()) as { slug: string };
  return { id, slug };
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${HANDLE}', 'Verify 6', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const made: string[] = [];
try {
  const one = await approveNew('Step6 Spiral', { code: SPIRAL });
  made.push(one.id);
  // An edit after approval waits for re-review; visitors keep the approved text.
  await api('PUT', `/workspace/${one.id}`, { code: `${SPIRAL}// edited after approval\n` });

  const page = await fetch(`${PAGES_URL}/u/${HANDLE}/${one.slug}`);
  const html = await page.text();
  check('the detail page renders (200)', page.status === 200, page.status);
  check(
    'it shows the approved source, not the later edit',
    html.includes(`<pre class="detail-source-code">${escapeHtml(SPIRAL)}</pre>`) && !html.includes('edited after approval'),
    html.slice(html.indexOf('detail-source'), html.indexOf('detail-source') + 300),
  );
  check('with its line count', html.includes(`Pathogen &middot; ${SPIRAL.split('\n').length} lines`));

  const sourceJson = (await (await fetch(`${PAGES_URL}/u/${HANDLE}/${one.slug}/source.json`)).json()) as {
    code?: string;
    files?: Record<string, { text: string }>;
    entryPoints?: string[];
  };
  check(
    'source.json gives `code` (what "Open as new workspace" reads) and the files',
    sourceJson.code === SPIRAL &&
      sourceJson.files?.['main.pathogen']?.text === SPIRAL &&
      JSON.stringify(sourceJson.entryPoints) === '["main.pathogen"]',
    sourceJson,
  );

  const several = await approveNew('Step6 Gears', {
    files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
  });
  made.push(several.id);
  const severalHtml = await (await fetch(`${PAGES_URL}/u/${HANDLE}/${several.slug}`)).text();
  check(
    'an approval with several files shows its main program',
    severalHtml.includes(`<pre class="detail-source-code">${escapeHtml(MAIN)}</pre>`),
  );
  const severalJson = (await (await fetch(`${PAGES_URL}/u/${HANDLE}/${several.slug}/source.json`)).json()) as {
    code?: string;
    files?: Record<string, { text: string }>;
  };
  check(
    'its source.json has every file and no `code`',
    severalJson.code === undefined && severalJson.files?.['parts/gears.pathogen']?.text === GEARS,
    severalJson,
  );
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
