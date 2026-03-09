import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import { Command } from 'commander';

const PROJECT_NAME = 'svg-path-extended';
const ADMIN_PATH = '/pathogen/admin/thumbnails';
const PRODUCTION_ORIGIN = 'https://pedestal.design';

const program = new Command();
program
  .name('rotate-admin-token')
  .description('Generate and set a new ADMIN_TOKEN for the Cloudflare Pages project')
  .action(() => {
    // Generate a URL-safe random token
    const token = randomBytes(36).toString('base64url');

    console.log('Setting ADMIN_TOKEN via wrangler...\n');

    try {
      execSync(`printf '%s' "${token}" | npx wrangler pages secret put ADMIN_TOKEN --project-name ${PROJECT_NAME}`, {
        stdio: ['pipe', 'inherit', 'inherit'],
      });
    } catch {
      console.error('\nFailed to set secret. Is wrangler authenticated?');
      process.exit(1);
    }

    console.log('\nRedeploying to pick up new secret...\n');

    try {
      execSync(`npx wrangler pages deploy public --project-name ${PROJECT_NAME}`, { stdio: 'inherit' });
    } catch {
      console.error('\nDeploy failed. The secret was set — redeploy manually or push a commit.');
      process.exit(1);
    }

    const url = `${PRODUCTION_ORIGIN}${ADMIN_PATH}?token=${encodeURIComponent(token)}`;

    console.log('\n---');
    console.log(url);
  });
program.parse();
