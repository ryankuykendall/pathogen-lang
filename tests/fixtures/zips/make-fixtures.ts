// Phase 2g: .zip test fixtures made by other tools, for tests/zip.test.ts.
// The gears sample project (project-docs/modules/mockups-2f-vscode-chip/gears-project)
// plus an empty folder, a README and a .DS_Store, zipped three ways:
//   - zip-r.zip:   Info-ZIP `zip -r` (deflate, folder entries), as Linux and macOS's zip make it
//   - zip64.zip:   the same with `-fz` (zip64 records forced), as some tools write
//   - ditto.zip:   `ditto -c -k --sequesterRsrc --keepParent`, what Finder's Compress runs
//                  (deflate with data descriptors; __MACOSX/ entries when files carry extended attributes)
//
//   npx tsx tests/fixtures/zips/make-fixtures.ts   (macOS: needs zip, ditto and xattr; the source tree goes in tmp/2g/zipsrc)
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const GEARS = join(root, 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const SRC = join(root, 'tmp', '2g', 'zipsrc');
const OUT = join(root, 'tests', 'fixtures', 'zips');

rmSync(SRC, { recursive: true, force: true });
mkdirSync(join(SRC, 'gears', 'demos'), { recursive: true });
mkdirSync(join(SRC, 'gears', 'parts'), { recursive: true });
mkdirSync(join(SRC, 'gears', 'empty'), { recursive: true });
for (const file of [
  'pathogen.json',
  'main.pathogen',
  'try-sizes.pathogen',
  'sketch.pathogen',
  'demos/train.pathogen',
  'parts/gears.pathogen',
]) {
  copyFileSync(join(GEARS, file), join(SRC, 'gears', file));
}
writeFileSync(join(SRC, 'gears', 'README.md'), '# Gears\n\nA sample project.\n');
writeFileSync(join(SRC, 'gears', '.DS_Store'), 'not a real .DS_Store\n');
// An extended attribute, so ditto writes __MACOSX/ as Finder does for downloaded files.
execFileSync('xattr', ['-w', 'com.pathogen.fixture', 'yes', join(SRC, 'gears', 'main.pathogen')]);

mkdirSync(OUT, { recursive: true });
for (const name of ['zip-r.zip', 'zip64.zip', 'ditto.zip']) rmSync(join(OUT, name), { force: true });
const cwd = SRC;
execFileSync('zip', ['-r', '-X', '-q', join(OUT, 'zip-r.zip'), 'gears'], { cwd });
execFileSync('zip', ['-r', '-X', '-q', '-fz', join(OUT, 'zip64.zip'), 'gears'], { cwd });
execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', 'gears', join(OUT, 'ditto.zip')], { cwd });

for (const name of ['zip-r.zip', 'zip64.zip', 'ditto.zip']) {
  console.log(`--- ${name}`);
  console.log(execFileSync('unzip', ['-Z', '-v', join(OUT, name)]).toString().split('\n').filter((l) => /^(Central directory entry|  file system or operating system of origin|  compression method|  general purpose bit flag|There is no zipfile comment|Zip64|  Zip64|The zipfile comment)/.test(l) || /^ +[^ ].*\.(pathogen|json|md)$/.test(l)).slice(0, 60).join('\n'));
  console.log(execFileSync('unzip', ['-l', join(OUT, name)]).toString());
}
