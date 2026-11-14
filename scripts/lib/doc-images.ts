// Images in the docs (docs/CLAUDE.md "Images"). A docs page shows an image
// written on a line of its own:
//
//   ![What it shows](images/workspace-files.png "An optional caption")
//
// The file is a PNG in docs/images/. When `workspace-files.dark.png` sits
// beside it, the page shows that one in the dark theme. The build checks
// every image, renders it as a <figure>, and copies the files a published
// page uses to website/docs-static/images/, served at /docs/images/.
// Anything else is a build error that says what to change, so a page never
// ships with a broken image.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Where the site serves the images (build-website copies docs-static to /docs). */
export const IMAGES_URL = '/docs/images/';

/** A docs image that can't be shown: the build stops with this message. */
export class DocImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocImageError';
  }
}

export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG's size, read from its header (IHDR is always the first chunk), or null if it isn't a PNG. */
export function pngSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 24 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** The dark version's name: `gears.png` → `gears.dark.png`. */
export function darkNameOf(name: string): string {
  return name.replace(/\.png$/, '.dark.png');
}

// `images/` then one or more parts made of letters, digits, `-`, `_` and `.`,
// each starting with a letter or a digit, so `..` can't climb out.
const IMAGE_HREF = /^images\/((?:[A-Za-z0-9][\w.-]*\/)*[A-Za-z0-9][\w.-]*)$/;

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

interface ImageToken {
  type: 'image';
  raw: string;
  href: string;
  title?: string | null;
  text: string;
}

interface ResolvedImage {
  name: string;
  size: ImageSize;
  dark: { name: string; size: ImageSize } | null;
}

/**
 * Check one image against the rules, and read its size and its dark version's.
 * `docFile` names the page in messages; `imagesDir` is docs/images/.
 */
export function resolveDocImage(token: ImageToken, docFile: string, imagesDir: string): ResolvedImage {
  const fail = (why: string): never => {
    throw new DocImageError(`docs/${docFile}: ${token.raw}: ${why}`);
  };
  if (!token.text.trim()) fail('an image needs alt text that says what it shows: ![What it shows](images/name.png)');
  const match = IMAGE_HREF.exec(token.href);
  if (!match) fail('an image must be a file in docs/images/, written as images/name.png');
  const name = match![1];
  if (!name.endsWith('.png')) fail('only PNG images are supported (docs/CLAUDE.md "Images")');
  if (name.endsWith('.dark.png')) {
    fail(`name the light version, images/${name.replace(/\.dark\.png$/, '.png')}; its .dark.png is found beside it`);
  }

  const sizeOf = (file: string): ImageSize => {
    const path = join(imagesDir, file);
    if (!existsSync(path)) fail(`docs/images/${file} doesn't exist`);
    const size = pngSize(readFileSync(path));
    if (!size) fail(`docs/images/${file} isn't a PNG file`);
    return size!;
  };

  const size = sizeOf(name);
  const darkName = darkNameOf(name);
  const dark = existsSync(join(imagesDir, darkName)) ? { name: darkName, size: sizeOf(darkName) } : null;
  return { name, size, dark };
}

/** The <figure> for a checked image. Alt text and caption are escaped here, once. */
export function figureHtml(image: ResolvedImage, alt: string, caption: string | null): string {
  const img = (name: string, size: ImageSize, theme: string) =>
    `<img class="doc-image${theme}" src="${IMAGES_URL}${name}" alt="${escapeHtml(alt)}" ` +
    `width="${size.width}" height="${size.height}" loading="lazy" decoding="async">`;
  const images = image.dark
    ? img(image.name, image.size, ' doc-image-light') + img(image.dark.name, image.dark.size, ' doc-image-dark')
    : img(image.name, image.size, '');
  const figcaption = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
  return `<figure class="doc-figure">${images}${figcaption}</figure>\n`;
}

/**
 * The marked renderer methods for one page. A paragraph that holds only an
 * image becomes a <figure> (not a <figure> inside a <p>, which isn't valid
 * HTML); every other paragraph renders as before. An image anywhere else (in
 * a sentence, a list, a table, a link, or on the line next to another) is a
 * problem. A reference-style image (`![alt][ref]`) is an image token like any
 * other.
 *
 * Problems are added to `problems` rather than thrown, so the build can list
 * them all and stop (marked would add its own "please report this" line to a
 * thrown error). Each image's files are added to `used`, for copyDocImages.
 */
export function docImageRenderer(docFile: string, imagesDir: string, used: Set<string>, problems: string[]) {
  return {
    paragraph({ tokens }: { tokens?: { type: string; tokens?: { type: string }[]; raw?: string }[] }): string | false {
      // A link around an image: say so, rather than "not on a line of its own".
      const only = tokens?.length === 1 ? tokens[0] : null;
      if (only?.type === 'link' && only.tokens?.length === 1 && only.tokens[0].type === 'image') {
        problems.push(
          `docs/${docFile}: ${only.raw}: a link around an image isn't supported; put the link in the text before or after it`,
        );
        return '';
      }
      if (only?.type !== 'image') return false;
      const token = only as unknown as ImageToken;
      try {
        const image = resolveDocImage(token, docFile, imagesDir);
        used.add(image.name);
        if (image.dark) used.add(image.dark.name);
        return figureHtml(image, token.text, token.title || null);
      } catch (err) {
        if (!(err instanceof DocImageError)) throw err;
        problems.push(err.message);
        return '';
      }
    },
    image(token: ImageToken): string {
      problems.push(
        `docs/${docFile}: ${token.raw}: an image must be a paragraph of its own, with a blank line before and after it, ` +
          'not in a sentence, a list or a table',
      );
      return '';
    },
  };
}

/** Every PNG in docs/images/ and its folders, by path inside it. None when the folder doesn't exist. */
export function listDocImages(imagesDir: string): string[] {
  const found: string[] = [];
  const walk = (folder: string, prefix: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(folder, entry.name), `${prefix}${entry.name}/`);
      else if (entry.isFile() && entry.name.endsWith('.png')) found.push(`${prefix}${entry.name}`);
    }
  };
  if (existsSync(imagesDir)) walk(imagesDir, '');
  return found.sort();
}

/**
 * Copy the images published pages use from docs/images/ to `outDir`
 * (website/docs-static/images/), after emptying it, so a file no page uses any
 * more doesn't linger. Returns the files in docs/images/ that no published page
 * uses, for a note: a page that isn't in DOC_FILES yet may hold them.
 */
export function copyDocImages(
  used: ReadonlySet<string>,
  imagesDir: string,
  outDir: string,
  all: readonly string[],
): string[] {
  // It empties outDir first, so it only ever takes a folder named images.
  if (basename(outDir) !== 'images')
    throw new Error(`copyDocImages empties its output folder; ${outDir} isn't an images folder`);
  rmSync(outDir, { recursive: true, force: true });
  for (const name of [...used].sort()) {
    const to = join(outDir, name);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(imagesDir, name), to);
  }
  return all.filter((name) => !used.has(name)).sort();
}
