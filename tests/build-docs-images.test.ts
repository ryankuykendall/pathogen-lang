// Images in the docs (docs/CLAUDE.md "Images"; scripts/lib/doc-images.ts):
// a PNG in docs/images/ on a line of its own becomes a <figure>, with its
// dark version when one sits beside it. Every other paragraph renders as
// marked renders it, and an image the build can't show is a problem that
// names the page, the image and what to change.

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Marked } from 'marked';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { copyDocImages, darkNameOf, docImageRenderer, listDocImages, pngSize } from '../scripts/lib/doc-images';

/** The first 24 bytes of a PNG: its signature and the size in its IHDR chunk. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

let imagesDir: string;

beforeEach(() => {
  imagesDir = mkdtempSync(join(tmpdir(), 'doc-images-'));
});

afterEach(() => {
  rmSync(imagesDir, { recursive: true, force: true });
});

const addImage = (name: string, width: number, height: number) => {
  const path = join(imagesDir, name);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, pngHeader(width, height));
};

/** Render a page the way scripts/build-docs.ts does, with the image renderer. */
function render(markdown: string) {
  const used = new Set<string>();
  const problems: string[] = [];
  const html = new Marked({
    gfm: true,
    breaks: false,
    renderer: docImageRenderer('page.md', imagesDir, used, problems),
  }).parse(markdown) as string;
  return { html, used, problems };
}

describe('pngSize', () => {
  it("reads a PNG's width and height from its header", () => {
    expect(pngSize(pngHeader(1280, 860))).toEqual({ width: 1280, height: 860 });
  });

  it('is null for a file that is not a PNG, or too short to hold the header', () => {
    const jpeg = new Uint8Array(32);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(pngSize(jpeg)).toBeNull();
    expect(pngSize(pngHeader(10, 10).slice(0, 20))).toBeNull();
    expect(pngSize(pngHeader(0, 10))).toBeNull();
  });
});

describe('an image on a line of its own', () => {
  it('becomes a figure with the size from the file, outside any paragraph', () => {
    addImage('gears.png', 1200, 800);
    const { html, used, problems } = render('Before.\n\n![Two gears](images/gears.png)\n\nAfter.\n');
    expect(problems).toEqual([]);
    expect(html).toBe(
      '<p>Before.</p>\n' +
        '<figure class="doc-figure"><img class="doc-image" src="/docs/images/gears.png" alt="Two gears" ' +
        'width="1200" height="800" loading="lazy" decoding="async"></figure>\n' +
        '<p>After.</p>\n',
    );
    expect(used).toEqual(new Set(['gears.png']));
  });

  it('shows its dark version in the dark theme, each with its own size', () => {
    addImage('tree.png', 900, 600);
    addImage('tree.dark.png', 902, 602);
    const { html, used, problems } = render('![The tree](images/tree.png)\n');
    expect(problems).toEqual([]);
    expect(html).toBe(
      '<figure class="doc-figure">' +
        '<img class="doc-image doc-image-light" src="/docs/images/tree.png" alt="The tree" width="900" height="600" loading="lazy" decoding="async">' +
        '<img class="doc-image doc-image-dark" src="/docs/images/tree.dark.png" alt="The tree" width="902" height="602" loading="lazy" decoding="async">' +
        '</figure>\n',
    );
    expect(used).toEqual(new Set(['tree.png', 'tree.dark.png']));
  });

  it('takes its caption from the title, and escapes the alt text and the caption once', () => {
    addImage('chip.png', 400, 300);
    const { html, problems } = render('![A & B "quoted" <tag>](images/chip.png "Fish & <chips> \'n\' peas")\n');
    expect(problems).toEqual([]);
    expect(html).toBe(
      '<figure class="doc-figure"><img class="doc-image" src="/docs/images/chip.png" ' +
        'alt="A &amp; B &quot;quoted&quot; &lt;tag&gt;" width="400" height="300" loading="lazy" decoding="async">' +
        '<figcaption>Fish &amp; &lt;chips&gt; &#39;n&#39; peas</figcaption></figure>\n',
    );
  });

  it('can be written reference-style, with its path in a definition', () => {
    addImage('gears.png', 30, 20);
    const { html, problems } = render('![Two gears][gears]\n\n[gears]: images/gears.png "The caption"\n');
    expect(problems).toEqual([]);
    expect(html).toBe(
      '<figure class="doc-figure"><img class="doc-image" src="/docs/images/gears.png" alt="Two gears" ' +
        'width="30" height="20" loading="lazy" decoding="async"><figcaption>The caption</figcaption></figure>\n',
    );
  });

  it('can sit in a folder inside docs/images/', () => {
    addImage('workspace/tree.png', 10, 20);
    const { html, used, problems } = render('![The tree](images/workspace/tree.png)\n');
    expect(problems).toEqual([]);
    expect(html).toContain('src="/docs/images/workspace/tree.png"');
    expect(used).toEqual(new Set(['workspace/tree.png']));
  });
});

describe('every other paragraph', () => {
  it('renders exactly as marked renders it without the image renderer', () => {
    const markdown = [
      '# Title',
      '',
      'Plain text with **bold**, `code`, a [link](#section) and <em>html</em>.',
      '',
      '- a list item',
      '- another, with `code`',
      '',
      '> A quote, with *emphasis*.',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '```json',
      '{ "a": 1 }',
      '```',
      '',
      'Two lines',
      'in one paragraph.',
      '',
    ].join('\n');
    const plain = new Marked({ gfm: true, breaks: false }).parse(markdown);
    const { html, problems } = render(markdown);
    expect(problems).toEqual([]);
    expect(html).toBe(plain);
  });
});

describe("an image the build can't show", () => {
  const problemFor = (markdown: string) => {
    const { problems } = render(markdown);
    expect(problems).toHaveLength(1);
    return problems[0];
  };

  const own =
    'an image must be a paragraph of its own, with a blank line before and after it, not in a sentence, a list or a table';

  it('in a sentence, a list or a table', () => {
    addImage('x.png', 1, 1);
    expect(problemFor('See ![x](images/x.png) here.\n')).toBe(`docs/page.md: ![x](images/x.png): ${own}`);
    expect(problemFor('- ![x](images/x.png)\n')).toBe(`docs/page.md: ![x](images/x.png): ${own}`);
    expect(problemFor('| a |\n|---|\n| ![x](images/x.png) |\n')).toBe(`docs/page.md: ![x](images/x.png): ${own}`);
  });

  it('on the line next to another image, with no blank line between', () => {
    addImage('a.png', 1, 1);
    addImage('b.png', 1, 1);
    const { problems } = render('![a](images/a.png)\n![b](images/b.png)\n');
    expect(problems).toEqual([`docs/page.md: ![a](images/a.png): ${own}`, `docs/page.md: ![b](images/b.png): ${own}`]);
  });

  it('inside a link', () => {
    addImage('x.png', 1, 1);
    expect(problemFor('[![x](images/x.png)](https://example.com)\n')).toBe(
      "docs/page.md: [![x](images/x.png)](https://example.com): a link around an image isn't supported; " +
        'put the link in the text before or after it',
    );
  });

  it('without alt text', () => {
    addImage('x.png', 1, 1);
    expect(problemFor('![](images/x.png)\n')).toBe(
      'docs/page.md: ![](images/x.png): an image needs alt text that says what it shows: ![What it shows](images/name.png)',
    );
  });

  it('outside docs/images/', () => {
    const where = 'an image must be a file in docs/images/, written as images/name.png';
    expect(problemFor('![x](https://example.com/x.png)\n')).toBe(
      `docs/page.md: ![x](https://example.com/x.png): ${where}`,
    );
    expect(problemFor('![x](/docs/images/x.png)\n')).toBe(`docs/page.md: ![x](/docs/images/x.png): ${where}`);
    expect(problemFor('![x](images/../secret.png)\n')).toBe(`docs/page.md: ![x](images/../secret.png): ${where}`);
    expect(problemFor('![x](x.png)\n')).toBe(`docs/page.md: ![x](x.png): ${where}`);
  });

  it('not a PNG', () => {
    expect(problemFor('![x](images/x.svg)\n')).toBe(
      'docs/page.md: ![x](images/x.svg): only PNG images are supported (docs/CLAUDE.md "Images")',
    );
  });

  it('naming the dark version', () => {
    addImage('x.png', 1, 1);
    addImage('x.dark.png', 1, 1);
    expect(problemFor('![x](images/x.dark.png)\n')).toBe(
      'docs/page.md: ![x](images/x.dark.png): name the light version, images/x.png; its .dark.png is found beside it',
    );
  });

  it("a file that doesn't exist, or isn't a PNG", () => {
    expect(problemFor('![x](images/missing.png)\n')).toBe(
      "docs/page.md: ![x](images/missing.png): docs/images/missing.png doesn't exist",
    );
    writeFileSync(join(imagesDir, 'fake.png'), 'not an image');
    expect(problemFor('![x](images/fake.png)\n')).toBe(
      "docs/page.md: ![x](images/fake.png): docs/images/fake.png isn't a PNG file",
    );
  });

  it('a dark version that is not a PNG', () => {
    addImage('x.png', 1, 1);
    writeFileSync(join(imagesDir, 'x.dark.png'), 'not an image');
    expect(problemFor('![x](images/x.png)\n')).toBe(
      "docs/page.md: ![x](images/x.png): docs/images/x.dark.png isn't a PNG file",
    );
  });

  it('lists every problem on the page, and renders nothing in their place', () => {
    const { html, problems } = render('One.\n\n![a](images/a.png)\n\n![b](images/b.png)\n\nTwo.\n');
    expect(problems).toEqual([
      "docs/page.md: ![a](images/a.png): docs/images/a.png doesn't exist",
      "docs/page.md: ![b](images/b.png): docs/images/b.png doesn't exist",
    ]);
    expect(html).toBe('<p>One.</p>\n<p>Two.</p>\n');
  });
});

describe('copying the images', () => {
  it('copies only the images published pages use, after emptying the folder', () => {
    addImage('used.png', 1, 1);
    addImage('used.dark.png', 1, 1);
    addImage('waiting.png', 1, 1);
    addImage('deep/used.png', 1, 1);
    // The built site's images folder, as website/docs-static/images/ is.
    const site = `${imagesDir}-site`;
    const out = join(site, 'images');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'stale.png'), 'left from an earlier build');
    try {
      const unused = copyDocImages(
        new Set(['used.png', 'used.dark.png', 'deep/used.png']),
        imagesDir,
        out,
        listDocImages(imagesDir),
      );
      expect(unused).toEqual(['waiting.png']);
      expect(readdirSync(out).sort()).toEqual(['deep', 'used.dark.png', 'used.png']);
      expect(readdirSync(join(out, 'deep'))).toEqual(['used.png']);
    } finally {
      rmSync(site, { recursive: true, force: true });
    }
  });

  it('refuses to empty a folder that is not an images folder', () => {
    expect(() => copyDocImages(new Set(), imagesDir, join(imagesDir, 'website'), [])).toThrow(
      /copyDocImages empties its output folder; .*website isn't an images folder/,
    );
  });

  it('lists every PNG in docs/images/ and its folders, and none when it has no folder', () => {
    addImage('b.png', 1, 1);
    addImage('a/c.png', 1, 1);
    writeFileSync(join(imagesDir, 'notes.txt'), 'not an image');
    expect(listDocImages(imagesDir)).toEqual(['a/c.png', 'b.png']);
    expect(listDocImages(join(imagesDir, 'nothing-here'))).toEqual([]);
  });

  it('names a dark version by putting .dark before .png', () => {
    expect(darkNameOf('workspace-files.png')).toBe('workspace-files.dark.png');
    expect(darkNameOf('a/b.c.png')).toBe('a/b.c.dark.png');
  });
});
