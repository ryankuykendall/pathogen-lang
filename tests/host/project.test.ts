/**
 * pathogen.json v1 (docs/projects.md § pathogen.json): an object whose only
 * key is an optional `main`, a path to the program inside the project folder.
 */
import { describe, expect, it } from 'vitest';

import { parseProjectFile } from '../../src/host/project';

const LABEL = '/Users/you/my-gears';

describe('parseProjectFile', () => {
  it('an empty object marks a project with no main', () => {
    expect(parseProjectFile('{}', LABEL)).toEqual({ ok: true, project: {} });
  });

  it.each([
    ['main.pathogen', '/main.pathogen'],
    ['./main.pathogen', '/main.pathogen'],
    ['src/poster.pathogen', '/src/poster.pathogen'],
    ['/src/poster.pathogen', '/src/poster.pathogen'],
  ])('main %s resolves inside the project folder to %s', (main, path) => {
    expect(parseProjectFile(JSON.stringify({ main }), LABEL)).toEqual({ ok: true, project: { main: path } });
  });

  it('invalid JSON is an error that names the folder and the parser message', () => {
    const result = parseProjectFile('{ "main": "a.pathogen", }', LABEL);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/^pathogen\.json \(\/Users\/you\/my-gears\) is not valid JSON: \S/);
    }
  });

  it('a byte-order mark at the start, as older Windows editors write, is ignored', () => {
    const bom = String.fromCodePoint(0xfeff);
    expect(parseProjectFile(`${bom}{ "main": "main.pathogen" }`, LABEL)).toEqual({
      ok: true,
      project: { main: '/main.pathogen' },
    });
  });

  it('a non-object is an error', () => {
    expect(parseProjectFile('[]', LABEL)).toEqual({
      ok: false,
      message:
        'pathogen.json (/Users/you/my-gears) must contain a JSON object, such as {} or { "main": "main.pathogen" }.',
    });
  });

  it('$schema is accepted and ignored, so an editor schema hint does not fail the file', () => {
    expect(
      parseProjectFile('{ "$schema": "https://example.com/pathogen.schema.json", "main": "main.pathogen" }', LABEL),
    ).toEqual({ ok: true, project: { main: '/main.pathogen' } });
  });

  it('an unknown key is an error that lists the known keys', () => {
    expect(parseProjectFile('{ "mian": "main.pathogen" }', LABEL)).toEqual({
      ok: false,
      message: 'pathogen.json (/Users/you/my-gears) has an unknown key "mian". Known keys: main.',
    });
  });

  it.each([42, '', '../outside.pathogen', 'src\\main.pathogen', 'C:/main.pathogen'])(
    'a main that is not a path inside the project folder is an error: %s',
    (main) => {
      expect(parseProjectFile(JSON.stringify({ main }), LABEL)).toEqual({
        ok: false,
        message:
          'pathogen.json (/Users/you/my-gears): "main" must be a path inside the project folder, written with forward slashes, such as "main.pathogen".',
      });
    },
  );
});
