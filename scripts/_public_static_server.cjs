const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'public');
const port = Number(process.env.PORT || 4189);
const host = process.env.HOST || '127.0.0.1';

function contentType(fp) {
  const ext = path.extname(fp).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = (req.url || '/').split('?')[0];
    if (urlPath === '/' || urlPath === '') urlPath = '/__svg_external_test.html';
    urlPath = decodeURIComponent(urlPath);

    // Normalize and prevent path traversal
    const rel = urlPath.replace(/^\/+/, '');
    const fp = path.resolve(root, rel);
    if (!fp.startsWith(root)) {
      res.statusCode = 403;
      return res.end('forbidden');
    }

    fs.readFile(fp, (err, buf) => {
      if (err) {
        res.statusCode = 404;
        return res.end('not found');
      }
      res.setHeader('Content-Type', contentType(fp));
      res.end(buf);
    });
  } catch (e) {
    res.statusCode = 500;
    res.end('error');
  }
});

server.listen(port, host, () => {
  console.log(`serving http://${host}:${port}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
