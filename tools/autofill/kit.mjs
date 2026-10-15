#!/usr/bin/env node
// Reads your apply kit (newest ~/Downloads/apply-kit*.json, or --kit <path>) for the Claude-driven apply flow.
//
//   node kit.mjs info           version, date and file name of the kit
//   node kit.mjs answers        the kit without the PDF, as one line of JSON (small enough to pass to fill.js)
//   node kit.mjs pdf <out.pdf>  writes the resume PDF

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

process.on('uncaughtException', (e) => {
  console.error(e.message || e);
  process.exit(1);
});

const a = process.argv.slice(2);
const k = a.indexOf('--kit');
const explicit = k >= 0 ? a.splice(k, 2)[1] : undefined;

function newestKit() {
  const dir = join(homedir(), 'Downloads');
  const kits = readdirSync(dir)
    .filter((f) => /^apply-kit.*\.json$/.test(f))
    .map((f) => ({ f: join(dir, f), t: statSync(join(dir, f)).mtimeMs }))
    .sort((x, y) => y.t - x.t);
  if (!kits.length) throw new Error('No apply-kit.json in ~/Downloads. Download one from Profile in Resume Studio.');
  return kits[0].f;
}

const path = explicit ?? newestKit();
const kit = JSON.parse(readFileSync(path, 'utf8'));
if (kit.kind !== 'resume-studio-apply-kit') throw new Error(`${path} isn't an apply kit.`);

switch (a[0]) {
  case 'info':
    console.log(`${path}\nresume "${kit.resume.versionName}" (${kit.resume.fileName}), kit from ${new Date(kit.createdAt).toLocaleString()}`);
    break;
  case 'answers':
    console.log(JSON.stringify({ ...kit, resume: { ...kit.resume, pdfBase64: '' } }));
    break;
  case 'pdf':
    if (!a[1]) throw new Error('Usage: node kit.mjs pdf <out.pdf>');
    writeFileSync(a[1], Buffer.from(kit.resume.pdfBase64, 'base64'));
    console.log(a[1]);
    break;
  default:
    console.error('Usage: node kit.mjs info | answers | pdf <out.pdf>  [--kit path]');
    process.exit(1);
}
