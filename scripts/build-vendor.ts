import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VENDOR_OUT = join(ROOT, 'public', 'pathogen', 'vendor');

const require = createRequire(import.meta.url);

interface VendorEntry {
  name: string;
  outFile: string;
}

const VENDORS: VendorEntry[] = [
  { name: 'hdr-color-input', outFile: 'hdr-color-input.js' },
];

export async function buildVendor(options: { watch?: boolean } = {}): Promise<void> {
  await fs.mkdir(VENDOR_OUT, { recursive: true });

  for (const vendor of VENDORS) {
    const entry = require.resolve(vendor.name);
    const outfile = join(VENDOR_OUT, vendor.outFile);
    const buildOptions: esbuild.BuildOptions = {
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: !options.watch,
      sourcemap: options.watch ? 'linked' : false,
      legalComments: 'linked',
      logLevel: 'warning',
    };

    if (options.watch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log(`Watching ${vendor.name} for changes -> ${outfile}`);
    } else {
      await esbuild.build(buildOptions);
      const stat = await fs.stat(outfile);
      console.log(`Built vendor ${vendor.name} -> ${outfile} (${(stat.size / 1024).toFixed(1)} KB minified)`);
    }
  }
}

const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('build-vendor.ts') || process.argv[1].endsWith('build-vendor.js'));

if (isDirectExecution) {
  const program = new Command();
  program
    .name('build-vendor')
    .description('Bundle npm dependencies into self-contained ESM files under public/pathogen/vendor/')
    .option('-w, --watch', 'Watch for changes and rebuild')
    .action(async (opts) => {
      try {
        await buildVendor({ watch: opts.watch });
      } catch (err) {
        console.error('Vendor build failed:', err);
        process.exit(1);
      }
    });
  program.parse();
}
