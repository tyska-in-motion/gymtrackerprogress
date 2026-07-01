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
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
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
  return `window.__ENV__ = { storage: ${JSON.stringify(databaseUrl ? 'postgresql' : 'json-file')} };\n`;
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

const fileStore = {
  async readUsers() {
    ensureDataFile();
    return JSON.parse(readFileSync(dataFile, 'utf8'));
  },
  async writeUsers(users) {
    ensureDataFile();
    writeFileSync(dataFile, `${JSON.stringify(users, null, 2)}\n`);
  },
  async readAccounts() {
    ensureDataFile();
    const accounts = JSON.parse(readFileSync(accountsFile, 'utf8'));
    return Array.isArray(accounts) ? accounts : [];
  },
  async writeAccounts(accounts) {
    ensureDataFile();
    writeFileSync(accountsFile, `${JSON.stringify(accounts, null, 2)}\n`);
  },
  async readCatalog() {
    ensureDataFile();
    const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
    return Array.isArray(catalog) ? catalog : defaultCatalog;
  },
  async writeCatalog(catalog) {
    ensureDataFile();
    writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);
  },
};

const { Client } = databaseUrl ? require('pg') : { Client: null };
const pgClient = databaseUrl ? new Client({ connectionString: databaseUrl, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false } }) : null;
let pgReady;

function normalizeUserData(value) {
  const body = value && typeof value === 'object' ? value : {};
  return {
    workouts: Array.isArray(body.workouts) ? body.workouts : [],
    plans: body.plans && typeof body.plans === 'object' && !Array.isArray(body.plans) ? body.plans : {},
    draft: Array.isArray(body.draft) ? body.draft : [],
    templates: Array.isArray(body.templates) ? body.templates : [],
  };
}

async function initPostgres() {
  if (!pgClient) return;
  await pgClient.connect();
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS user_data (
      uid TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{"workouts":[],"plans":{},"draft":[],"templates":[]}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS catalog_exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS catalog_exercises_name_category_idx
      ON catalog_exercises (lower(name), lower(category));
  `);

  for (const exercise of defaultCatalog) {
    await pgClient.query(
      'INSERT INTO catalog_exercises (id, name, category) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [exercise.id, exercise.name, exercise.category],
    );
  }
}

async function ensurePostgres() {
  if (!pgReady) pgReady = initPostgres();
  await pgReady;
}

const postgresStore = {
  async readUsers() {
    await ensurePostgres();
    const result = await pgClient.query('SELECT uid, data FROM user_data ORDER BY uid');
    return Object.fromEntries(result.rows.map((row) => [row.uid, normalizeUserData(row.data)]));
  },
  async writeUsers(users) {
    await ensurePostgres();
    await pgClient.query('BEGIN');
    try {
      for (const [uid, value] of Object.entries(users)) {
        await pgClient.query(
          `INSERT INTO user_data (uid, data, updated_at)
           VALUES ($1, $2::jsonb, now())
           ON CONFLICT (uid) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [uid, JSON.stringify(normalizeUserData(value))],
        );
      }
      await pgClient.query('COMMIT');
    } catch (error) {
      await pgClient.query('ROLLBACK');
      throw error;
    }
  },
  async readAccounts() {
    await ensurePostgres();
    const result = await pgClient.query('SELECT id, name FROM accounts ORDER BY created_at, name');
    return result.rows;
  },
  async writeAccounts(accounts) {
    await ensurePostgres();
    for (const account of accounts) {
      await pgClient.query(
        'INSERT INTO accounts (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
        [account.id, account.name],
      );
      await pgClient.query(
        `INSERT INTO user_data (uid, data) VALUES ($1, $2::jsonb) ON CONFLICT (uid) DO NOTHING`,
        [account.id, JSON.stringify(emptyUserData())],
      );
    }
  },
  async readCatalog() {
    await ensurePostgres();
    const result = await pgClient.query('SELECT id, name, category FROM catalog_exercises ORDER BY category, name');
    return result.rows.length ? result.rows : defaultCatalog;
  },
  async writeCatalog(catalog) {
    await ensurePostgres();
    await pgClient.query('BEGIN');
    try {
      await pgClient.query('DELETE FROM catalog_exercises');
      for (const exercise of catalog) {
        await pgClient.query(
          'INSERT INTO catalog_exercises (id, name, category) VALUES ($1, $2, $3)',
          [exercise.id, exercise.name, exercise.category],
        );
      }
      await pgClient.query('COMMIT');
    } catch (error) {
      await pgClient.query('ROLLBACK');
      throw error;
    }
  },
};

const store = pgClient ? postgresStore : fileStore;

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
      sendJson(res, 200, { accounts: await store.readAccounts() });
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

        const accounts = await store.readAccounts();
        const existing = accounts.find((account) => account.id === id);

        if (!existing) {
          accounts.push({ id, name });
          await store.writeAccounts(accounts);
        }

        sendJson(res, existing ? 200 : 201, { account: existing || { id, name }, accounts: await store.readAccounts() });
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
      sendJson(res, 200, { catalog: await store.readCatalog() });
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

        const catalog = await store.readCatalog();
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
        await store.writeCatalog(catalog);
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
      const catalog = await store.readCatalog();
      const nextCatalog = catalog.filter((exercise) => exercise.id !== id);

      if (nextCatalog.length === catalog.length) {
        sendJson(res, 404, { error: 'Nie znaleziono ćwiczenia.' });
        return;
      }

      await store.writeCatalog(nextCatalog);
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
    const users = await store.readUsers();
    sendJson(res, 200, { uid: user.uid, data: users[user.uid] || emptyUserData() });
    return;
  }

  if (req.method === 'PUT') {
    try {
      const body = JSON.parse(await readRequestBody(req));
      const users = await store.readUsers();
      users[user.uid] = {
        workouts: Array.isArray(body.workouts) ? body.workouts : [],
        plans: body.plans && typeof body.plans === 'object' && !Array.isArray(body.plans) ? body.plans : {},
        draft: Array.isArray(body.draft) ? body.draft : [],
        templates: Array.isArray(body.templates) ? body.templates : [],
      };
      await store.writeUsers(users);
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
    handleApi(req, res).catch((error) => {
      console.error(error);
      sendJson(res, 500, { error: 'Internal Server Error' });
    });
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
