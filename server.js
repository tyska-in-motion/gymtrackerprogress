const http = require('node:http');
const { createReadStream, existsSync, statSync } = require('node:fs');
const { extname, join, normalize } = require('node:path');

const publicDir = join(__dirname, 'dist');
const port = Number(process.env.PORT) || 3000;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function resolveFilePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0]);
  const safePath = normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const requestedPath = join(publicDir, safePath);

  if (existsSync(requestedPath) && statSync(requestedPath).isFile()) {
    return requestedPath;
  }

  return join(publicDir, 'index.html');
}

function firebaseEnvScript() {
  const keys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
  ];
  const config = Object.fromEntries(keys.map((key) => [key, process.env[key] || '']));

  return `window.__ENV__ = ${JSON.stringify(config)};\n`;
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath === '/env-config.js') {
      res.setHeader('Content-Type', contentTypes['.js']);
      res.end(firebaseEnvScript());
      return;
    }

    const filePath = resolveFilePath(req.url || '/');
    const stream = createReadStream(filePath);

    res.setHeader('Content-Type', contentTypes[extname(filePath)] || 'application/octet-stream');
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });
  } catch (error) {
    res.writeHead(400);
    res.end('Bad Request');
  }
});

server.listen(port, () => {
  console.log(`Gym Tracker Progress is running on port ${port}`);
});
