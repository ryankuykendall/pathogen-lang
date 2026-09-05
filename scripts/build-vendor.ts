import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import * as esbuild from 'esbuild';

import { applyVendorPatches } from './lib/vendor-patches.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VENDOR_OUT = join(ROOT, 'public', 'vendor');

const require = createRequire(import.meta.url);

interface VendorEntry {
  name: string;
  /** Optional sub-path within the package (e.g., 'decompress' to entry only the WOFF2 decompressor) */
  entry?: string;
  /** ROOT-relative entry file used instead of require.resolve(name) — for local
   *  shim entries that re-export multiple packages (e.g. scripts/vendor-entries/). */
  entryPath?: string;
  outFile: string;
  /** Modules that should remain unbundled (typically Node built-ins guarded at runtime). */
  external?: string[];
  /** Copy the resolved entry file as-is. Use for packages that already ship clean ESM with
   *  inline WASM (e.g. woff2-encoder/decompress) — bundling them through esbuild's CJS-shim
   *  path can break Emscripten runtime initialization. */
  copyOnly?: boolean;
}

const VENDORS: VendorEntry[] = [
  { name: 'hdr-color-input', outFile: 'hdr-color-input.js' },
  // woff2-encoder ships clean ESM with inline WASM and the modern `Module.ready`
  // pattern (no race against `onRuntimeInitialized`). Copy as-is.
  { name: 'woff2-encoder', entry: 'decompress', outFile: 'woff2-decompress.js', copyOnly: true },
  // jsPDF + svg2pdf.js bundled together (shared jsPDF instance) for the
  // Export-with-Legend PDF download path; lazy-imported on demand.
  { name: 'pdf-export', entryPath: 'scripts/vendor-entries/pdf-export.ts', outFile: 'pdf-export.js' },
  // opentype.js for client-side text-to-outline conversion in PDF exports.
  { name: 'opentype.js', outFile: 'opentype.js' },
];

export async function buildVendor(options: { watch?: boolean } = {}): Promise<void> {
  await fs.mkdir(VENDOR_OUT, { recursive: true });

  for (const vendor of VENDORS) {
    const entrySpec = vendor.entry ? `${vendor.name}/${vendor.entry}` : vendor.name;
    const entry = vendor.entryPath ? join(ROOT, vendor.entryPath) : require.resolve(entrySpec);
    const outfile = join(VENDOR_OUT, vendor.outFile);
    if (vendor.copyOnly) {
      await fs.copyFile(entry, outfile);
      const stat = await fs.stat(outfile);
      console.log(`Copied vendor ${vendor.name} -> ${outfile} (${(stat.size / 1024).toFixed(1)} KB)`);
      continue;
    }
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
      external: vendor.external,
    };

    if (options.watch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log(`Watching ${vendor.name} for changes -> ${outfile}`);
    } else {
      await esbuild.build(buildOptions);
      const patched = applyVendorPatches(vendor.name, await fs.readFile(outfile, 'utf8'));
      if (patched.labels.length > 0) {
        await fs.writeFile(outfile, patched.source);
        for (const label of patched.labels) console.log(`  patched ${vendor.name}: ${label}`);
      }
      const stat = await fs.stat(outfile);
      console.log(`Built vendor ${vendor.name} -> ${outfile} (${(stat.size / 1024).toFixed(1)} KB minified)`);
    }
  }
}

const isDirectExecution =
  process.argv[1] && (process.argv[1].endsWith('build-vendor.ts') || process.argv[1].endsWith('build-vendor.js'));

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
