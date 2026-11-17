// The Pages worker's read of an approved workspace's source (storage step 6;
// website/approval-source.ts). The detail page and source.json get an
// approval's files from the API Worker's GET /approval-source/:id; an
// approval from before phase 2 carries its `code` and needs no request.

import { describe, expect, it, vi } from 'vitest';

import { mainSourceText, readApprovalSource, servedSource } from '../../website/approval-source';

const API = 'https://api.example.test';
const MAIN = 'import { gear } from "./gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';

function fetchAnswering(status: number, body: unknown): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('readApprovalSource', () => {
  it('reads an approval from before phase 2 from its `code`, without a request', async () => {
    const fetchImpl = vi.fn();
    const source = await readApprovalSource({ workspaceId: 'w1', code: 'M 0 0' }, API, fetchImpl);
    expect(source).toEqual({
      files: { 'main.pathogen': { text: 'M 0 0' } },
      folders: [],
      entryPoints: ['main.pathogen'],
      code: 'M 0 0',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("asks the API Worker for an approval's files, by its workspace id", async () => {
    const body = {
      workspaceId: 'w/2',
      files: {
        'main.pathogen': { sha256: 'a'.repeat(64), size: 10, text: MAIN },
        'gears.pathogen': { sha256: 'b'.repeat(64), size: 20, text: GEARS },
      },
      folders: [],
      entryPoints: ['main.pathogen'],
      codeHash: 'h',
    };
    const fetchImpl = fetchAnswering(200, body);
    const source = await readApprovalSource(
      { workspaceId: 'w/2', files: { 'main.pathogen': { sha256: 'a'.repeat(64), size: 10 } } },
      API,
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl).toHaveBeenCalledWith(`${API}/approval-source/w%2F2`);
    expect(source).toEqual(body);
    expect(mainSourceText(source!)).toBe(MAIN);
  });

  it('is null when the API answers an error, is unreachable, or answers something else', async () => {
    const approval = { workspaceId: 'w3', files: {} };
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const notFound = fetchAnswering(404, { error: 'x' }) as unknown as typeof fetch;
    expect(await readApprovalSource(approval, API, notFound)).toBe(null);
    const unreachable = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await readApprovalSource(approval, API, unreachable as unknown as typeof fetch)).toBe(null);
    expect(
      await readApprovalSource(approval, API, fetchAnswering(200, { files: 'nope' }) as unknown as typeof fetch),
    ).toBe(null);
    expect(silence).toHaveBeenCalledTimes(3);
    silence.mockRestore();
  });
});

describe('mainSourceText', () => {
  it("is the first entry point's text, or empty when there's no program", () => {
    const files = { 'app.pathogen': { text: 'A' }, 'main.pathogen': { text: 'M' } };
    expect(mainSourceText({ files, folders: [], entryPoints: ['app.pathogen', 'main.pathogen'] })).toBe('A');
    expect(mainSourceText({ files, folders: [], entryPoints: [] })).toBe('');
  });

  it('is the first program the approval holds, as the review screen approves it (2e step 6)', () => {
    const files = { 'main.pathogen': { text: 'M' } };
    expect(mainSourceText({ files, folders: [], entryPoints: ['gone.pathogen', 'main.pathogen'] })).toBe('M');
  });
});

describe('servedSource (2e step 6)', () => {
  it('every name, the folders, the programs and the main, and no text', () => {
    const served = servedSource({
      files: { 'parts/gears.pathogen': { text: GEARS }, 'main.pathogen': { text: MAIN } },
      folders: ['empty'],
      entryPoints: ['gone.pathogen', 'main.pathogen'],
    });
    expect(served).toEqual({
      names: ['parts/gears.pathogen', 'main.pathogen'],
      folders: ['empty'],
      entryPoints: ['gone.pathogen', 'main.pathogen'],
      main: 'main.pathogen',
    });
    expect(JSON.stringify(served)).not.toContain('gear(');
  });
});
