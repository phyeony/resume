// Bundles the mail job into one Apps Script file: dist/Code.js (+ the manifest beside it).
//   npm run mail:build

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');
mkdirSync(out, { recursive: true });

const r = await build({
  entryPoints: [join(here, 'main.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'MailJob',
  target: 'es2019',
  write: false,
});

// Apps Script only runs top-level functions.
const entry = ['run', 'backfill', 'setup'].map((f) => `function ${f}() { MailJob.${f}(); }`).join('\n');
writeFileSync(join(out, 'Code.js'), `${r.outputFiles[0].text}\n${entry}\n`);
copyFileSync(join(here, 'appsscript.json'), join(out, 'appsscript.json'));
console.log(`Wrote ${join(out, 'Code.js')} (${Math.round(readFileSync(join(out, 'Code.js')).length / 1024)} KB)`);
