// Tiny static file server for reviewing the chrome-reduction prototypes.
// Usage: node _serve.js  → open http://localhost:4300/explorations/
const http = require('http');
const fs = require('fs');
const p = require('path');
const ROOT = __dirname;

http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/explorations/';
  const f = p.join(ROOT, u);
  try {
    const s = fs.statSync(f);
    if (s.isDirectory()) {
      const items = fs.readdirSync(f).sort().map(n => {
        const isDir = fs.statSync(p.join(f, n)).isDirectory();
        const slash = isDir ? '/' : '';
        return '<li><a href="' + u.replace(/\/+$/, '') + '/' + n + slash + '">' + n + slash + '</a>';
      }).join('');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<body style="font-family:system-ui;padding:24px;max-width:800px;margin:40px auto"><h1>' + u + '</h1><ul>' + items + '</ul></body>');
      return;
    }
    const ext = p.extname(f).slice(1);
    const mime = {
      html: 'text/html; charset=utf-8',
      js: 'application/javascript; charset=utf-8',
      svg: 'image/svg+xml',
      png: 'image/png',
      css: 'text/css',
      json: 'application/json',
      md: 'text/plain; charset=utf-8',
      pathogen: 'text/plain; charset=utf-8'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    res.writeHead(404);
    res.end('404 ' + u);
  }
}).listen(4300, () => console.log('Chrome-reduction prototypes on http://localhost:4300/explorations/'));
