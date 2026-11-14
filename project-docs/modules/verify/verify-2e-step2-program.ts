// 2e, step 2 (note 58): a snapshot keeps which program drew its image, on the
// real Worker runtime (workerd, its local R2 and D1, and its multipart
// parsing), which the Node test doubles stand in for.
//
// Signs in as verify-storage-step5-snapshots.ts does: one throwaway user and
// session in the local D1. Then, against the dev API:
//   - a snapshot with `files` naming `program` (a program that isn't in
//     entryPoints) reads back through /files with that program;
//   - one with `code` reads back as drawn by main.pathogen;
//   - one with `files` and no `program` takes the main;
//   - a `program` that isn't one of the files is refused with its message.
// Everything is deleted after.
//
//   npm run dev:stack                       (Pages :3000, API :8787)
//   npx tsx project-docs/modules/verify/verify-2e-step2-program.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const DEV_API = 'http://localhost:8787';
const USER_ID = `verify2e2-${randomUUID().slice(0, 8)}`;
const TOKEN = `verify2e2-${randomUUID()}`;
const COOKIE = `pathogen_session=${TOKEN}`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const DEMO = 'import { gear } from "../parts/gears.pathogen";\ngear(8);\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 400)}`}`);
  if (!ok) failures++;
};

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

async function api(method: string, path: string, body?: BodyInit): Promise<Response> {
  return fetch(`${DEV_API}${path}`, {
    method,
    headers: {
      Cookie: COOKIE,
      'X-Pathogen-Snapshot': '1',
      ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body } : {}),
  });
}

function snapshotForm(code: { code: string } | { files: unknown }): FormData {
  const form = new FormData();
  form.append('svg', new Blob([SVG], { type: 'image/svg+xml' }), 'image.svg');
  if ('code' in code) form.append('code', new Blob([code.code], { type: 'text/plain' }), 'code.pathogen');
  else form.append('files', JSON.stringify(code.files));
  form.append('card', new Blob([PNG], { type: 'image/png' }), 'card.png');
  form.append('meta', JSON.stringify({ width: 100, height: 100 }));
  return form;
}

async function programOf(sid: string): Promise<unknown> {
  return ((await (await api('GET', `/snapshot/${sid}/files`)).json()) as { program?: unknown }).program;
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Verify 2e2', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const made: string[] = [];
try {
  const created = await api(
    'POST',
    '/workspace',
    JSON.stringify({
      name: '2e step 2 verify',
      files: {
        'main.pathogen': { text: MAIN },
        'parts/gears.pathogen': { text: GEARS },
        'demos/gears.pathogen': { text: DEMO },
      },
    }),
  );
  const ws = ((await created.json()) as { id: string }).id;
  made.push(ws);
  check('a workspace with three files is created', created.status === 201);

  const files = {
    'main.pathogen': { text: MAIN },
    'parts/gears.pathogen': { text: GEARS },
    'demos/gears.pathogen': { text: DEMO },
  };
  const named = await api(
    'POST',
    `/workspace/${ws}/snapshots`,
    snapshotForm({ files: { files, entryPoints: ['main.pathogen'], program: 'demos/gears.pathogen' } }),
  );
  const namedBody = (await named.json()) as { snapshot: { id: string } };
  check('a snapshot naming demos/gears.pathogen is stored (201)', named.status === 201, namedBody);
  check(
    '/files says demos/gears.pathogen drew it',
    (await programOf(namedBody.snapshot.id)) === 'demos/gears.pathogen',
  );

  const withCode = await api('POST', `/workspace/${ws}/snapshots`, snapshotForm({ code: 'circle(1, 1, 1);' }));
  const codeBody = (await withCode.json()) as { snapshot: { id: string } };
  check(
    'a snapshot with `code` reads as drawn by main.pathogen',
    (await programOf(codeBody.snapshot.id)) === 'main.pathogen',
  );

  const unnamed = await api(
    'POST',
    `/workspace/${ws}/snapshots`,
    snapshotForm({ files: { files, entryPoints: ['main.pathogen'] } }),
  );
  const unnamedBody = (await unnamed.json()) as { snapshot: { id: string } };
  check('a snapshot with no `program` takes the main', (await programOf(unnamedBody.snapshot.id)) === 'main.pathogen');

  const wrong = await api(
    'POST',
    `/workspace/${ws}/snapshots`,
    snapshotForm({ files: { files: { 'main.pathogen': { text: MAIN } }, program: 'demos/gears.pathogen' } }),
  );
  const wrongBody = (await wrong.json()) as { error?: string };
  check(
    'a program that isn’t one of the files is refused (400, its message)',
    wrong.status === 400 &&
      wrongBody.error === '"program" names "demos/gears.pathogen", which isn\'t one of the snapshot\'s files.',
    [wrong.status, wrongBody],
  );
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
