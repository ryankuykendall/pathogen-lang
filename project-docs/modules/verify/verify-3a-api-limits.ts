// Note 80's checks owed before the push, through the real Worker runtime
// (wrangler dev, the dev stack's API on :8787), not Node's:
// - PUT /workspace/:id/file with a 6 MB body sent in pieces, no Content-Length:
//   refused 413 by the capped read;
// - 5 MB exactly the same way: stored;
// - a save of 24 MB less a little, all of it two-byte characters: saved, and
//   one just over 24 MB: refused 413 with how to send large files.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-3a-api-limits.ts

import { writeFileSync } from 'node:fs';

const API = 'http://localhost:8787';
const MB = 1024 * 1024;
const owner = `limits-${Date.now()}`;
const results: { check: string; ok: boolean; detail?: unknown }[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  results.push({ check: label, ok, ...(ok ? {} : { detail }) });
  if (!ok) failures++;
};

const headers = { 'X-User-Id': owner, Connection: 'close' };

/** A body of `bytes` bytes of "1", in 1 MB pieces: fetch sends it chunked, with no Content-Length. */
function pieces(bytes: number): ReadableStream<Uint8Array> {
  let left = bytes;
  return new ReadableStream({
    pull(controller) {
      if (left <= 0) {
        controller.close();
        return;
      }
      const size = Math.min(MB, left);
      left -= size;
      controller.enqueue(new Uint8Array(size).fill(0x31));
    },
  });
}

async function putFile(id: string, bytes: number): Promise<{ status: number; body: string }> {
  const res = await fetch(`${API}/workspace/${id}/file`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
    body: pieces(bytes),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  return { status: res.status, body: await res.text() };
}

async function json(method: string, path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

const created = await json('POST', '/workspace', {
  name: 'API limits',
  files: { 'main.pathogen': { text: 'M 0 0' } },
  entryPoints: ['main.pathogen'],
});
const id = created.data.id as string;
check('a workspace to try them on', created.status === 201, created);
// The refusals run last: a body refused before it's all read takes down
// wrangler dev's own proxy ("Network connection lost", seen in mockup runs
// too), though the Worker has answered 413. The edge doesn't have that proxy.
try {
  const exactly = await putFile(id, 5 * MB);
  check('5 MB exactly, in pieces, is stored', exactly.status === 201, exactly);

  // Two-byte characters (é stays as it is in JSON): data files of 5 MB less a little.
  const data = (): string => `"${'é'.repeat((5 * MB) / 2 - 8)}"`;
  const files: Record<string, { text: string }> = { 'main.pathogen': { text: 'M 0 0' } };
  for (let i = 0; i < 4; i++) files[`data/d${i}.json`] = { text: data() };
  let t = performance.now();
  const saved = await json('PUT', `/workspace/${id}`, { files, entryPoints: ['main.pathogen'] });
  const savedMs = performance.now() - t;
  check(`a save of 20 MB of two-byte text is saved (${savedMs.toFixed(0)} ms)`, saved.status === 200, {
    status: saved.status,
    error: saved.data.error,
  });
  // A fifth: 25 MB of body, past the 24 MB a save can send.
  files['data/d4.json'] = { text: data() };
  t = performance.now();
  const refused = await json('PUT', `/workspace/${id}`, { files, entryPoints: ['main.pathogen'] });
  check(
    `a save just past 24 MB is refused, 413, with how to send large files (${(performance.now() - t).toFixed(0)} ms)`,
    refused.status === 413 && String(refused.data.error).startsWith('A save can send at most 24 MB.'),
    refused,
  );
  const over = await putFile(id, 6 * MB).catch((err: unknown) => ({ status: 0, body: String(err) }));
  check('a 6 MB file sent in pieces is refused, 413', over.status === 413, over);
} finally {
  await fetch(`${API}/workspace/${id}`, { method: 'DELETE', headers }).catch(() => undefined);
}

writeFileSync(
  'project-docs/modules/verify/verify-3a-api-limits-results.json',
  `${JSON.stringify({ date: new Date().toISOString(), results }, null, 2)}\n`,
);
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;
