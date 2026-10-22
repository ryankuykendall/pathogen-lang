// Renders the post's specimen sample with other families from fonts/ to
// check the "change `family` and it redraws" claim. Writes one probe source
// and one PNG per family under project-docs/glyph-listing/blog/.
//
//   npx tsx project-docs/glyph-listing/blog/verify-specimen-families.ts
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const here = 'project-docs/glyph-listing/blog';
const sample = readFileSync(`${root}website/blog/samples/post57/05-specimen.pathogen`, 'utf8');

// Bebas Neue only ships a Regular file in fonts/, so it is loaded at 400.
const families: { family: string; weight: number }[] = [
  { family: 'Raleway', weight: 700 },
  { family: 'Playfair Display', weight: 700 },
  { family: 'Libre Baskerville', weight: 700 },
  { family: 'Inconsolata', weight: 700 },
  { family: 'Bebas Neue', weight: 400 },
];

for (const { family, weight } of families) {
  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const source = sample
    .replace(/let family = ['"]Raleway['"];/, `let family = '${family}';`)
    .replace('@font family 700;', `@font family ${weight};`)
    .replace('    font-weight: 700;\n    font-size: size;', `    font-weight: ${weight};\n    font-size: size;`);
  const probe = `${here}/probes/specimen-${slug}.pathogen`;
  writeFileSync(`${root}${probe}`, source);
  try {
    execFileSync(
      'npx',
      ['tsx', 'src/cli.ts', probe, `--output-svg-file=${here}/previews/specimen-${slug}.svg`, `--png=${here}/previews/specimen-${slug}.png`],
      { cwd: root, stdio: 'pipe' },
    );
    console.log(`ok   ${family} ${weight}`);
  } catch (err) {
    console.log(`FAIL ${family} ${weight}: ${String((err as { stderr?: Buffer }).stderr ?? err).trim().split('\n').pop()}`);
  }
}
