/**
 * pathogen.json (docs/projects.md § pathogen.json): an object whose only key is
 * an optional `entryPoints`, the project's programs in order, the main first.
 * The file's shape is checked whenever it's read (`parseProjectFile`); the
 * list's other rules only when it's used (`projectMain`). Every message here is
 * quoted word for word in docs/projects.md's Errors table.
 */
import { describe, expect, it } from 'vitest';

import {
  mainCaseMessage,
  mainIsModuleMessage,
  mainLeavesMessage,
  mainMissingMessage,
  parseProjectFile,
  projectMain,
} from '../../src/host/project';

const LABEL = '/Users/you/my-gears';
const PREFIX = 'pathogen.json (/Users/you/my-gears)';
const parse = (value: unknown) => parseProjectFile(JSON.stringify(value), LABEL);

describe('parseProjectFile: the shape, checked whenever pathogen.json is read', () => {
  it('an empty object marks a project, with no list', () => {
    expect(parseProjectFile('{}', LABEL)).toEqual({ ok: true, project: {} });
  });

  it('each entry resolves inside the project folder, in order, keeping how it was written', () => {
    expect(parse({ entryPoints: ['main.pathogen', './poster.pathogen', 'src/a.pathogen', '/src/b.pathogen'] })).toEqual(
      {
        ok: true,
        project: {
          entryPoints: [
            { written: 'main.pathogen', path: '/main.pathogen' },
            { written: './poster.pathogen', path: '/poster.pathogen' },
            { written: 'src/a.pathogen', path: '/src/a.pathogen' },
            { written: '/src/b.pathogen', path: '/src/b.pathogen' },
          ],
        },
      },
    );
  });

  it('an empty list and a repeated path are not shape errors: they are checked when the list is used', () => {
    expect(parse({ entryPoints: [] })).toEqual({ ok: true, project: { entryPoints: [] } });
    expect(parse({ entryPoints: ['main.pathogen', './main.pathogen'] }).ok).toBe(true);
  });

  it('invalid JSON is an error that names the folder and the parser message', () => {
    const result = parseProjectFile('{ "entryPoints": ["a.pathogen"], }', LABEL);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/^pathogen\.json \(\/Users\/you\/my-gears\) is not valid JSON: \S/);
    }
  });

  it('a byte-order mark at the start, as older Windows editors write, is ignored', () => {
    const bom = String.fromCodePoint(0xfeff);
    expect(parseProjectFile(`${bom}{ "entryPoints": ["main.pathogen"] }`, LABEL)).toEqual({
      ok: true,
      project: { entryPoints: [{ written: 'main.pathogen', path: '/main.pathogen' }] },
    });
  });

  it('a non-object is an error', () => {
    expect(parseProjectFile('[]', LABEL)).toEqual({
      ok: false,
      message: `${PREFIX} must contain a JSON object, such as {} or { "entryPoints": ["main.pathogen"] }.`,
    });
  });

  it('$schema is accepted and ignored, so an editor schema hint does not fail the file', () => {
    expect(parse({ $schema: 'https://example.com/pathogen.schema.json', entryPoints: ['main.pathogen'] })).toEqual({
      ok: true,
      project: { entryPoints: [{ written: 'main.pathogen', path: '/main.pathogen' }] },
    });
  });

  it('a key that differs from entryPoints only in letter case asks whether you meant it', () => {
    expect(parse({ entrypoints: ['main.pathogen'] })).toEqual({
      ok: false,
      message: `${PREFIX} has an unknown key "entrypoints". Did you mean "entryPoints"?`,
    });
  });

  it('any other unknown key lists the known keys', () => {
    expect(parse({ mian: 'main.pathogen' })).toEqual({
      ok: false,
      message: `${PREFIX} has an unknown key "mian". Known keys: entryPoints.`,
    });
  });

  it('the old main key says what replaces it, with your own main in the list', () => {
    expect(parse({ main: 'poster.pathogen' })).toEqual({
      ok: false,
      message: `${PREFIX}: "main" is now "entryPoints", a list whose first entry is the main. Replace it with "entryPoints": ["poster.pathogen"].`,
    });
  });

  it('an old main next to entryPoints says to remove it', () => {
    expect(parse({ entryPoints: ['poster.pathogen'], main: 'main.pathogen' })).toEqual({
      ok: false,
      message: `${PREFIX}: "main" is no longer a key; remove it. The first entry in "entryPoints" is the main.`,
    });
  });

  it.each([42, '', 'C:/main.pathogen', 'poster', 'src/'])(
    'an old main that would not pass as an entry is shown as main.pathogen: %s',
    (main) => {
      expect(parse({ main })).toEqual({
        ok: false,
        message: `${PREFIX}: "main" is now "entryPoints", a list whose first entry is the main. Replace it with "entryPoints": ["main.pathogen"].`,
      });
    },
  );

  it('entryPoints that is not a list shows your own value in a list, when it is a path', () => {
    expect(parse({ entryPoints: 'poster.pathogen' })).toEqual({
      ok: false,
      message: `${PREFIX}: "entryPoints" must be a list of paths, such as ["poster.pathogen"].`,
    });
  });

  it.each([42, { a: 1 }, 'C:/main.pathogen', 'poster'])(
    'entryPoints that is not a list, with no usable path: %j',
    (value) => {
      expect(parse({ entryPoints: value })).toEqual({
        ok: false,
        message: `${PREFIX}: "entryPoints" must be a list of paths, such as ["main.pathogen"].`,
      });
    },
  );

  it.each([
    [42, '42'],
    ['', '""'],
    ['../outside.pathogen', '"../outside.pathogen"'],
    ['src\\main.pathogen', '"src\\\\main.pathogen"'],
    ['C:/art/poster.pathogen', '"C:/art/poster.pathogen"'],
    ['./', '"./"'],
    ['/', '"/"'],
    ['parts/', '"parts/"'],
    ['poster.pathogen/', '"poster.pathogen/"'],
    [null, 'null'],
  ])('an entry that is not a path inside the project folder is an error, numbered: %j', (entry, shown) => {
    expect(parse({ entryPoints: ['main.pathogen', entry] })).toEqual({
      ok: false,
      message: `${PREFIX}: "entryPoints" entry 2, ${shown}, must be a path inside the project folder, written with forward slashes, such as "main.pathogen".`,
    });
  });

  it('an entry without .pathogen at the end says to write the full name', () => {
    expect(parse({ entryPoints: ['poster'] })).toEqual({
      ok: false,
      message: `${PREFIX}: "entryPoints" entry 1, "poster", has no .pathogen extension. Write the file's full name: "poster.pathogen".`,
    });
  });

  it('an extension in other letters names another file, and the message spells it right', () => {
    expect(parse({ entryPoints: ['Poster.PATHOGEN'] })).toEqual({
      ok: false,
      message: `${PREFIX}: "entryPoints" entry 1, "Poster.PATHOGEN", has no .pathogen extension. Write the file's full name: "Poster.pathogen".`,
    });
  });

  it('a path that climbs and comes back counts as the path it reaches', () => {
    expect(parse({ entryPoints: ['parts/../poster.pathogen'] })).toEqual({
      ok: true,
      project: { entryPoints: [{ written: 'parts/../poster.pathogen', path: '/poster.pathogen' }] },
    });
  });
});

describe('projectMain: the list, checked when it is used', () => {
  const main = (value: unknown) => {
    const parsed = parse(value);
    if (!parsed.ok) throw new Error(parsed.message);
    return projectMain(parsed.project, LABEL);
  };

  it('without entryPoints, the main is main.pathogen, by convention', () => {
    expect(main({})).toEqual({ ok: true, path: '/main.pathogen', listed: false });
  });

  it('with entryPoints, the main is the first entry', () => {
    expect(main({ entryPoints: ['src/poster.pathogen', 'main.pathogen'] })).toEqual({
      ok: true,
      path: '/src/poster.pathogen',
      listed: true,
    });
  });

  it('an empty list is an error that suggests leaving the key out', () => {
    expect(main({ entryPoints: [] })).toEqual({
      ok: false,
      message: `${PREFIX}: "entryPoints" is empty. List at least one program, or leave the key out to use main.pathogen.`,
    });
  });

  it('the same file twice is an error naming both entries as written, however they are spelled', () => {
    expect(main({ entryPoints: ['main.pathogen', 'poster.pathogen', './main.pathogen'] })).toEqual({
      ok: false,
      message: `${PREFIX}: "entryPoints" lists the same file twice: entry 1, "main.pathogen", and entry 3, "./main.pathogen".`,
    });
    expect(main({ entryPoints: ['/a.pathogen', 'a.pathogen'] })).toEqual({
      ok: false,
      message: `${PREFIX}: "entryPoints" lists the same file twice: entry 1, "/a.pathogen", and entry 2, "a.pathogen".`,
    });
  });
});

describe('the main messages a folder compile gives', () => {
  it('a main that does not exist, listed or by convention', () => {
    expect(mainMissingMessage('my-gears', 'poster.pathogen', true, '/Users/you/my-gears/poster.pathogen')).toBe(
      'The main of my-gears, poster.pathogen, doesn\'t exist (looked for /Users/you/my-gears/poster.pathogen). pathogen.json lists it first in "entryPoints": add the file, or put another program first.',
    );
    expect(mainMissingMessage('my-gears', 'main.pathogen', false, '/Users/you/my-gears/main.pathogen')).toBe(
      'The main of my-gears, main.pathogen, doesn\'t exist (looked for /Users/you/my-gears/main.pathogen). Add it, list your program in pathogen.json ("entryPoints": ["your-program.pathogen"]), or compile a file directly.',
    );
  });

  it('a main whose letter case differs from the file on disk', () => {
    expect(mainCaseMessage('my-gears', 'Poster.pathogen', 'poster.pathogen')).toBe(
      'The main of my-gears, Poster.pathogen, differs from the file on disk only in letter case: poster.pathogen. Paths are case-sensitive on every system.',
    );
  });

  it('a main that is a module, listed or by convention', () => {
    expect(mainIsModuleMessage('my-gears', 'parts/gears.pathogen', true)).toBe(
      'The main of my-gears, parts/gears.pathogen, is a module (it starts with module;), and a module doesn\'t draw. Take out module;, or put a program first in pathogen.json\'s "entryPoints".',
    );
    expect(mainIsModuleMessage('my-gears', 'main.pathogen', false)).toBe(
      'The main of my-gears, main.pathogen, is a module (it starts with module;), and a module doesn\'t draw. Take out module;, list a program in pathogen.json ("entryPoints": ["your-program.pathogen"]), or compile a file directly.',
    );
  });

  it('a main reached through a symbolic link that leads outside the project', () => {
    expect(mainLeavesMessage('my-gears', 'poster.pathogen', '/Users/you/my-gears')).toBe(
      'The main of my-gears, poster.pathogen, leaves the project folder (/Users/you/my-gears) through a symbolic link. Move the file into the project folder.',
    );
  });
});
