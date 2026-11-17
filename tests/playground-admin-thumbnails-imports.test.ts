// @vitest-environment jsdom
//
// The admin thumbnail tool (/admin/thumbnails) and a workspace of several files (2e step
// 5f): it compiled `workspace.code`, which such a workspace doesn't carry, so it skipped
// them. It now compiles the main with its imports, read from the workspace's files, and
// draws that path.

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../playground/services/compiler-worker.js', () => ({ default: { compileWithContext: vi.fn() } }));
vi.mock('../playground/services/thumbnail-service.js', () => ({ default: { generateThumbnail: vi.fn() } }));
vi.mock('../playground/services/api.js', () => ({ thumbnailApi: {}, workspaceApi: { get: vi.fn() } }));

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const PATH = 'M -4 0 A 4 4 0 1 1 4 0 A 4 4 0 1 1 -4 0';

interface Tool extends HTMLElement {
  _token: string | null;
  _autoGenerateOne: (id: string) => Promise<void>;
  _statuses: Record<string, string>;
}

type Mock = ReturnType<typeof vi.fn>;
interface Mocks {
  get: Mock;
  compile: Mock;
  upload: Mock;
}

/** The tool, its services mocked afresh, and the workspace GET /workspace/:id answers. */
async function tool(answer: Record<string, unknown>): Promise<{ tool: Tool } & Mocks> {
  const api = (await import('../playground/services/api.js')) as unknown as { workspaceApi: { get: Mock } };
  const worker = (await import('../playground/services/compiler-worker.js')).default as unknown as {
    compileWithContext: Mock;
  };
  const thumbnails = (await import('../playground/services/thumbnail-service.js')).default as unknown as {
    generateThumbnail: Mock;
  };
  for (const mock of [api.workspaceApi.get, worker.compileWithContext, thumbnails.generateThumbnail]) mock.mockReset();
  api.workspaceApi.get.mockResolvedValue(answer);
  worker.compileWithContext.mockResolvedValue({ path: PATH });
  thumbnails.generateThumbnail.mockResolvedValue({ ok: true });
  await import('../playground/components/views/admin-thumbnails-view.ts');
  const view = document.createElement('admin-thumbnails-view') as Tool;
  view._token = 'secret';
  return {
    tool: view,
    get: api.workspaceApi.get,
    compile: worker.compileWithContext,
    upload: thumbnails.generateThumbnail,
  };
}

describe('the admin thumbnail tool', () => {
  beforeAll(() => {
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  it('a workspace from before phase 2, carrying only its text: compiled as main.pathogen, as before', async () => {
    const { tool: view, compile, upload } = await tool({ id: 'w2', name: 'Rings', userId: 'u1', code: 'M 0 0 h 9' });
    await view._autoGenerateOne('w2');
    const [text, , , options] = compile.mock.calls[0] as [string, number, unknown, Record<string, unknown>];
    expect([text, Object.keys(options), (options.workspace as { label: string }).label]).toEqual([
      'M 0 0 h 9',
      ['workspace'],
      'Rings',
    ]);
    expect([upload.mock.calls.length, view._statuses.w2]).toEqual([1, 'done']);
  });

  it('a file that can’t be read fails it, never “done” with no thumbnail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const {
      tool: view,
      compile,
      upload,
    } = await tool({
      id: 'w3',
      name: 'Lost',
      userId: 'u1',
      files: {
        'main.pathogen': { sha256: 'm', size: MAIN.length, text: MAIN },
        'parts/gears.pathogen': { sha256: 'g', size: 1, unreadable: true },
      },
      entryPoints: ['main.pathogen'],
    });
    await view._autoGenerateOne('w3');
    expect([compile.mock.calls.length, upload.mock.calls.length, view._statuses.w3]).toEqual([0, 0, 'error']);
  });

  it('compiles a workspace of several files from its main, with its imports, and draws that path', async () => {
    const {
      tool: view,
      compile,
      upload,
    } = await tool({
      id: 'w1',
      name: 'Gears',
      userId: 'u1',
      // GET /workspace/:id: the files with their text; no `code` with several.
      files: {
        'main.pathogen': { sha256: 'm', size: MAIN.length, text: MAIN },
        'parts/gears.pathogen': { sha256: 'g', size: GEARS.length, text: GEARS },
      },
      folders: [],
      entryPoints: ['main.pathogen'],
      preferences: { toFixed: 2 },
    });
    await view._autoGenerateOne('w1');

    const [text, , , options] = compile.mock.calls[0] as [
      string,
      number,
      unknown,
      { toFixed: number; workspace: { files: Map<string, string>; entry: string; label: string } },
    ];
    expect([text, options.toFixed, options.workspace.entry, options.workspace.label]).toEqual([
      MAIN,
      2,
      'main.pathogen',
      'Gears',
    ]);
    expect(options.workspace.files).toEqual(
      new Map([
        ['main.pathogen', MAIN],
        ['parts/gears.pathogen', GEARS],
      ]),
    );
    const [id, , , , sent] = upload.mock.calls[0] as [
      string,
      unknown,
      unknown,
      unknown,
      { svgString: string; kind: string },
    ];
    expect([id, sent.kind, sent.svgString.includes(`<path d="${PATH}"`), view._statuses.w1]).toEqual([
      'w1',
      'auto',
      true,
      'done',
    ]);
  });
});
