/**
 * The one path rule every host shares (docs/projects.md § Writing paths):
 * how an @font source is classified, and how a written path resolves inside
 * the project folder. Project paths are POSIX strings rooted at the project
 * folder: '/' is the project folder itself.
 */
import { describe, expect, it } from 'vitest';

import { classifyFontSource, projectDirname, resolveProjectPath } from '../../src/host/paths';

describe('classifyFontSource', () => {
  it.each(['./fonts/Baumans-Regular.ttf', '../shared/Inter.otf', '/fonts/Raleway-Bold.woff2'])(
    'a source starting with ./, ../ or / is a file path: %s',
    (source) => {
      expect(classifyFontSource(source)).toEqual({ kind: 'file', path: source });
    },
  );

  it.each(['Inter', 'Playfair Display', 'Noto Sans SC', 'Raleway-Bold'])(
    'anything else is a family name: %s',
    (source) => {
      expect(classifyFontSource(source)).toEqual({ kind: 'family', family: source });
    },
  );

  it.each(['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui', 'ui-monospace'])(
    'a CSS generic family is not a font: %s',
    (source) => {
      expect(classifyFontSource(source)).toEqual({
        kind: 'invalid',
        message: `@font "${source}": ${source} is a CSS generic family, not a font. Name a font family instead, such as @font "Noto Serif";`,
      });
    },
  );

  it.each([
    ['Inter.ttf', './Inter.ttf'],
    ['Inter.TTF', './Inter.TTF'],
    ['Raleway-Bold.woff2', './Raleway-Bold.woff2'],
    ['fonts/Inter', './fonts/Inter'],
    ['fonts/Baumans-Regular.ttf', './fonts/Baumans-Regular.ttf'],
  ])('a name that looks like a file gets a suggestion: %s', (source, suggestion) => {
    expect(classifyFontSource(source)).toEqual({
      kind: 'invalid',
      message: `@font "${source}" looks like a file name but isn't a path. File paths start with ./, ../ or / — did you mean "${suggestion}"?`,
    });
  });

  it.each([
    ['.\\fonts\\a.ttf', './fonts/a.ttf'],
    ['fonts\\a.ttf', './fonts/a.ttf'],
    ['..\\shared\\b.otf', '../shared/b.otf'],
  ])('a backslash is an error with the forward-slash spelling: %s', (source, suggestion) => {
    expect(classifyFontSource(source)).toEqual({
      kind: 'invalid',
      message: `@font path "${source}" uses a backslash. Write paths with forward slashes on every system: "${suggestion}".`,
    });
  });

  it.each(['C:/Fonts/arial.ttf', 'c:/fonts/arial.ttf', 'D:\\fonts\\x.otf', '~/Library/Fonts/x.ttf'])(
    'a path on your computer is an error: %s',
    (source) => {
      expect(classifyFontSource(source)).toEqual({
        kind: 'invalid',
        message: `@font path "${source}" is a path on your computer. Write paths relative to the file (./ or ../) or the project folder (/).`,
      });
    },
  );

  it('a web address is an error', () => {
    expect(classifyFontSource('https://fonts.example.com/a.ttf')).toEqual({
      kind: 'invalid',
      message:
        '@font "https://fonts.example.com/a.ttf" is a web address. @font takes a font family name or a file path inside the project folder.',
    });
  });
});

describe('resolveProjectPath', () => {
  it('resolves ./ and ../ against the folder of the file the path is written in', () => {
    expect(resolveProjectPath('./fonts/a.ttf', '/main.pathogen')).toEqual({ ok: true, path: '/fonts/a.ttf' });
    expect(resolveProjectPath('./a.ttf', '/parts/rack.pathogen')).toEqual({ ok: true, path: '/parts/a.ttf' });
    expect(resolveProjectPath('../fonts/a.ttf', '/parts/rack.pathogen')).toEqual({ ok: true, path: '/fonts/a.ttf' });
  });

  it('resolves / against the project folder, whatever file it is written in', () => {
    expect(resolveProjectPath('/fonts/a.ttf', '/parts/deep/rack.pathogen')).toEqual({ ok: true, path: '/fonts/a.ttf' });
  });

  it('collapses . segments, repeated slashes, and .. that stays inside', () => {
    expect(resolveProjectPath('./fonts/./x/../a.ttf', '/main.pathogen')).toEqual({ ok: true, path: '/fonts/a.ttf' });
    expect(resolveProjectPath('.//fonts//a.ttf', '/main.pathogen')).toEqual({ ok: true, path: '/fonts/a.ttf' });
  });

  it('refuses a path that climbs out of the project folder', () => {
    expect(resolveProjectPath('../a.ttf', '/main.pathogen')).toEqual({ ok: false, error: 'escapes-root' });
    expect(resolveProjectPath('../../.ssh/id_rsa', '/parts/rack.pathogen')).toEqual({
      ok: false,
      error: 'escapes-root',
    });
    expect(resolveProjectPath('/../a.ttf', '/main.pathogen')).toEqual({ ok: false, error: 'escapes-root' });
    // Climbing out and back in is still out: the walk never leaves the root.
    expect(resolveProjectPath('../my-gears/a.ttf', '/main.pathogen')).toEqual({ ok: false, error: 'escapes-root' });
  });

  it('projectDirname is the folder part of a project path', () => {
    expect(projectDirname('/main.pathogen')).toBe('/');
    expect(projectDirname('/parts/rack.pathogen')).toBe('/parts');
    expect(projectDirname('/a/b/c.pathogen')).toBe('/a/b');
  });
});
