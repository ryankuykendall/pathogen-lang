// Storage step 5 (note 50): snapshots store a manifest naming the
// workspace's blobs, on the real Worker runtime (workerd, its local R2 and
// D1, and its multipart parsing), which the Node test doubles stand in for.
//
// It signs in the way scripts/seed-dev-users.ts seeds dev data: one
// throwaway user and session written to the local D1 with
// `wrangler d1 execute --local`. Then, against the dev API: create a
// workspace; take a snapshot the way today's playground does (FormData with
// `code`, services/api.ts snapshotApi.create); save different code; read
// the snapshot's code back; start a workspace from it; take a snapshot of a
// workspace with several files (`files`, one sent by hash) and read it
// through /files. Everything is deleted after.
//
//   npm run dev:stack                       (Pages :3000, API :8787)
//   npx tsx project-docs/modules/verify/verify-storage-step5-snapshots.ts

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const DEV_API = 'http://localhost:8787';
const USER_ID = `verify5-${randomUUID().slice(0, 8)}`;
const TOKEN = `verify5-${randomUUID()}`;
const COOKIE = `pathogen_session=${TOKEN}`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
const DRAWN = 'define ViewBox(0, 0, 100, 100);\n// STEP5 drawn\ncircle(50, 50, 40);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 400)}`}`);
  if (!ok) failures++;
};

function d1(sql: string): void {
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'svg-path-extended-users', '--local', '--persist-to=../.wrangler/state', '--command', sql],
    { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] },
  );
}

async function api(method: string, path: string, body?: BodyInit, json = true): Promise<Response> {
  return fetch(`${DEV_API}${path}`, {
    method,
    headers: {
      Cookie: COOKIE,
      'X-Pathogen-Snapshot': '1',
      ...(json && typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
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

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Verify 5', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const made: string[] = [];
try {
  const created = await api('POST', '/workspace', JSON.stringify({ name: 'step5 verify', code: 'circle(1, 1, 1);' }));
  const ws = ((await created.json()) as { id: string }).id;
  made.push(ws);
  check('a signed-in session creates a workspace', created.status === 201);

  // Today's playground: the code that drew the image, as `code`.
  const snap = await api('POST', `/workspace/${ws}/snapshots`, snapshotForm({ code: DRAWN }));
  const snapBody = (await snap.json()) as { snapshot: { id: string; codeBytes: number } };
  check('a snapshot with `code` is stored (201)', snap.status === 201, snapBody);
  const sid = snapBody.snapshot.id;
  check('its codeBytes is the text’s size', snapBody.snapshot.codeBytes === new TextEncoder().encode(DRAWN).byteLength);

  // The workspace moves on; the snapshot keeps what drew it.
  const save = await api('PUT', `/workspace/${ws}`, JSON.stringify({ code: 'rect(0, 0, 9, 9);' }));
  check('the workspace saves other code', save.status === 200);
  const code = await api('GET', `/snapshot/${sid}/code`);
  check('GET /snapshot/:sid/code still returns the drawn text', (await code.text()) === DRAWN);
  const files = (await (await api('GET', `/snapshot/${sid}/files`)).json()) as {
    files: Record<string, { sha256: string; text: string }>;
  };
  check(
    'GET /snapshot/:sid/files names the workspace blob by hash',
    files.files['main.pathogen'].sha256 === sha256(DRAWN) && files.files['main.pathogen'].text === DRAWN,
    files,
  );

  const started = await api('POST', `/snapshot/${sid}/workspace`);
  const startedBody = (await started.json()) as { id: string; code?: string };
  made.push(startedBody.id);
  check('starting a workspace from it holds the drawn text', started.status === 201 && startedBody.code === DRAWN, startedBody);
  const startedLoad = (await (await api('GET', `/workspace/${startedBody.id}`)).json()) as { code?: string };
  check('and loads it back from its own prefix', startedLoad.code === DRAWN, startedLoad);

  // Several files: one sent as text, one by hash (already saved).
  const multi = await api(
    'POST',
    '/workspace',
    JSON.stringify({
      name: 'step5 verify multi',
      files: { 'main.pathogen': { text: 'gear(1);' }, 'parts/gears.pathogen': { text: GEARS } },
    }),
  );
  const multiId = ((await multi.json()) as { id: string }).id;
  made.push(multiId);
  const multiSnap = await api(
    'POST',
    `/workspace/${multiId}/snapshots`,
    snapshotForm({
      files: { files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { sha256: sha256(GEARS) } } },
    }),
  );
  const multiSid = ((await multiSnap.json()) as { snapshot: { id: string } }).snapshot.id;
  check('a snapshot with `files` (one by hash) is stored', multiSnap.status === 201);
  const multiFiles = (await (await api('GET', `/snapshot/${multiSid}/files`)).json()) as {
    files: Record<string, { text: string }>;
  };
  check(
    'GET /files returns both texts',
    multiFiles.files['main.pathogen']?.text === MAIN && multiFiles.files['parts/gears.pathogen']?.text === GEARS,
    multiFiles,
  );
  const multiCode = await api('GET', `/snapshot/${multiSid}/code`);
  check('GET /code answers 409 for several files', multiCode.status === 409);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
