import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

// After the cutover, admin endpoints are served by the pathogen-api Worker
// (api/), not the Pages project. The token must be set as a secret on the
// Worker — Pages no longer reads ADMIN_TOKEN.
const ADMIN_PATH = '/pathogen/admin/thumbnails';
const SITE_ORIGIN = 'https://pathogen.studio';
const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, '..', 'api');

const program = new Command();
program
  .name('rotate-admin-token')
  .description('Generate and set a new ADMIN_TOKEN secret on the pathogen-api Worker')
  .action(() => {
    const token = randomBytes(36).toString('base64url');

    console.log('Setting ADMIN_TOKEN on pathogen-api Worker...\n');

    try {
      execSync(`printf '%s' "${token}" | npx wrangler secret put ADMIN_TOKEN`, {
        cwd: API_DIR,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
    } catch {
      console.error('\nFailed to set secret. Is wrangler authenticated and api/ deployed?');
      process.exit(1);
    }

    console.log('\nRedeploying API Worker to pick up new secret...\n');

    try {
      execSync('npx wrangler deploy', { cwd: API_DIR, stdio: 'inherit' });
    } catch {
      console.error('\nDeploy failed. The secret was set — redeploy manually with `cd api && wrangler deploy`.');
      process.exit(1);
    }

    const url = `${SITE_ORIGIN}${ADMIN_PATH}?token=${encodeURIComponent(token)}`;

    console.log('\n---');
    console.log(url);
  });
program.parse();
