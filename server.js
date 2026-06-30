const http = require('node:http');
const { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { extname, join, normalize } = require('node:path');
const admin = require('firebase-admin');

const publicDir = join(__dirname, 'dist');
const dataDir = join(__dirname, 'data');
const dataFile = join(dataDir, 'users.json');
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

function firebaseCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    return admin.credential.cert(JSON.parse(json));
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }

  return admin.credential.applicationDefault();
}

function initializeFirebaseAdmin() {
  if (admin.apps.length) return true;
  admin.initializeApp({ credential: firebaseCredential() });
  return true;
}

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

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': contentTypes['.json'] });
  res.end(JSON.stringify(body));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function authenticate(req, res) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);

  if (!match) {
    sendJson(res, 401, { error: 'Missing Firebase ID token' });
    return null;
  }

  try {
    initializeFirebaseAdmin();
    const decodedToken = await admin.auth().verifyIdToken(match[1]);
    return { uid: decodedToken.uid, email: decodedToken.email || '', name: decodedToken.name || '' };
  } catch (error) {
    sendJson(res, 401, { error: 'Invalid Firebase ID token' });
    return null;
  }
}

function ensureDataFile() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dataFile)) writeFileSync(dataFile, '{}\n');
}

function readUsers() {
  ensureDataFile();
  return JSON.parse(readFileSync(dataFile, 'utf8'));
}

function writeUsers(users) {
  ensureDataFile();
  writeFileSync(dataFile, `${JSON.stringify(users, null, 2)}\n`);
}

function emptyUserData() {
  return { workouts: [], plans: {}, draft: [] };
}

async function handleApi(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath !== '/api/data') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  if (req.method === 'GET') {
    const users = readUsers();
    sendJson(res, 200, { uid: user.uid, data: users[user.uid] || emptyUserData() });
    return;
  }

  if (req.method === 'PUT') {
    try {
      const body = JSON.parse(await readRequestBody(req));
      const users = readUsers();
      users[user.uid] = {
        workouts: Array.isArray(body.workouts) ? body.workouts : [],
        plans: body.plans && typeof body.plans === 'object' && !Array.isArray(body.plans) ? body.plans : {},
        draft: Array.isArray(body.draft) ? body.draft : [],
      };
      writeUsers(users);
      sendJson(res, 200, { uid: user.uid, data: users[user.uid] });
    } catch (error) {
      sendJson(res, 400, { error: 'Invalid JSON payload' });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }

  try {
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
