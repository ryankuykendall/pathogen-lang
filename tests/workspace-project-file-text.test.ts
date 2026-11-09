/**
 * A workspace's pathogen.json is written from its entry points by one function
 * (src/workspace/files.ts projectFileText). What it writes must read back the
 * same through the CLI's own reader (src/host/project.ts parseProjectFile), so
 * a workspace exported as a folder (2g) compiles the same program as the main.
 */
import { describe, expect, it } from 'vitest';

import { parseProjectFile } from '../src/host/project';
import { projectFileText } from '../src/workspace/files';

describe('projectFileText', () => {
  it('writes the entry points, two-space indented, with a final newline', () => {
    expect(projectFileText(['main.pathogen', 'demos/gears.pathogen'])).toBe(
      '{\n  "entryPoints": [\n    "main.pathogen",\n    "demos/gears.pathogen"\n  ]\n}\n',
    );
  });

  it('writes {} for a workspace with no programs', () => {
    expect(projectFileText([])).toBe('{}\n');
  });

  it.each([[['main.pathogen']], [['try-sizes.pathogen', 'main.pathogen', 'demos/gears.pathogen']], [[]]])(
    'reads back the same through the CLI reader: %j',
    (entryPoints) => {
      const parsed = parseProjectFile(projectFileText(entryPoints), 'My Gears');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect((parsed.project.entryPoints ?? []).map((e) => e.written)).toEqual(entryPoints);
      expect((parsed.project.entryPoints ?? []).map((e) => e.path)).toEqual(entryPoints.map((p) => `/${p}`));
    },
  );
});
