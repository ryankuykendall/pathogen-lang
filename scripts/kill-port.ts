import { execSync } from 'node:child_process';

import { Command } from 'commander';

const program = new Command();
program
  .name('kill-port')
  .description('Kill processes listening on a given port')
  .option('-p, --port <number>', 'Port number to free', '3000')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      console.error(`Invalid port: ${opts.port}`);
      process.exit(1);
    }

    // Find PIDs listening on the port
    let pids: number[];
    try {
      const output = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' }).trim();
      pids = output
        .split('\n')
        .filter(Boolean)
        .map(Number)
        .filter((n) => !Number.isNaN(n));
    } catch {
      // lsof exits non-zero when no processes found
      pids = [];
    }

    if (pids.length === 0) {
      console.log(`No process found on port ${port}`);
      return;
    }

    for (const pid of pids) {
      console.log(`Found process PID ${pid} on port ${port}`);
      try {
        process.kill(pid, 'SIGKILL');
        console.log(`Killed process PID ${pid}`);
      } catch (err: any) {
        console.error(`Failed to kill PID ${pid}: ${err.message}`);
      }
    }

    // Poll briefly to confirm port is free
    const maxWait = 2000;
    const interval = 200;
    let elapsed = 0;
    while (elapsed < maxWait) {
      await new Promise((r) => setTimeout(r, interval));
      elapsed += interval;
      try {
        const output = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' }).trim();
        if (!output) break;
      } catch {
        // lsof exits non-zero = no process = port is free
        break;
      }
    }

    if (elapsed < maxWait) {
      console.log(`Port ${port} is free`);
    } else {
      console.warn(`Port ${port} may still be in use after ${maxWait}ms`);
    }
  });
program.parse();
