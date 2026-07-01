const http = require('node:http');
const { createHash } = require('node:crypto');
const { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { extname, join, normalize } = require('node:path');

const publicDir = join(__dirname, 'dist');
const dataDir = join(__dirname, 'data');
const dataFile = join(dataDir, 'users.json');
const accountsFile = join(dataDir, 'accounts.json');
const catalogFile = join(dataDir, 'catalog.json');
const port = Number(process.env.PORT) || 3000;
const accessPassword = process.env.GYM_ACCESS_PASSWORD || process.env.ACCESS_PASSWORD || process.env.APP_PASSWORD || '';
const defaultCatalog = [
  { id: 'bench-press', name: 'Bench Press', category: 'Klatka piersiowa' },
  { id: 'squat', name: 'Squat', category: 'Nogi' },
  { id: 'deadlift', name: 'Deadlift', category: 'Plecy' },
  { id: 'cable-row', name: 'Cable Row', category: 'Plecy' },
  { id: 'push-up', name: 'Push-up', category: 'Klatka piersiowa' },
  { id: 'dumbbell-fly', name: 'Dumbbell Fly', category: 'Klatka piersiowa' },
  { id: 'hip-thrust', name: 'Hip Thrust', category: 'Pośladki' },
  { id: 'shoulder-press', name: 'Shoulder Press', category: 'Barki' },
];

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

function envScript() {
  return 'window.__ENV__ = {};\n';
}

function authToken() {
  return accessPassword ? createHash('sha256').update(`gym-progress:${accessPassword}`).digest('hex') : '';
}

function isAuthorized(req) {
  const token = authToken();
  return !!token && String(req.headers.cookie || '').split(';').some((part) => part.trim() === `gym_auth=${token}`);
}

function requireAuth(req, res) {
  if (!accessPassword) {
    sendJson(res, 500, { error: 'Hasło dostępu nie jest skonfigurowane na serwerze.' });
    return false;
  }

  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: 'Wpisz hasło dostępu, aby kontynuować.' });
    return false;
  }

  return true;
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

function identifyUser(req, res) {
  const uid = String(req.headers['x-user-id'] || '').trim();

  if (!uid || !/^[a-zA-Z0-9_-]{3,80}$/.test(uid)) {
    sendJson(res, 400, { error: 'Missing or invalid X-User-Id header' });
    return null;
  }

  return { uid };
}

function ensureDataFile() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dataFile)) writeFileSync(dataFile, '{}\n');
  if (!existsSync(accountsFile)) writeFileSync(accountsFile, '[]\n');
  if (!existsSync(catalogFile)) writeFileSync(catalogFile, `${JSON.stringify(defaultCatalog, null, 2)}\n`);
}

function readUsers() {
  ensureDataFile();
  return JSON.parse(readFileSync(dataFile, 'utf8'));
}

function writeUsers(users) {
  ensureDataFile();
  writeFileSync(dataFile, `${JSON.stringify(users, null, 2)}\n`);
}

function readAccounts() {
  ensureDataFile();
  const accounts = JSON.parse(readFileSync(accountsFile, 'utf8'));
  return Array.isArray(accounts) ? accounts : [];
}

function writeAccounts(accounts) {
  ensureDataFile();
  writeFileSync(accountsFile, `${JSON.stringify(accounts, null, 2)}\n`);
}

function readCatalog() {
  ensureDataFile();
  const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
  return Array.isArray(catalog) ? catalog : defaultCatalog;
}

function writeCatalog(catalog) {
  ensureDataFile();
  writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);
}

function slug(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'cwiczenie';
}

function emptyUserData() {
  return { workouts: [], plans: {}, draft: [], templates: [] };
}

async function handleApi(req, res) {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/api/auth') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    try {
      const body = JSON.parse(await readRequestBody(req));
      const password = String(body.password || '');

      if (!accessPassword) {
        sendJson(res, 500, { error: 'Hasło dostępu nie jest skonfigurowane na serwerze.' });
        return;
      }

      if (password !== accessPassword) {
        sendJson(res, 401, { error: 'Nieprawidłowe hasło.' });
        return;
      }

      res.setHeader('Set-Cookie', `gym_auth=${authToken()}; Path=/; HttpOnly; SameSite=Lax`);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: 'Invalid JSON payload' });
    }
    return;
  }


  if (urlPath === '/api/accounts') {
    if (req.method === 'GET') {
      sendJson(res, 200, { accounts: readAccounts() });
      return;
    }

    if (req.method === 'POST') {
      if (!requireAuth(req, res)) return;

      try {
        const body = JSON.parse(await readRequestBody(req));
        const id = String(body.id || '').trim();
        const name = String(body.name || '').trim();

        if (!/^[a-zA-Z0-9_-]{3,80}$/.test(id) || name.length < 1 || name.length > 80) {
          sendJson(res, 400, { error: 'Nieprawidłowe dane konta.' });
          return;
        }

        const accounts = readAccounts();
        const existing = accounts.find((account) => account.id === id);

        if (!existing) {
          accounts.push({ id, name });
          writeAccounts(accounts);
        }

        sendJson(res, existing ? 200 : 201, { account: existing || { id, name }, accounts: readAccounts() });
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid JSON payload' });
      }
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (urlPath === '/api/catalog') {
    if (req.method === 'GET') {
      sendJson(res, 200, { catalog: readCatalog() });
      return;
    }

    if (req.method === 'POST') {
      if (!requireAuth(req, res)) return;

      try {
        const body = JSON.parse(await readRequestBody(req));
        const name = String(body.name || '').trim();
        const category = String(body.category || '').trim();

        if (name.length < 2 || category.length < 2) {
          sendJson(res, 400, { error: 'Podaj nazwę ćwiczenia i kategorię.' });
          return;
        }

        const catalog = readCatalog();
        const existing = catalog.find(
          (exercise) => exercise.name.toLowerCase() === name.toLowerCase()
            && exercise.category.toLowerCase() === category.toLowerCase(),
        );

        if (existing) {
          sendJson(res, 200, { exercise: existing, catalog });
          return;
        }

        const baseId = slug(`${name}-${category}`);
        let id = baseId;
        let counter = 2;
        while (catalog.some((exercise) => exercise.id === id)) {
          id = `${baseId}-${counter}`;
          counter += 1;
        }

        const exercise = { id, name, category };
        catalog.push(exercise);
        writeCatalog(catalog);
        sendJson(res, 201, { exercise, catalog });
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid JSON payload' });
      }
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (urlPath.startsWith('/api/catalog/')) {
    if (req.method === 'DELETE') {
      if (!requireAuth(req, res)) return;

      const id = decodeURIComponent(urlPath.replace('/api/catalog/', '')).trim();
      const catalog = readCatalog();
      const nextCatalog = catalog.filter((exercise) => exercise.id !== id);

      if (nextCatalog.length === catalog.length) {
        sendJson(res, 404, { error: 'Nie znaleziono ćwiczenia.' });
        return;
      }

      writeCatalog(nextCatalog);
      sendJson(res, 200, { catalog: nextCatalog });
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!requireAuth(req, res)) return;

  const user = identifyUser(req, res);
  if (!user) return;

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
        templates: Array.isArray(body.templates) ? body.templates : [],
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
      res.end(envScript());
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
