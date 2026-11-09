/**
 * The in-memory project host (src/host/memory-host.ts; project-docs/modules/
 * 51-phase-2c-plan.md, piece 2): the playground's workspace, read by the same
 * loader the CLI and VS Code use. It answers as the Node host does on disk,
 * so a workspace's import errors read like a project folder's.
 */
import { describe, expect, it } from 'vitest';

import { compile, createMemoryProjectHost, resolveModules } from '../src';

const DOTS = 'module;\nexport fn dot(x, y) {\n  circle(x, y, 5);\n}\n';
const MAIN = 'import { dot } from "./parts/dots.pathogen";\ndot(10, 10);\n';

const decode = (r: Awaited<ReturnType<ReturnType<typeof createMemoryProjectHost>['readFile']>>): string =>
  r.ok ? new TextDecoder().decode(r.bytes) : `(${r.code})`;

describe('createMemoryProjectHost', () => {
  const host = createMemoryProjectHost(
    { 'main.pathogen': MAIN, 'parts/dots.pathogen': DOTS },
    { label: 'Dots', folders: ['examples/empty'] },
  );

  it('reads a file by its project path, and names the workspace in messages', async () => {
    expect(decode(await host.readFile('/parts/dots.pathogen'))).toBe(DOTS);
    expect(host.projectLabel).toBe('Dots');
  });

  it('answers a folder, an empty folder and the top as folders', async () => {
    for (const path of ['/parts', '/examples', '/examples/empty', '/']) {
      expect(await host.readFile(path)).toEqual({ ok: false, code: 'folder' });
    }
  });

  it("answers a name that differs only in letter case with the file's spelling, and anything else as not found", async () => {
    expect(await host.readFile('/Parts/Dots.pathogen')).toEqual({
      ok: false,
      code: 'case-mismatch',
      actual: '/parts/dots.pathogen',
    });
    expect(await host.readFile('/parts/gone.pathogen')).toEqual({
      ok: false,
      code: 'not-found',
      osPath: 'parts/gone.pathogen',
    });
  });

  it('reads a Map live, so a host made once sees later edits', async () => {
    const files = new Map([['a.pathogen', 'module;\n']]);
    const live = createMemoryProjectHost(files, { label: 'Live' });
    files.set('a.pathogen', 'module;\nexport const x = 1;\n');
    expect(decode(await live.readFile('/a.pathogen'))).toBe('module;\nexport const x = 1;\n');
  });
});

describe('a workspace compiled through the loader', () => {
  const files = { 'main.pathogen': MAIN, 'parts/dots.pathogen': DOTS };

  it("compiles main with its library's fn", async () => {
    const host = createMemoryProjectHost(files, { label: 'Dots' });
    const { graph, errors } = await resolveModules(MAIN, { host, entry: '/main.pathogen' });
    expect(errors).toEqual([]);
    expect([...graph.files.keys()]).toEqual(['/parts/dots.pathogen']);
    // circle(10, 10, 5), drawn by the library's fn into main's drawing: from
    // (cx - r, cy), two half-turn arcs of 2r across and back.
    expect(compile(MAIN, { modules: graph }).layers[0].data).toBe('M 5 10 a 5 5 0 1 1 10 0 a 5 5 0 1 1 -10 0');
  });

  it('a missing import is a load error at its line, naming the workspace path it looked for', async () => {
    const main = 'import { dot } from "./parts/dot.pathogen";\ndot(1, 1);\n';
    const host = createMemoryProjectHost({ ...files, 'main.pathogen': main }, { label: 'Dots' });
    const { errors } = await resolveModules(main, { host, entry: '/main.pathogen' });
    expect(errors.map((e) => [e.file, e.line, e.message])).toEqual([
      ['/main.pathogen', 1, 'import file "./parts/dot.pathogen" was not found (looked for parts/dot.pathogen).'],
    ]);
  });

  it('a file that differs only in letter case is reported with its spelling', async () => {
    const main = 'import { dot } from "./Parts/dots.pathogen";\ndot(1, 1);\n';
    const host = createMemoryProjectHost({ ...files, 'main.pathogen': main }, { label: 'Dots' });
    const { errors } = await resolveModules(main, { host, entry: '/main.pathogen' });
    expect(errors.map((e) => e.message)).toEqual([
      'import file "./Parts/dots.pathogen" differs from the file on disk only in letter case: "./parts/dots.pathogen". Paths are case-sensitive on every system.',
    ]);
  });
});
