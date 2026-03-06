import { Command } from 'commander';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

const program = new Command();
program
  .name('serve-bbwp')
  .description('Serve project root for manual BBWP testing')
  .option('-p, --port <number>', 'Port to listen on', '3001')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error('Error: port must be a number between 1 and 65535');
      process.exit(1);
    }

    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);
      let filePath = join(PROJECT_ROOT, url.pathname);

      // Serve index.html for directory requests
      if (filePath.endsWith('/')) {
        filePath += 'index.html';
      }

      if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      try {
        const content = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`BBWP server running at http://localhost:${port}`);
      console.log(`Open http://localhost:${port}/playground/bbwp.html`);
      console.log('Press Ctrl+C to stop');
    });
  });

program.parse();
