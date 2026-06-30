const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const keys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

const config = Object.fromEntries(keys.map((key) => [key, process.env[key] || '']));
const output = `window.__ENV__ = ${JSON.stringify(config, null, 2)};\n`;

writeFileSync(join(__dirname, '..', 'dist', 'env-config.js'), output);
