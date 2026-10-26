/**
 * Phase 0b corpus sweep: compile every tracked .pathogen file that uses @font
 * through the real CLI and sort the outcomes, so the new font rules (project
 * folder, exact case, ./ paths, weights, downloads) are checked against the
 * repo's own programs before they ship.
 *
 *   npx tsx project-docs/modules/verify/sweep-font-programs.ts            # downloads off
 *   npx tsx project-docs/modules/verify/sweep-font-programs.ts --online   # downloads on (cache in tmp/)
 *
 * Writes nothing outside ./tmp/ except the report named by --report.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Command } from 'commander';

interface Outcome {
  file: string;
  status: number | null;
  timedOut: boolean;
  ms: number;
  fontErrors: string[];
  fontWarnings: string[];
  otherErrors: string[];
}

const LINE = /^(.*?):(\d+)(?::(\d+))?: (warning|error): (.*)$/;

function compileOne(
  file: string,
  online: boolean,
  outDir: string,
  timeoutMs: number,
  extraArgs: string[],
): Promise<Outcome> {
  const started = Date.now();
  const out = join(outDir, `${file.replace(/[\\/]/g, '__')}.txt`);
  const env = { ...process.env, PATHOGEN_CACHE_DIR: join('tmp', 'font-sweep-cache') };
  if (online) delete env.PATHOGEN_OFFLINE;
  else env.PATHOGEN_OFFLINE = '1';
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', 'src/cli.ts', file, '-o', out, ...extraArgs], { env });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.stdout.resume();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (status) => {
      clearTimeout(timer);
      const outcome: Outcome = {
        file,
        status,
        timedOut,
        ms: Date.now() - started,
        fontErrors: [],
        fontWarnings: [],
        otherErrors: [],
      };
      for (const raw of stderr.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const m = LINE.exec(line);
        if (m) {
          const text = `line ${m[2]}: ${m[5]}`;
          const isFont =
            m[5].startsWith('@font') ||
            /Google Fonts|is not available at weight|is only available at weight|not installed at weight/.test(m[5]);
          if (m[4] === 'error') (isFont ? outcome.fontErrors : outcome.otherErrors).push(text);
          else if (isFont) outcome.fontWarnings.push(text);
        } else if (line.startsWith('Error:')) {
          outcome.otherErrors.push(line);
        }
      }
      resolve(outcome);
    });
  });
}

function group(o: Outcome): string {
  if (o.timedOut) return 'timed out';
  if (o.fontErrors.length) return 'font errors (new rules)';
  if (o.otherErrors.some((e) => /\(strict: [a-z-]+\)/.test(e))) return 'strict-mode error';
  if (o.status !== 0) return o.fontWarnings.length ? 'failed after a font warning' : 'failed (not font-related)';
  if (o.fontWarnings.length) return 'compiled with font warnings';
  return 'clean';
}

const program = new Command();
program
  .name('sweep-font-programs')
  .description('Compile every tracked .pathogen file that uses @font and sort the outcomes')
  .option('--online', 'allow Google Fonts downloads (default: PATHOGEN_OFFLINE=1)', false)
  .option('--samples', 'every tracked blog sample instead of every @font program', false)
  .option('--cli-arg <arg...>', 'extra CLI arguments, e.g. --cli-arg=--strict=non-finite')
  .option('--jobs <n>', 'compiles to run at once', '6')
  .option('--timeout <seconds>', 'per-file time limit', '240')
  .option('--report <file>', 'markdown report path', join('tmp', 'font-sweep-report.md'))
  .action(
    async (opts: {
      online: boolean;
      samples: boolean;
      cliArg?: string[];
      jobs: string;
      timeout: string;
      report: string;
    }) => {
      // --no-color: a color.ui=always config would wrap each name in escape codes.
      const listed = opts.samples
        ? spawnSync('git', ['ls-files', '--', 'website/blog/samples/*.pathogen'], { encoding: 'utf-8' })
        : spawnSync('git', ['grep', '--no-color', '-l', '@font', '--', '*.pathogen'], { encoding: 'utf-8' });
      const files = listed.stdout.split('\n').filter(Boolean);
      const extraArgs = opts.cliArg ?? [];
      const outDir = join('tmp', 'font-sweep');
      mkdirSync(outDir, { recursive: true });

      const outcomes: Outcome[] = [];
      let next = 0;
      const worker = async () => {
        while (next < files.length) {
          const file = files[next++];
          const outcome = await compileOne(file, opts.online, outDir, Number(opts.timeout) * 1000, extraArgs);
          outcomes.push(outcome);
          process.stdout.write(
            `${group(outcome).padEnd(28)} ${(outcome.ms / 1000).toFixed(1).padStart(6)}s  ${file}\n`,
          );
        }
      };
      await Promise.all(Array.from({ length: Number(opts.jobs) }, worker));

      const byGroup = new Map<string, Outcome[]>();
      for (const o of outcomes.sort((a, b) => a.file.localeCompare(b.file))) {
        const g = group(o);
        byGroup.set(g, [...(byGroup.get(g) ?? []), o]);
      }
      const lines = [
        `# ${opts.samples ? 'Blog sample' : '@font corpus'} sweep (${opts.online ? 'downloads on' : 'downloads off'})`,
        '',
        `${outcomes.length} files, ${new Date().toISOString().slice(0, 10)}.${extraArgs.length ? ` CLI arguments: \`${extraArgs.join(' ')}\`.` : ''}`,
        '',
        '| Outcome | Files |',
        '|---|---|',
        ...[...byGroup].map(([g, list]) => `| ${g} | ${list.length} |`),
        '',
      ];
      for (const [g, list] of byGroup) {
        if (g === 'clean') continue;
        lines.push(`## ${g}`, '');
        for (const o of list) {
          lines.push(`- \`${o.file}\` (exit ${o.status ?? 'killed'})`);
          for (const e of [...o.fontErrors, ...o.otherErrors, ...o.fontWarnings]) lines.push(`  - ${e}`);
        }
        lines.push('');
      }
      lines.push('## clean', '', ...(byGroup.get('clean') ?? []).map((o) => `- \`${o.file}\``), '');
      writeFileSync(opts.report, lines.join('\n'));
      process.stdout.write(`\nReport: ${opts.report}\n`);
    },
  );
program.parse();
