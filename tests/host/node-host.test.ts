/**
 * The Node adapters (src/node): reading project files with the case and
 * containment rules, finding the project folder, installed-font search, the
 * cache, downloads and the offline switches. Uses real folders under
 * tests/tmp/ and, for downloads, a real HTTP server on 127.0.0.1.
 */
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { delimiter, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { minimalSfnt, ttfToWoff } from './font-bytes';
import { compile } from '../../src';
import { buildFontRegistry, resolveFonts } from '../../src/host/load-fonts';
import {
  createNodeFontHost,
  defaultCacheDir,
  fileCache,
  findProjectRoot,
  fontDirsFromEnv,
  fontFileStamps,
  loadProjectFile,
  loadProjectFileSync,
  offlineReason,
  projectEntry,
  readProjectFile,
  systemFontDirs,
} from '../../src/node';

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { NodeFontHostOptions } from '../../src/node';

const TMP = join(__dirname, '..', 'tmp');
/** Creating symbolic links needs extra rights on Windows. */
const canLink = process.platform !== 'win32';
/** macOS and Windows by default: this file is found under another letter case. */
const caseInsensitiveFs = existsSync(__filename.toUpperCase());
/** A folder with no permissions can still be listed on Windows, and by root. */
const canLockFolders = process.platform !== 'win32' && process.getuid?.() !== 0;
let base: string;
let project: string;
let outside: string;

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  base = mkdtempSync(join(TMP, 'node-host-'));
  project = join(base, 'my-gears');
  outside = join(base, 'elsewhere');
  mkdirSync(join(project, 'fonts', 'Raleway'), { recursive: true });
  mkdirSync(join(project, 'parts'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(project, 'pathogen.json'), '{ "entryPoints": ["main.pathogen"] }');
  writeFileSync(join(project, 'fonts', 'Baumans-Regular.ttf'), 'font-bytes');
  writeFileSync(join(project, 'fonts', 'Raleway', 'Raleway-Bold.ttf'), minimalSfnt('raleway-bold'));
  writeFileSync(join(outside, 'secret.txt'), 'secret');
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const text = (result: Awaited<ReturnType<typeof readProjectFile>>) =>
  result.ok ? new TextDecoder().decode(result.bytes) : result;

describe('readProjectFile', () => {
  it('reads a file by project path', async () => {
    expect(text(await readProjectFile(project, '/fonts/Baumans-Regular.ttf'))).toBe('font-bytes');
  });

  it('reports a letter-case mismatch with the full spelling on disk', async () => {
    expect(await readProjectFile(project, '/Fonts/baumans-regular.ttf')).toEqual({
      ok: false,
      code: 'case-mismatch',
      actual: '/fonts/Baumans-Regular.ttf',
    });
  });

  it('reports a missing file with the OS path it looked for', async () => {
    expect(await readProjectFile(project, '/fonts/Missing.ttf')).toEqual({
      ok: false,
      code: 'not-found',
      osPath: join(project, 'fonts', 'Missing.ttf'),
    });
  });

  it('reports a folder, the project folder included, as a folder', async () => {
    expect(await readProjectFile(project, '/fonts')).toEqual({ ok: false, code: 'folder' });
    expect(await readProjectFile(project, '/')).toEqual({ ok: false, code: 'folder' });
  });

  it('a name that starts with two dots is an ordinary name inside the project', async () => {
    writeFileSync(join(project, '..alt.ttf'), 'alt-bytes');
    try {
      expect(text(await readProjectFile(project, '/..alt.ttf'))).toBe('alt-bytes');
    } finally {
      rmSync(join(project, '..alt.ttf'));
    }
  });

  it('a name stored in another Unicode form is the same name', async () => {
    // "Café" stored as "e" plus a combining accent, as macOS may store it,
    // while the program writes "é" as one character.
    const stored = `Cafe${String.fromCodePoint(0x301)}.ttf`;
    const written = `Caf${String.fromCodePoint(0xe9)}.ttf`;
    writeFileSync(join(project, 'fonts', stored), 'cafe-bytes');
    try {
      expect(text(await readProjectFile(project, `/fonts/${written}`))).toBe('cafe-bytes');
    } finally {
      rmSync(join(project, 'fonts', stored));
    }
  });

  it.skipIf(!canLink)('treats a symbolic link to a file outside the project as leaving it', async () => {
    symlinkSync(join(outside, 'secret.txt'), join(project, 'fonts', 'link.ttf'));
    try {
      expect(await readProjectFile(project, '/fonts/link.ttf')).toEqual({ ok: false, code: 'escapes-root' });
    } finally {
      unlinkSync(join(project, 'fonts', 'link.ttf'));
    }
  });

  it.skipIf(!canLink)(
    'a link to a folder outside gives one answer whether the file there exists, is missing or differs in case',
    async () => {
      symlinkSync(outside, join(project, 'outside-link'));
      try {
        const answers = await Promise.all(
          ['/outside-link/secret.txt', '/outside-link/missing.txt', '/outside-link/SECRET.txt'].map(async (path) =>
            readProjectFile(project, path),
          ),
        );
        expect(answers).toEqual([0, 1, 2].map(() => ({ ok: false, code: 'escapes-root' })));
      } finally {
        unlinkSync(join(project, 'outside-link'));
      }
    },
  );

  it.skipIf(!canLink)('a link that stays inside the project is followed, to a folder or a file', async () => {
    symlinkSync(join(project, 'fonts'), join(project, 'type'));
    symlinkSync(join(project, 'fonts', 'Baumans-Regular.ttf'), join(project, 'fonts', 'Alias.ttf'));
    try {
      expect([
        text(await readProjectFile(project, '/type/Baumans-Regular.ttf')),
        text(await readProjectFile(project, '/fonts/Alias.ttf')),
      ]).toEqual(['font-bytes', 'font-bytes']);
    } finally {
      unlinkSync(join(project, 'type'));
      unlinkSync(join(project, 'fonts', 'Alias.ttf'));
    }
  });

  it.skipIf(!canLink)('a link whose target is gone is not found', async () => {
    symlinkSync(join(project, 'fonts', 'Gone.ttf'), join(project, 'fonts', 'Dangling.ttf'));
    try {
      expect(await readProjectFile(project, '/fonts/Dangling.ttf')).toEqual({
        ok: false,
        code: 'not-found',
        osPath: join(project, 'fonts', 'Dangling.ttf'),
      });
    } finally {
      unlinkSync(join(project, 'fonts', 'Dangling.ttf'));
    }
  });

  it.skipIf(!canLink)(
    'a link is judged by where it points, so it never tells whether something outside exists',
    async () => {
      const links = join(project, 'links');
      mkdirSync(links, { recursive: true });
      // [link, target]: links to files and folders, outside and inside, there
      // and missing, absolute and relative, and chains of two links.
      const made: [string, string][] = [
        ['to-outside-file.ttf', join(outside, 'secret.txt')],
        ['to-missing-outside-file.ttf', join(outside, 'missing.txt')],
        ['relative-missing-outside.ttf', '../../elsewhere/missing.txt'],
        ['to-missing-outside-folder', join(outside, 'missing-folder')],
        ['hop-to-outside.ttf', join(links, 'to-missing-outside-file.ttf')],
        ['hop-to-hop.ttf', 'hop-to-outside.ttf'],
        ['to-missing-inside.ttf', join(project, 'fonts', 'Gone.ttf')],
        ['hop-to-missing-inside.ttf', 'to-missing-inside.ttf'],
        ['to-missing-inside-folder', join(project, 'gone-folder')],
      ];
      for (const [name, target] of made) symlinkSync(target, join(links, name));
      try {
        const answer = async (path: string) => {
          const result = await readProjectFile(project, path);
          return result.ok ? 'read' : result.code;
        };
        expect({
          outsideFile: await answer('/links/to-outside-file.ttf'),
          missingOutsideFile: await answer('/links/to-missing-outside-file.ttf'),
          relativeMissingOutside: await answer('/links/relative-missing-outside.ttf'),
          inMissingOutsideFolder: await answer('/links/to-missing-outside-folder/x.ttf'),
          twoHopsOutside: await answer('/links/hop-to-outside.ttf'),
          threeHopsOutside: await answer('/links/hop-to-hop.ttf'),
          missingInside: await answer('/links/to-missing-inside.ttf'),
          twoHopsMissingInside: await answer('/links/hop-to-missing-inside.ttf'),
          inMissingInsideFolder: await answer('/links/to-missing-inside-folder/x.ttf'),
        }).toEqual({
          outsideFile: 'escapes-root',
          missingOutsideFile: 'escapes-root',
          relativeMissingOutside: 'escapes-root',
          inMissingOutsideFolder: 'escapes-root',
          twoHopsOutside: 'escapes-root',
          threeHopsOutside: 'escapes-root',
          missingInside: 'not-found',
          twoHopsMissingInside: 'not-found',
          inMissingInsideFolder: 'not-found',
        });
      } finally {
        rmSync(links, { recursive: true });
      }
    },
  );

  it.skipIf(!canLink)(
    'whatever is outside — a file, a folder that can’t be opened, a loop, a folder or none — a link there leaves',
    async () => {
      // The answers a system gives for such paths differ (ENOTDIR, EACCES,
      // ELOOP, found or not); a link must get one answer for all of them, so
      // nothing outside is ever looked at.
      const links = join(project, 'links-2');
      const locked = join(outside, 'locked');
      mkdirSync(links, { recursive: true });
      mkdirSync(join(outside, 'there'), { recursive: true });
      mkdirSync(locked, { recursive: true });
      symlinkSync(join(outside, 'loop'), join(outside, 'loop'));
      symlinkSync('inside-loop.ttf', join(links, 'inside-loop.ttf'));
      // Beside the project: a loop, and another name for the project folder
      // (as ~/Dropbox names ~/Library/CloudStorage/Dropbox, or /tmp /private/tmp)
      symlinkSync(join(base, 'loop-beside'), join(base, 'loop-beside'));
      symlinkSync(project, join(base, 'alias'));
      const made: [string, string][] = [
        ['to-outside-file-as-folder', join(outside, 'secret.txt')],
        ['to-locked-outside', locked],
        ['to-outside-loop.ttf', join(outside, 'loop')],
        ['to-loop-beside.ttf', join(base, 'loop-beside')],
        // Out through a folder outside and back in, that folder there or not
        ['through-outside-there.ttf', '../../elsewhere/there/../../my-gears/fonts/Baumans-Regular.ttf'],
        ['through-outside-gone.ttf', '../../elsewhere/gone/../../my-gears/fonts/Baumans-Regular.ttf'],
        // Up through the folders above the project and straight back in
        ['up-and-back.ttf', '../../my-gears/fonts/Baumans-Regular.ttf'],
        // Back in through another name for the project folder
        ['through-alias.ttf', join(base, 'alias', 'fonts', 'Baumans-Regular.ttf')],
      ];
      for (const [name, target] of made) symlinkSync(target, join(links, name));
      if (canLockFolders) chmodSync(locked, 0o000);
      try {
        const answer = async (path: string) => {
          const result = await readProjectFile(project, path);
          return result.ok ? 'read' : result.code;
        };
        expect({
          outsideFileAsFolder: await answer('/links-2/to-outside-file-as-folder/x.ttf'),
          lockedOutsideFolder: await answer('/links-2/to-locked-outside/x.ttf'),
          outsideLoop: await answer('/links-2/to-outside-loop.ttf'),
          loopBeside: await answer('/links-2/to-loop-beside.ttf'),
          throughOutsideThere: await answer('/links-2/through-outside-there.ttf'),
          throughOutsideGone: await answer('/links-2/through-outside-gone.ttf'),
          upAndBack: await answer('/links-2/up-and-back.ttf'),
          throughAlias: await answer('/links-2/through-alias.ttf'),
          insideLoop: await answer('/links-2/inside-loop.ttf'),
        }).toEqual({
          outsideFileAsFolder: 'escapes-root',
          lockedOutsideFolder: 'escapes-root',
          outsideLoop: 'escapes-root',
          loopBeside: 'escapes-root',
          throughOutsideThere: 'escapes-root',
          throughOutsideGone: 'escapes-root',
          upAndBack: 'read',
          throughAlias: 'read',
          // A loop inside the project can be reported as it is.
          insideLoop: 'unreadable',
        });
      } finally {
        if (canLockFolders) chmodSync(locked, 0o755);
        rmSync(links, { recursive: true });
        rmSync(locked, { recursive: true });
        rmSync(join(outside, 'there'), { recursive: true });
        unlinkSync(join(outside, 'loop'));
        unlinkSync(join(base, 'loop-beside'));
        unlinkSync(join(base, 'alias'));
      }
    },
  );

  it.skipIf(!caseInsensitiveFs)(
    'a project folder spelled in another letter case than on disk is the same folder',
    async () => {
      // `--root=MY-GEARS` for my-gears, or VS Code's `c:\` for `C:\`
      expect(text(await readProjectFile(join(base, 'MY-GEARS'), '/fonts/Baumans-Regular.ttf'))).toBe('font-bytes');
    },
  );

  it('a file named as if it were a folder is not found', async () => {
    expect(await readProjectFile(project, '/fonts/Baumans-Regular.ttf/x.ttf')).toEqual({
      ok: false,
      code: 'not-found',
      osPath: join(project, 'fonts', 'Baumans-Regular.ttf', 'x.ttf'),
    });
  });

  it.skipIf(!canLockFolders)('a folder that cannot be listed is unreadable, not missing', async () => {
    const locked = join(project, 'locked');
    mkdirSync(locked, { recursive: true });
    chmodSync(locked, 0o000);
    try {
      const result = await readProjectFile(project, '/locked/x.ttf');
      expect(result.ok ? 'read' : [result.code, 'detail' in result && result.detail.startsWith('EACCES')]).toEqual([
        'unreadable',
        true,
      ]);
    } finally {
      chmodSync(locked, 0o755);
      rmSync(locked, { recursive: true });
    }
  });
});

describe('findProjectRoot', () => {
  // `base` plays the home folder, so the search never reaches the repo's own
  // pathogen.json above tests/tmp.
  it('finds the nearest pathogen.json from a nested folder', () => {
    expect(findProjectRoot(join(project, 'parts'), base)).toEqual({
      root: project,
      projectFile: join(project, 'pathogen.json'),
    });
  });

  it('without one, the program folder is the project folder', () => {
    expect(findProjectRoot(outside, base)).toEqual({ root: outside, projectFile: null });
  });

  it('stops below the home folder: a pathogen.json in home is ignored', () => {
    // Treat `base` as the home folder and put a stray pathogen.json there.
    writeFileSync(join(base, 'pathogen.json'), '{}');
    try {
      expect(findProjectRoot(outside, base)).toEqual({ root: outside, projectFile: null });
    } finally {
      rmSync(join(base, 'pathogen.json'));
    }
  });

  it("gives the program's project path, spelled as on disk, or null outside the project", () => {
    const parts = join(project, 'parts', 'rack.pathogen');
    expect([projectEntry(project, parts), projectEntry(project, join(outside, 'x.pathogen'))]).toEqual([
      '/parts/rack.pathogen',
      null,
    ]);
  });

  it.skipIf(!caseInsensitiveFs)("spells the project path as on disk however the program's folders are written", () => {
    // `pathogen-lang PARTS/rack.pathogen` for parts/ (macOS), or VS Code's `c:\…`
    expect([
      projectEntry(project, join(project, 'PARTS', 'rack.pathogen')),
      projectEntry(join(base, 'MY-GEARS'), join(project, 'PARTS', 'rack.pathogen')),
    ]).toEqual(['/parts/rack.pathogen', '/parts/rack.pathogen']);
  });

  it.skipIf(!canLink)(
    'a program opened through a link: its real path when that is inside, else the path it was opened by',
    () => {
      symlinkSync(join(project, 'parts'), join(project, 'parts-link'));
      symlinkSync(outside, join(project, 'away'));
      try {
        expect([
          projectEntry(project, join(project, 'parts-link', 'rack.pathogen')),
          // Really outside; its ./ paths then lead through the link, and so leave the project.
          projectEntry(project, join(project, 'away', 'x.pathogen')),
        ]).toEqual(['/parts/rack.pathogen', '/away/x.pathogen']);
      } finally {
        unlinkSync(join(project, 'parts-link'));
        unlinkSync(join(project, 'away'));
      }
    },
  );

  it.skipIf(!caseInsensitiveFs)(
    'knows the home folder however the program folder is spelled, and keeps that spelling',
    () => {
      // VS Code hands over Windows paths as `c:\…` while the home folder is `C:\…`.
      const shouted = outside.toUpperCase();
      writeFileSync(join(base, 'pathogen.json'), '{}');
      try {
        expect(findProjectRoot(shouted, base)).toEqual({ root: shouted, projectFile: null });
      } finally {
        rmSync(join(base, 'pathogen.json'));
      }
    },
  );
});

describe('reading pathogen.json', () => {
  it('loads and validates the project file', async () => {
    expect(await loadProjectFile(join(project, 'pathogen.json'))).toEqual({
      ok: true,
      project: { entryPoints: [{ written: 'main.pathogen', path: '/main.pathogen' }] },
    });
  });

  it('a pathogen.json that is a folder gets a message naming the folder it is in', () => {
    const folder = join(base, 'folder-named-pathogen-json');
    mkdirSync(join(folder, 'pathogen.json'), { recursive: true });
    expect(loadProjectFileSync(join(folder, 'pathogen.json'))).toEqual({
      ok: false,
      message: `pathogen.json (${folder}) is a folder, not a file.`,
    });
  });

  it('a pathogen.json that is not JSON says so, then gives the parser its say', async () => {
    const folder = join(base, 'broken-json');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'pathogen.json'), '{ "entryPoints": ');
    const prefix = `pathogen.json (${folder}) is not valid JSON: `;
    const parsed = await loadProjectFile(join(folder, 'pathogen.json'));
    expect(parsed.ok ? null : parsed.message.slice(0, prefix.length)).toBe(prefix);
  });
});

describe('installed-font search', () => {
  const host = (extra: Partial<NodeFontHostOptions> = {}) =>
    createNodeFontHost({
      root: project,
      programDir: join(project, 'parts'),
      offlineReason: '--offline',
      cacheDir: null,
      systemFontDirs: [],
      ...extra,
    });

  it('finds Google-style file names one folder deep in a walked-up fonts/ folder, at the exact weight', async () => {
    const match = await host().findLocalFont!('Raleway', 700, { nearest: false });
    expect(match && [match.weight, match.label]).toEqual([700, join(project, 'fonts', 'Raleway', 'Raleway-Bold.ttf')]);
    expect(await host().findLocalFont!('Raleway', 600, { nearest: false })).toBeNull();
  });

  it("an unzipped Google Fonts download works as is: weights in the family's static/ folder are found", async () => {
    const staticDir = join(project, 'fonts', 'Open_Sans', 'static');
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(join(staticDir, 'OpenSans-Bold.ttf'), minimalSfnt('open-sans-bold'));
    try {
      const match = await host().findLocalFont!('Open Sans', 700, { nearest: false });
      expect(match && [match.weight, match.label]).toEqual([700, join(staticDir, 'OpenSans-Bold.ttf')]);
    } finally {
      rmSync(join(project, 'fonts', 'Open_Sans'), { recursive: true });
    }
  });

  it('a nearest match may use another weight and says which', async () => {
    const match = await host().findLocalFont!('Raleway', 650, { nearest: true });
    expect(match?.weight).toBe(700);
  });

  it('a file name without a weight counts as 400', async () => {
    writeFileSync(join(project, 'fonts', 'Abel.ttf'), minimalSfnt('abel'));
    try {
      expect((await host().findLocalFont!('Abel', 400, { nearest: false }))?.weight).toBe(400);
      expect(await host().findLocalFont!('Abel', 700, { nearest: false })).toBeNull();
    } finally {
      rmSync(join(project, 'fonts', 'Abel.ttf'));
    }
  });

  it('looks in PATHOGEN_FONT_DIRS first, then the walked-up fonts/ folder, then the system folders', async () => {
    const envDir = join(base, 'env-fonts');
    const systemDir = join(base, 'system-fonts');
    mkdirSync(envDir, { recursive: true });
    mkdirSync(systemDir, { recursive: true });
    writeFileSync(join(envDir, 'Raleway-Bold.ttf'), minimalSfnt('env'));
    writeFileSync(join(systemDir, 'Raleway-Bold.ttf'), minimalSfnt('system'));
    writeFileSync(join(systemDir, 'Lobster-Regular.ttf'), minimalSfnt('lobster'));
    try {
      const withEnv = host({ fontDirs: [envDir], systemFontDirs: [systemDir] });
      const withoutEnv = host({ systemFontDirs: [systemDir] });
      const found = [
        await withEnv.findLocalFont!('Raleway', 700, { nearest: false }),
        await withoutEnv.findLocalFont!('Raleway', 700, { nearest: false }),
        await withoutEnv.findLocalFont!('Lobster', 400, { nearest: false }),
      ];
      expect(found.map((match) => match?.label)).toEqual([
        join(envDir, 'Raleway-Bold.ttf'),
        join(project, 'fonts', 'Raleway', 'Raleway-Bold.ttf'),
        join(systemDir, 'Lobster-Regular.ttf'),
      ]);
    } finally {
      rmSync(envDir, { recursive: true });
      rmSync(systemDir, { recursive: true });
    }
  });

  it('finds a family two folders deep in a system font folder, where Linux keeps them', async () => {
    const systemDir = join(base, 'usr-share-fonts');
    mkdirSync(join(systemDir, 'truetype', 'raleway'), { recursive: true });
    writeFileSync(join(systemDir, 'truetype', 'raleway', 'Raleway-Black.ttf'), minimalSfnt('deep'));
    try {
      const match = await host({ systemFontDirs: [systemDir] }).findLocalFont!('Raleway', 900, { nearest: false });
      expect(match?.label).toBe(join(systemDir, 'truetype', 'raleway', 'Raleway-Black.ttf'));
    } finally {
      rmSync(systemDir, { recursive: true });
    }
  });

  it('matches installed file names regardless of letter case, on every system', async () => {
    writeFileSync(join(project, 'fonts', 'raleway-light.TTF'), minimalSfnt('lowercase'));
    try {
      const match = await host().findLocalFont!('Raleway', 300, { nearest: false });
      expect(match?.label).toBe(join(project, 'fonts', 'raleway-light.TTF'));
    } finally {
      rmSync(join(project, 'fonts', 'raleway-light.TTF'));
    }
  });

  it('passes over an installed file that is not a complete font and keeps looking', async () => {
    const envDir = join(base, 'damaged-fonts');
    mkdirSync(envDir, { recursive: true });
    writeFileSync(join(envDir, 'Raleway-Bold.ttf'), minimalSfnt('whole').subarray(0, 20));
    try {
      const match = await host({ fontDirs: [envDir] }).findLocalFont!('Raleway', 700, { nearest: false });
      expect(match?.label).toBe(join(project, 'fonts', 'Raleway', 'Raleway-Bold.ttf'));
    } finally {
      rmSync(envDir, { recursive: true });
    }
  });

  it("finds macOS's own names, with a space before the weight: Georgia Bold.ttf, Times New Roman Bold.ttf", async () => {
    const systemDir = join(base, 'mac-supplemental');
    mkdirSync(systemDir, { recursive: true });
    for (const name of ['Georgia.ttf', 'Georgia Bold.ttf', 'Times New Roman Bold.ttf']) {
      writeFileSync(join(systemDir, name), minimalSfnt(name));
    }
    try {
      const mac = host({ systemFontDirs: [systemDir] });
      const found = [
        await mac.findLocalFont!('Georgia', 400, { nearest: false }),
        await mac.findLocalFont!('Georgia', 700, { nearest: false }),
        await mac.findLocalFont!('Times New Roman', 700, { nearest: false }),
      ];
      expect(found.map((match) => match && [match.weight, match.label])).toEqual([
        [400, join(systemDir, 'Georgia.ttf')],
        [700, join(systemDir, 'Georgia Bold.ttf')],
        [700, join(systemDir, 'Times New Roman Bold.ttf')],
      ]);
    } finally {
      rmSync(systemDir, { recursive: true });
    }
  });

  it('a file named fonts is not the fonts/ folder: the search keeps walking up', async () => {
    writeFileSync(join(project, 'parts', 'fonts'), 'not a folder');
    try {
      const match = await host().findLocalFont!('Raleway', 700, { nearest: false });
      expect(match?.label).toBe(join(project, 'fonts', 'Raleway', 'Raleway-Bold.ttf'));
    } finally {
      rmSync(join(project, 'parts', 'fonts'));
    }
  });

  it("finds a fonts/ folder in the program's folder or up to seven above it, and no further", async () => {
    const top = join(base, 'deep');
    const levels = ['1', '2', '3', '4', '5', '6', '7', '8'];
    mkdirSync(join(top, ...levels), { recursive: true });
    mkdirSync(join(top, 'fonts'), { recursive: true });
    writeFileSync(join(top, 'fonts', 'Raleway-Bold.ttf'), minimalSfnt('deep'));
    try {
      const from = async (depth: number) =>
        createNodeFontHost({
          root: top,
          programDir: join(top, ...levels.slice(0, depth)),
          offlineReason: '--offline',
          cacheDir: null,
          systemFontDirs: [],
        }).findLocalFont!('Raleway', 700, { nearest: false });
      expect([(await from(7))?.label, await from(8)]).toEqual([join(top, 'fonts', 'Raleway-Bold.ttf'), null]);
    } finally {
      rmSync(top, { recursive: true });
    }
  });

  it.skipIf(caseInsensitiveFs)(
    'two installed names that differ only in letter case are both tried (Linux), whichever is listed first',
    async () => {
      // Each order once, so the test doesn't depend on the order the system lists them in.
      const found: (string | undefined)[] = [];
      for (const [damaged, whole] of [
        ['raleway-thin.ttf', 'Raleway-Thin.ttf'],
        ['Raleway-Thin.ttf', 'raleway-thin.ttf'],
      ]) {
        const systemDir = join(base, 'case-pair');
        mkdirSync(systemDir, { recursive: true });
        writeFileSync(join(systemDir, damaged), minimalSfnt('cut').subarray(0, 20));
        writeFileSync(join(systemDir, whole), minimalSfnt('whole'));
        try {
          const match = await host({ systemFontDirs: [systemDir] }).findLocalFont!('Raleway', 100, { nearest: false });
          found.push(match?.label === join(systemDir, whole) ? 'whole' : match?.label);
        } finally {
          rmSync(systemDir, { recursive: true });
        }
      }
      expect(found).toEqual(['whole', 'whole']);
    },
  );

  it("finds a family that comes in optical sizes, as Google's download names it, taking the smallest size", async () => {
    // Google's Inter download has no Inter-Bold.ttf, only these (and Fraunces
    // only Fraunces_72pt-*); variants such as _Soft are other faces.
    const inter = join(project, 'fonts', 'Inter', 'static');
    mkdirSync(inter, { recursive: true });
    for (const name of [
      'Inter_28pt-Bold.ttf',
      'Inter_18pt-Bold.ttf',
      'Inter_24pt-Bold.ttf',
      'Inter_9pt_Soft-Bold.ttf',
    ]) {
      writeFileSync(join(inter, name), minimalSfnt(name));
    }
    try {
      const bold = await host().findLocalFont!('Inter', 700, { nearest: false });
      expect(bold?.label).toBe(join(inter, 'Inter_18pt-Bold.ttf'));
      // A plain name, where there is one, comes first.
      writeFileSync(join(inter, 'Inter-Bold.ttf'), minimalSfnt('plain'));
      expect((await host().findLocalFont!('Inter', 700, { nearest: false }))?.label).toBe(
        join(inter, 'Inter-Bold.ttf'),
      );
    } finally {
      rmSync(join(project, 'fonts', 'Inter'), { recursive: true });
    }
  });

  it('remembers the folders inside a system font folder for a minute, then looks again', async () => {
    const systemDir = join(base, 'system-memo');
    mkdirSync(systemDir, { recursive: true });
    const clock = vi.spyOn(Date, 'now');
    const start = Date.now();
    try {
      clock.mockReturnValue(start);
      const memo = host({ systemFontDirs: [systemDir] });
      expect(await memo.findLocalFont!('Lobster', 400, { nearest: false })).toBeNull();
      // A family installed in a new folder after the first search
      mkdirSync(join(systemDir, 'lobster'));
      writeFileSync(join(systemDir, 'lobster', 'Lobster-Regular.ttf'), minimalSfnt('lobster'));
      clock.mockReturnValue(start + 59_000);
      const soon = await memo.findLocalFont!('Lobster', 400, { nearest: false });
      clock.mockReturnValue(start + 61_000);
      const later = await memo.findLocalFont!('Lobster', 400, { nearest: false });
      expect([soon, later?.label]).toEqual([null, join(systemDir, 'lobster', 'Lobster-Regular.ttf')]);
    } finally {
      clock.mockRestore();
      rmSync(systemDir, { recursive: true });
    }
  });
});

describe('WOFF and WOFF2 file fonts', () => {
  it('draw exactly the glyphs of the TrueType file they were made from', async () => {
    const { compress } = (await import('woff2-encoder')) as {
      compress: (bytes: Uint8Array) => Promise<Uint8Array>;
    };
    const folder = join(base, 'woff-project');
    for (const sub of ['ttf', 'woff', 'woff2']) mkdirSync(join(folder, sub), { recursive: true });
    const ttf = new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', 'fonts', 'Inter-Regular.ttf')));
    writeFileSync(join(folder, 'ttf', 'Inter.ttf'), ttf);
    writeFileSync(join(folder, 'woff', 'Inter.woff'), ttfToWoff(ttf));
    writeFileSync(join(folder, 'woff2', 'Inter.woff2'), await compress(ttf));
    const host = createNodeFontHost({
      root: folder,
      programDir: folder,
      offlineReason: '--offline',
      cacheDir: null,
      systemFontDirs: [],
    });
    const draw = async (fontPath: string) => {
      const source = `@font "${fontPath}";\nlet glyphs = PathBlock.fromGlyph("Ag", #{ font-family: Inter; font-size: 48; });\nglyphs[0].drawTo(0, 60);\nglyphs[1].drawTo(40, 60);`;
      const { fonts, messages } = await resolveFonts(source, { host, entry: '/main.pathogen' });
      const result = compile(source, { fonts: buildFontRegistry(fonts).registry });
      return { kinds: fonts.map((f) => f.kind), messages, path: result.layers[0]?.data };
    };
    const fromTtf = await draw('./ttf/Inter.ttf');
    const fromWoff = await draw('./woff/Inter.woff');
    const fromWoff2 = await draw('./woff2/Inter.woff2');
    expect([fromTtf.messages, fromTtf.path?.startsWith('M 0 60 ')]).toEqual([[], true]);
    expect([fromWoff.kinds, fromWoff.messages, fromWoff.path]).toEqual([['woff'], [], fromTtf.path]);
    expect([fromWoff2.kinds, fromWoff2.messages, fromWoff2.path]).toEqual([['ttf'], [], fromTtf.path]);
  });
});

describe('switches and folders', () => {
  it('offline comes from the flag first, then PATHOGEN_OFFLINE', () => {
    expect(offlineReason(true, {})).toBe('--offline');
    expect(offlineReason(false, { PATHOGEN_OFFLINE: '1' })).toBe('PATHOGEN_OFFLINE=1');
    expect(offlineReason(false, { PATHOGEN_OFFLINE: '0' })).toBeNull();
    expect(offlineReason(false, {})).toBeNull();
  });

  it('an offline host has no fetch; an online one does', () => {
    const common = { root: project, programDir: project, cacheDir: null, systemFontDirs: [] };
    const offline = createNodeFontHost({ ...common, offlineReason: 'PATHOGEN_OFFLINE=1' });
    expect([offline.fetch, offline.offlineReason]).toEqual([undefined, 'PATHOGEN_OFFLINE=1']);
    expect(typeof createNodeFontHost({ ...common, offlineReason: null }).fetch).toBe('function');
  });

  it('PATHOGEN_FONT_DIRS splits on the platform separator', () => {
    expect(fontDirsFromEnv(['/a', '/b c', ''].join(delimiter))).toEqual(['/a', '/b c']);
    expect(fontDirsFromEnv(undefined)).toEqual([]);
  });

  it('the cache folder follows each platform, and PATHOGEN_CACHE_DIR wins', () => {
    expect(defaultCacheDir({}, 'darwin', '/Users/you')).toBe('/Users/you/Library/Caches/pathogen-lang/fonts');
    expect(defaultCacheDir({}, 'linux', '/home/you')).toBe('/home/you/.cache/pathogen-lang/fonts');
    expect(defaultCacheDir({ XDG_CACHE_HOME: '/xdg' }, 'linux', '/home/you')).toBe('/xdg/pathogen-lang/fonts');
    expect(defaultCacheDir({}, 'win32', 'C:\\Users\\you')).toBe('C:\\Users\\you\\AppData\\Local\\pathogen-lang\\fonts');
    expect(defaultCacheDir({ LOCALAPPDATA: 'E:\\Local' }, 'win32', 'C:\\Users\\you')).toBe(
      'E:\\Local\\pathogen-lang\\fonts',
    );
    expect(defaultCacheDir({ PATHOGEN_CACHE_DIR: '/custom' }, 'darwin', '/Users/you')).toBe('/custom');
  });

  it("the system font folders follow each platform, Windows' per-user folder included", () => {
    expect(systemFontDirs('darwin', '/Users/you', {})).toEqual([
      '/Library/Fonts',
      '/System/Library/Fonts',
      '/System/Library/Fonts/Supplemental',
      '/Users/you/Library/Fonts',
    ]);
    expect(systemFontDirs('linux', '/home/you', {})).toEqual([
      '/usr/share/fonts',
      '/usr/local/share/fonts',
      '/home/you/.fonts',
      '/home/you/.local/share/fonts',
    ]);
    expect(systemFontDirs('win32', 'C:\\Users\\you', {})).toEqual([
      'C:\\Windows\\Fonts',
      'C:\\Users\\you\\AppData\\Local\\Microsoft\\Windows\\Fonts',
    ]);
    expect(systemFontDirs('win32', 'C:\\Users\\you', { WINDIR: 'D:\\Win', LOCALAPPDATA: 'E:\\Local' })).toEqual([
      'D:\\Win\\Fonts',
      'E:\\Local\\Microsoft\\Windows\\Fonts',
    ]);
  });

  it('file stamps change when a named font file appears, changes, or pathogen.json does', () => {
    const projectFile = join(project, 'pathogen.json');
    const stamps = () =>
      fontFileStamps(project, '/parts/poster.pathogen', ['../fonts/New.ttf', '../../x.ttf'], projectFile);
    const before = stamps();
    expect(before.split('|').slice(0, 2)).toEqual(['none', 'outside']);
    writeFileSync(join(project, 'fonts', 'New.ttf'), 'new');
    try {
      const added = stamps();
      expect(added).not.toBe(before);
      writeFileSync(join(project, 'fonts', 'New.ttf'), 'newer bytes');
      expect(stamps()).not.toBe(added);
    } finally {
      rmSync(join(project, 'fonts', 'New.ttf'));
    }
  });

  it.skipIf(!caseInsensitiveFs)(
    'file stamps change when a named file is renamed in letter case only (macOS, Windows)',
    () => {
      // The path `../fonts/Renamed.ttf` still opens the file, but no longer matches its name.
      const stamps = () => fontFileStamps(project, '/parts/poster.pathogen', ['../fonts/Renamed.ttf'], null);
      writeFileSync(join(project, 'fonts', 'Renamed.ttf'), 'bytes');
      try {
        const before = stamps();
        renameSync(join(project, 'fonts', 'Renamed.ttf'), join(project, 'fonts', 'renamed.ttf'));
        expect(stamps()).not.toBe(before);
      } finally {
        rmSync(join(project, 'fonts', 'renamed.ttf'));
      }
    },
  );
});

describe('the file cache', () => {
  const cacheFileName = (key: string) => createHash('sha256').update(key).digest('hex').slice(0, 32);

  it('round-trips bytes and leaves no temporary files behind', async () => {
    const dir = join(base, 'cache');
    const cache = fileCache(dir);
    expect(await cache.get('font:https://example.com/a.ttf')).toBeNull();
    await cache.put('font:https://example.com/a.ttf', new Uint8Array([1, 2, 3]));
    expect([...((await cache.get('font:https://example.com/a.ttf')) ?? [])]).toEqual([1, 2, 3]);
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('two writers of one key at the same moment both finish, and the file holds one copy whole', async () => {
    const dir = join(base, 'cache-race');
    const [one, two] = [fileCache(dir), fileCache(dir)];
    await Promise.all([
      one.put('font:x', new Uint8Array(65_536).fill(1)),
      two.put('font:x', new Uint8Array(65_536).fill(2)),
    ]);
    const stored = (await one.get('font:x')) ?? new Uint8Array();
    expect([stored.length, new Set(stored).size]).toEqual([65_536, 1]);
    expect(readdirSync(dir)).toEqual([cacheFileName('font:x')]);
  });

  it('a write that fails part way leaves no temporary file', async () => {
    const dir = join(base, 'cache-rename-fails');
    const key = 'font:https://fonts.gstatic.com/s/x/v1/x.ttf';
    // A folder where the cached file should go makes the final rename fail.
    mkdirSync(join(dir, cacheFileName(key), 'occupied'), { recursive: true });
    await fileCache(dir).put(key, new Uint8Array([1, 2, 3]));
    expect(readdirSync(dir)).toEqual([cacheFileName(key)]);
  });

  it('a cache folder that cannot be created is skipped', async () => {
    const blocked = join(base, 'cache-blocked');
    writeFileSync(blocked, 'a file where the cache folder should be');
    const cache = fileCache(join(blocked, 'fonts'));
    await cache.put('font:x', new Uint8Array([1]));
    expect(await cache.get('font:x')).toBeNull();
    expect(readFileSync(blocked, 'utf8')).toBe('a file where the cache folder should be');
  });
});

describe('downloads', () => {
  const online = (extra: Partial<NodeFontHostOptions> = {}) =>
    createNodeFontHost({
      root: project,
      programDir: project,
      offlineReason: null,
      cacheDir: null,
      systemFontDirs: [],
      ...extra,
    });

  describe('time out only when they stall (scripted fetch)', () => {
    const URL_ = 'https://fonts.test/font.ttf';
    /** A fetch whose body sends `chunks` at the given delays (ms), then stalls unless `end` is set. */
    const trickle =
      (delays: number[], end: boolean): typeof fetch =>
      async (_input, init) => {
        const signal = init?.signal as AbortSignal;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            signal.addEventListener('abort', () => controller.error(signal.reason));
            let at = 0;
            delays.forEach((delay, i) => {
              at += delay;
              setTimeout(() => {
                if (signal.aborted) return;
                controller.enqueue(new Uint8Array([i]));
                if (end && i === delays.length - 1) controller.close();
              }, at);
            });
          },
        });
        return new Response(stream, { status: 200 });
      };
    const hostWith = (fetchImpl: typeof fetch) => online({ fetchImpl, stallTimeoutMs: 60 });

    it('a slow download that keeps sending finishes, however long it takes in total', async () => {
      const res = await hostWith(trickle([20, 40, 40, 40, 40], true)).fetch!(URL_);
      expect([...(await res.bytes())]).toEqual([0, 1, 2, 3, 4]);
    });

    it('a download that stops sending fails with a clear reason', async () => {
      await expect(hostWith(trickle([5], false)).fetch!(URL_)).rejects.toThrow(
        'no data from fonts.test for 0.06 seconds',
      );
    });

    it('a server that never answers fails the same way', async () => {
      const silent: typeof fetch = async (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          signal.addEventListener('abort', () => reject(signal.reason));
        });
      await expect(hostWith(silent).fetch!(URL_)).rejects.toThrow('no data from fonts.test for 0.06 seconds');
    });

    it('requests for the same URL at the same time share one transfer', async () => {
      let transfers = 0;
      const counted: typeof fetch = async (input, init) => {
        transfers += 1;
        return trickle([10, 10], true)(input, init);
      };
      const one = hostWith(counted);
      const two = hostWith(counted);
      const [a, b] = await Promise.all([one.fetch!(URL_), two.fetch!(URL_)]);
      expect([transfers, [...(await a.bytes())], [...(await b.bytes())]]).toEqual([1, [0, 1], [0, 1]]);
      // Once finished, the next request goes to the network again.
      await one.fetch!(URL_);
      expect(transfers).toBe(2);
    });
  });

  describe('over a real connection', () => {
    let server: Server;
    let origin: string;
    let authority: string;
    const FONT = minimalSfnt('served');

    beforeAll(async () => {
      server = createServer((req, res) => {
        if (req.url === '/font.ttf') {
          res.writeHead(200, { 'Content-Type': 'font/ttf' });
          res.end(Buffer.from(FONT));
        } else if (req.url === '/moved') {
          res.writeHead(302, { Location: '/font.ttf' });
          res.end();
        } else if (req.url === '/stall') {
          res.writeHead(200);
          res.write('x');
        } else if (req.url === '/large') {
          res.writeHead(200);
          res.end(Buffer.alloc(4096));
        } else if (req.url === '/drip') {
          res.writeHead(200);
          const drip = setInterval(() => res.write('x'), 20);
          res.on('close', () => clearInterval(drip));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });
      authority = `127.0.0.1:${(server.address() as AddressInfo).port}`;
      origin = `http://${authority}`;
    });

    afterAll(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => {
        server.close(resolve);
      });
    });

    it('reads a whole reply', async () => {
      const res = await online().fetch!(`${origin}/font.ttf`);
      expect([res.status, [...(await res.bytes())]]).toEqual([200, [...FONT]]);
    });

    it('refuses to follow a redirect, which could lead to another host', async () => {
      await expect(online().fetch!(`${origin}/moved`)).rejects.toThrow('fetch failed: unexpected redirect');
    });

    it('gives up on a reply that stops arriving', async () => {
      await expect(online({ stallTimeoutMs: 100 }).fetch!(`${origin}/stall`)).rejects.toThrow(
        `no data from ${authority} for 0.1 seconds`,
      );
    });

    it('gives up on a reply larger than the size limit', async () => {
      await expect(online({ maxDownloadBytes: 1024 }).fetch!(`${origin}/large`)).rejects.toThrow(
        `the reply from ${authority} is larger than 1024 bytes`,
      );
    });

    it('gives up on a reply that keeps trickling in past the time limit', async () => {
      await expect(online({ maxDownloadMs: 200, stallTimeoutMs: 5000 }).fetch!(`${origin}/drip`)).rejects.toThrow(
        `no complete reply from ${authority} after 0.2 seconds`,
      );
    });
  });
});
