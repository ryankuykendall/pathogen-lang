// The one-time card copy for approvals from before 2e step 5b
// (website/api/approval-card.ts; project-docs/modules/58-phase-2e-plan.md, answer 9b).
// Each approval without a card gets its workspace's current thumbnail as its card,
// through the API's own copy (POST /admin/approval-cards), in batches until done.
// Production runs in step 8, with the user's go-ahead.
//
//   ADMIN_TOKEN=... npx tsx scripts/copy-approval-cards.ts                 # local dev API
//   ADMIN_TOKEN=... npx tsx scripts/copy-approval-cards.ts --dry-run --api-base https://api.pathogen.studio
//   ADMIN_TOKEN=... npx tsx scripts/copy-approval-cards.ts --api-base https://api.pathogen.studio --confirm

import { Command } from 'commander';

interface Batch {
  copied: number;
  alreadyCopied: number;
  repaired: number;
  after: string;
  done: boolean;
}

const program = new Command();
program
  .name('copy-approval-cards')
  .description('Give every approval from before the card copy its card image (POST /admin/approval-cards)')
  .option('--api-base <url>', 'API worker origin', 'http://localhost:8787')
  .option('--token <token>', 'admin token (prefer env ADMIN_TOKEN — --token is visible in ps/shell history)')
  .option('--dry-run', 'count the approvals that would get a card, write nothing', false)
  .option('--batch <n>', 'approvals copied per request (at most 40)', (v) => parseInt(v, 10), 20)
  .option('--confirm', 'required for any non-localhost --api-base (production write gate)', false)
  .action(async (opts: { apiBase: string; token?: string; dryRun: boolean; batch: number; confirm: boolean }) => {
    const token = opts.token ?? process.env.ADMIN_TOKEN;
    if (!token) {
      console.error('No admin token: pass --token or set ADMIN_TOKEN.');
      process.exit(1);
    }
    const apiBase = opts.apiBase.replace(/\/+$/, '');
    const host = new URL(apiBase).hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && !opts.confirm && !opts.dryRun) {
      console.error(`Refusing to write to a non-local API (${host}) without --confirm. Use --dry-run to preview.`);
      process.exit(1);
    }

    let after = '';
    let copied = 0;
    let alreadyCopied = 0;
    let repaired = 0;
    for (;;) {
      const res = await fetch(`${apiBase}/admin/approval-cards?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ after, limit: opts.batch, dryRun: opts.dryRun }),
      });
      if (!res.ok) {
        console.error(`The API answered ${res.status}: ${await res.text()}`);
        process.exit(1);
      }
      const batch = (await res.json()) as Batch;
      copied += batch.copied;
      alreadyCopied += batch.alreadyCopied;
      repaired += batch.repaired;
      console.log(`… up to ${batch.after || '(start)'}: ${batch.copied} ${opts.dryRun ? 'to copy' : 'copied'}`);
      if (batch.done) break;
      if (batch.after <= after) {
        console.error(`The API didn't move past ${after || '(start)'}; stopping rather than repeating it.`);
        process.exit(1);
      }
      after = batch.after;
    }
    console.log(
      `${opts.dryRun ? 'Would copy' : 'Copied'} ${copied} card${copied === 1 ? '' : 's'}; ${alreadyCopied} already had one` +
        `${repaired ? `, ${repaired} of whose Explore entries ${opts.dryRun ? 'would be' : 'were'} given it` : ''}.`,
    );
  });

program.parse();
