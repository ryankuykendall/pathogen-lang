// Storage step 7 (note 50): scripts/export-workspace-sources.ts reads the
// .pathogen files of records that hold files from R2, so the audits (the
// built-in name collision check, the semantics audit) still see every
// program after the migration. Against the local dev stack: creates a
// one-file and a several-file workspace through the dev API (both stored in
// today's shape), runs the export (read-only) into tmp/, checks their files,
// and deletes the workspaces.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-storage-step7-export.ts

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEV_API = 'http://localhost:8787';
const OUT = join('tmp', 'kv-sources', 'dev-step7-export');
const user = `export7${Math.random().toString(36).slice(2, 16).padEnd(14, 'x')}`;
const ONE = 'define ViewBox(0, 0, 10, 10);\n// STEP7 export one\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\n// STEP7 export main\ngear(1);\n';
const GEARS = 'module;\n// STEP7 export gears\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!ok) failures++;
};
async function create(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user },
    body: JSON.stringify({ name: 'export check', ...body }),
  });
  return ((await res.json()) as { id: string }).id;
}
const fileFor = (key: string, suffix = ''): string =>
  join(OUT, `${key.replace(/[^A-Za-z0-9_-]+/g, '--')}${suffix}.pathogen`);

const one = await create({ code: ONE });
const several = await create({ files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } } });
try {
  const out = execFileSync('npx', ['tsx', 'scripts/export-workspace-sources.ts', '--env', 'dev', '--out', OUT], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  check('the export runs', /wrote \d+ workspaces/.test(out), out.slice(-400));
  const oneFile = fileFor(`workspace:${one}`);
  check('a one-file workspace is exported as <key>.pathogen, from R2', existsSync(oneFile) && readFileSync(oneFile, 'utf-8') === ONE);
  const mainFile = fileFor(`workspace:${several}`, '--main');
  const gearsFile = fileFor(`workspace:${several}`, '--parts--gears');
  check(
    'a several-file workspace is exported as one file per .pathogen file',
    existsSync(mainFile) &&
      readFileSync(mainFile, 'utf-8') === MAIN &&
      existsSync(gearsFile) &&
      readFileSync(gearsFile, 'utf-8') === GEARS,
    { mainFile, gearsFile },
  );
} finally {
  // The export takes minutes; the pooled connection is gone by then (EPIPE),
  // so each delete is retried on a fresh one.
  for (const id of [one, several]) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${DEV_API}/workspace/${id}`, {
          method: 'DELETE',
          headers: { 'X-User-Id': user, Connection: 'close' },
        });
        if (res.ok) break;
      } catch (err) {
        if (attempt === 3) console.log(`could not delete ${id} (owner ${user}): ${(err as Error).message}`);
      }
    }
  }
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
