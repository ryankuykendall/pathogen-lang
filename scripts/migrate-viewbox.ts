// One-off migration: normalize every workspace's source so it starts with
// the canonical Pathogen Studio boilerplate, exactly in this form:
//
//   define ViewBox(${originX}, ${originY}, ${width}, ${height});
//   define default PathLayer('main-path-layer') ${
//     fill: #bbb;
//     stroke: #222;
//     stroke-width: 1;
//   };
//
//   <rest of original code>
//
// ## Behavior
//
// • **ViewBox is always prepended at the top in canonical form.** Any
//   existing `define ViewBox(...)` statement (wherever it sits in the
//   source) is stripped first; its `originX, originY, width, height`
//   values are preserved verbatim. If the workspace had no ViewBox, the
//   stored `preferences.width` × `preferences.height` are used (defaulting
//   to 200 × 200 when absent).
//
// • **Canonical default PathLayer is prepended only if the workspace has
//   no existing default layer.** Workspaces that already have a custom
//   default layer (e.g. `define default PathLayer('shape') ...`) keep that
//   layer at its current position — the migration does not move, replace,
//   or duplicate it. ViewBox still moves to the top regardless.
//
// • **Idempotent.** Re-runs are no-ops on workspaces whose source already
//   matches the target shape.
//
// ## Persist location
//
// dev:stack persists to `<root>/.wrangler/state`. When invoked from `api/`
// (the script's cwd) that path is `../.wrangler/state`, passed via
// `--persist-to`. Without it, wrangler would default to
// `api/.wrangler/state`, which is a separate (unused) store.
//
// ## Concurrency
//
// Re-reads the workspace immediately before each write; aborts if its
// `updatedAt` changed (an autosave landed between our parse and write).
// KV has no compare-and-swap, so this is best-effort — but the window is
// sub-second.
//
// Usage:
//   tsx scripts/migrate-viewbox.ts --env=dev
//   tsx scripts/migrate-viewbox.ts --env=prod --confirm
//   tsx scripts/migrate-viewbox.ts --env=dev --dry-run

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { compile, parseLezer } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, '..', 'api');

interface Workspace {
  id: string;
  slug?: string;
  userId: string;
  name: string;
  description: string;
  isPublic: boolean;
  code: string;
  preferences?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  contentHash: string;
  thumbnailAt: string | null;
  manualThumbnailAt?: string | null;
  autoThumbnailAt?: string | null;
  [key: string]: unknown;
}

const DEFAULT_LAYER_BLOCK = `define default PathLayer('main-path-layer') #{
  fill: #bbb;
  stroke: #222;
  stroke-width: 1;
};`;

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { cwd: API_DIR, encoding: 'utf-8' });
}

function buildKvFlags(env: 'dev' | 'prod'): string[] {
  if (env === 'dev') {
    // dev:stack persists to <root>/.wrangler/state (api dev passes
    // --persist-to=../.wrangler/state, pages dev passes --persist-to=.wrangler/state).
    // We run wrangler with cwd=api/, so the equivalent path is ../.wrangler/state.
    return ['--binding=WORKSPACES', '--preview', 'true', '--persist-to=../.wrangler/state'];
  }
  return ['--binding=WORKSPACES', '--remote', '--preview', 'false'];
}

function kvList(flags: string[]): { name: string }[] {
  return JSON.parse(wrangler(['kv', 'key', 'list', ...flags]));
}

function kvGet(flags: string[], key: string): string | null {
  let raw: string;
  try {
    raw = wrangler(['kv', 'key', 'get', ...flags, key]);
  } catch {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === 'Value not found') return null;
  return raw;
}

function kvPut(flags: string[], key: string, value: string): void {
  execFileSync('npx', ['wrangler', 'kv', 'key', 'put', ...flags, key, value], {
    cwd: API_DIR,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

interface CanonicalForm {
  newCode: string;
  changed: boolean;
  viewBoxWasPresent: boolean;
  defaultLayerWasPresent: boolean;
  viewBox: { originX: number; originY: number; width: number; height: number };
}

// Build the canonical form of the workspace's code. Returns the rewritten
// source and metadata about what changed. AST-walks the existing source so
// comment / template-literal mentions of the boilerplate never fool the
// rewriter.
function canonicalize(
  code: string,
  prefs: Record<string, unknown>,
): CanonicalForm {
  const prefW = Math.round(Number(prefs.width) || 200);
  const prefH = Math.round(Number(prefs.height) || 200);

  // Locate existing top-level ViewBox / default-layer in the Lezer tree.
  // Using tree.iterate top-down and bailing on first match per kind.
  let viewBoxRange: { from: number; to: number } | null = null;
  let defaultLayerPresent = false;

  let tree: ReturnType<typeof parseLezer>['tree'];
  try {
    ({ tree } = parseLezer(code));
  } catch {
    // Unparseable source. Bail to "no existing definitions" so the
    // canonical block goes at the top and the user's broken source
    // follows unchanged.
    tree = null as never;
  }

  if (tree) {
    const cursor = tree.cursor();
    if (cursor.firstChild()) {
      do {
        const name = cursor.name;
        if (name === 'ViewBoxDefinition' && !viewBoxRange) {
          viewBoxRange = { from: cursor.from, to: cursor.to };
        } else if (name === 'LayerDefinition') {
          // Walk children for a "default" keyword token.
          const inner = cursor.node.cursor();
          if (inner.firstChild()) {
            do {
              if (inner.name === 'default') {
                defaultLayerPresent = true;
                break;
              }
            } while (inner.nextSibling());
          }
        }
      } while (cursor.nextSibling());
    }
  }

  // Resolve target ViewBox dimensions. Prefer existing values when the
  // workspace already had a ViewBox — even if it sits mid-file, those
  // are the dimensions the user intended.
  let originX = 0;
  let originY = 0;
  let width = prefW;
  let height = prefH;
  if (viewBoxRange) {
    try {
      const result = compile(code) as { viewBox?: { originX: number; originY: number; width: number; height: number } };
      if (result.viewBox) {
        originX = result.viewBox.originX;
        originY = result.viewBox.originY;
        width = result.viewBox.width;
        height = result.viewBox.height;
      }
    } catch {
      // Compile failed (legacy syntax, parse error, runtime error). Fall
      // back to preferences. Origin defaults to 0,0 in that case.
    }
  }

  // Strip the existing ViewBox from its current location, if any.
  let body = code;
  if (viewBoxRange) {
    body = code.slice(0, viewBoxRange.from) + code.slice(viewBoxRange.to);
  }
  // Normalize the leading whitespace of the body so we don't end up with
  // multiple blank lines after our canonical prepend.
  body = body.replace(/^\s+/, '');

  // Build the prepend block.
  const parts: string[] = [];
  parts.push(`define ViewBox(${originX}, ${originY}, ${width}, ${height});`);
  if (!defaultLayerPresent) {
    parts.push(DEFAULT_LAYER_BLOCK);
  }
  const prefix = parts.join('\n') + (body.length > 0 ? '\n\n' : '\n');
  const newCode = prefix + body;

  return {
    newCode,
    changed: newCode !== code,
    viewBoxWasPresent: !!viewBoxRange,
    defaultLayerWasPresent: defaultLayerPresent,
    viewBox: { originX, originY, width, height },
  };
}

type Outcome =
  | {
      kind: 'migrated';
      viewBoxAdded: boolean;
      layerAdded: boolean;
      reordered: boolean;
      w: number;
      h: number;
    }
  | { kind: 'skipped-already-canonical' }
  | { kind: 'skipped-concurrent-write' }
  | { kind: 'error'; message: string };

async function migrateWorkspace(flags: string[], key: string, dryRun: boolean): Promise<Outcome> {
  const raw = kvGet(flags, key);
  if (!raw) return { kind: 'error', message: 'KV value missing' };

  let workspace: Workspace;
  try {
    workspace = JSON.parse(raw);
  } catch (e) {
    return { kind: 'error', message: `JSON parse failed: ${(e as Error).message}` };
  }

  const code = workspace.code ?? '';
  const canonical = canonicalize(code, (workspace.preferences ?? {}) as Record<string, unknown>);

  if (!canonical.changed) {
    return { kind: 'skipped-already-canonical' };
  }

  if (dryRun) {
    return {
      kind: 'migrated',
      viewBoxAdded: !canonical.viewBoxWasPresent,
      layerAdded: !canonical.defaultLayerWasPresent,
      reordered: canonical.viewBoxWasPresent || canonical.defaultLayerWasPresent,
      w: canonical.viewBox.width,
      h: canonical.viewBox.height,
    };
  }

  // Re-read just before write to catch a concurrent autosave. KV has no
  // compare-and-swap; we use updatedAt as the version marker.
  const recheckRaw = kvGet(flags, key);
  if (recheckRaw) {
    try {
      const fresh = JSON.parse(recheckRaw) as Workspace;
      if (fresh.updatedAt !== workspace.updatedAt) {
        return { kind: 'skipped-concurrent-write' };
      }
    } catch {
      // Re-read parse failure: proceed (we already have a valid record).
    }
  }

  workspace.code = canonical.newCode;
  kvPut(flags, key, JSON.stringify(workspace));
  return {
    kind: 'migrated',
    viewBoxAdded: !canonical.viewBoxWasPresent,
    layerAdded: !canonical.defaultLayerWasPresent,
    reordered: canonical.viewBoxWasPresent || canonical.defaultLayerWasPresent,
    w: canonical.viewBox.width,
    h: canonical.viewBox.height,
  };
}

const program = new Command();
program
  .name('migrate-viewbox')
  .description("Normalize every workspace's source to start with the canonical ViewBox + default PathLayer boilerplate")
  .requiredOption('--env <env>', 'dev or prod')
  .option('--confirm', 'required for --env=prod')
  .option('--dry-run', 'list affected workspaces without writing')
  .action(async (opts: { env: string; confirm?: boolean; dryRun?: boolean }) => {
    const env = opts.env as 'dev' | 'prod';
    if (env !== 'dev' && env !== 'prod') {
      console.error(`--env must be 'dev' or 'prod' (got: ${opts.env})`);
      process.exit(1);
    }
    if (env === 'prod' && !opts.confirm) {
      console.error('Refusing to run against prod without --confirm');
      process.exit(1);
    }
    const dryRun = Boolean(opts.dryRun);

    console.log(`Target environment: ${env.toUpperCase()}${dryRun ? ' (DRY RUN)' : ''}`);
    const flags = buildKvFlags(env);

    console.log('Listing KV keys...');
    const allKeys = kvList(flags);
    const workspaceKeys = allKeys.filter((k) => k.name.startsWith('workspace:'));
    console.log(`Found ${workspaceKeys.length} workspace keys.\n`);

    const counts = {
      'migrated-fresh': 0,           // had neither ViewBox nor default layer
      'migrated-viewbox-added': 0,   // had default layer, no ViewBox at top → add ViewBox
      'migrated-layer-added': 0,     // had ViewBox somewhere, no default layer → add canonical default
      'migrated-reordered': 0,       // had both; moved ViewBox to top, kept existing default layer
      'skipped-already-canonical': 0,
      'skipped-concurrent-write': 0,
      error: 0,
    };

    for (const { name: key } of workspaceKeys) {
      try {
        const outcome = await migrateWorkspace(flags, key, dryRun);
        if (outcome.kind === 'migrated') {
          if (outcome.viewBoxAdded && outcome.layerAdded) {
            counts['migrated-fresh'] += 1;
          } else if (outcome.viewBoxAdded) {
            counts['migrated-viewbox-added'] += 1;
          } else if (outcome.layerAdded) {
            counts['migrated-layer-added'] += 1;
          } else {
            counts['migrated-reordered'] += 1;
          }
          const what: string[] = [];
          if (outcome.viewBoxAdded) what.push(`+ViewBox ${outcome.w}x${outcome.h}`);
          else what.push(`viewBox→top ${outcome.w}x${outcome.h}`);
          if (outcome.layerAdded) what.push('+default PathLayer');
          console.log(`  [migrated] ${key} — ${what.join(', ')}`);
        } else if (outcome.kind === 'error') {
          counts.error += 1;
          console.log(`  [error]    ${key}: ${outcome.message}`);
        } else {
          counts[outcome.kind] += 1;
        }
      } catch (e) {
        counts.error += 1;
        console.log(`  [error]    ${key}: ${(e as Error).message}`);
      }
    }

    console.log('\nSummary:');
    console.log(`  migrated (fresh — both prepended):           ${counts['migrated-fresh']}`);
    console.log(`  migrated (had default layer; ViewBox added): ${counts['migrated-viewbox-added']}`);
    console.log(`  migrated (had ViewBox; default added):       ${counts['migrated-layer-added']}`);
    console.log(`  migrated (reordered ViewBox to top):         ${counts['migrated-reordered']}`);
    console.log(`  skipped (already canonical):                 ${counts['skipped-already-canonical']}`);
    console.log(`  skipped (concurrent write):                  ${counts['skipped-concurrent-write']}`);
    console.log(`  errors:                                      ${counts.error}`);
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
