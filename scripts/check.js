const fs = require('node:fs');
const path = require('node:path');

const required = [
  'src/server/index.js',
  'src/desktop/main.js',
  'src/desktop/preload.js',
  'src/desktop/input-controller.js',
  'src/desktop/renderer/index.html',
  'src/desktop/renderer/styles.css',
  'src/desktop/renderer/app.js'
];

let ok = true;
for (const file of required) {
  const absolute = path.join(process.cwd(), file);
  if (!fs.existsSync(absolute)) {
    console.error(`Missing ${file}`);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log('Project structure looks good.');
