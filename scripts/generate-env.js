const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

writeFileSync(join(__dirname, '..', 'dist', 'env-config.js'), 'window.__ENV__ = {};\n');
