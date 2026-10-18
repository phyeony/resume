#!/usr/bin/env node
// Opens a job application in a browser window, fills it from your apply kit, and submits only when you type "s".
//
//   node apply.mjs <job url> [--kit path/to/apply-kit.json]
//
// The kit defaults to the newest apply-kit*.json in ~/Downloads (Profile → Download apply kit in Resume Studio).
// The browser keeps its own profile in ~/.resume-studio/browser, so sign-ins (e.g. Workday) are remembered.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const FILL = readFileSync(join(here, 'extension', 'fill.js'), 'utf8');
const PROFILE = join(homedir(), '.resume-studio', 'browser');

function args() {
  const a = process.argv.slice(2);
  const k = a.indexOf('--kit');
  const kit = k >= 0 ? a.splice(k, 2)[1] : undefined;
  if (!a[0] || !/^https?:\/\//.test(a[0])) {
    console.error('Usage: node apply.mjs <job url> [--kit path/to/apply-kit.json]');
    process.exit(1);
  }
  return { url: a[0], kitPath: kit };
}

function newestKit() {
  const dir = join(homedir(), 'Downloads');
  const kits = readdirSync(dir)
    .filter((f) => /^apply-kit.*\.json$/.test(f))
    .map((f) => ({ f: join(dir, f), t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!kits.length) throw new Error('No apply-kit.json in ~/Downloads. Download one from Profile in Resume Studio, or pass --kit.');
  return kits[0].f;
}

function loadKit(path) {
  const kit = JSON.parse(readFileSync(path, 'utf8'));
  if (kit.kind !== 'resume-studio-apply-kit') throw new Error(`${path} isn't an apply kit.`);
  return kit;
}

/** Fills every frame (some sites embed the form in an iframe); returns the reports of frames that had fields. */
async function fillAll(page, kit) {
  const reports = [];
  for (const frame of page.frames()) {
    try {
      await frame.evaluate(FILL);
      const r = await frame.evaluate((k) => window.__resumeStudio.fill(k), kit);
      if (r.filled.length || r.left.length || r.already) reports.push({ frame, ...r });
    } catch {
      // detached or cross-origin frame we can't reach; skip it
    }
  }
  return reports;
}

/** On a posting page, the form often sits behind an "Apply" button. Opening it is not submitting. */
async function openForm(page) {
  const apply = page.getByRole('link', { name: /^\s*apply( for this job| now| to this job)?\s*$/i })
    .or(page.getByRole('button', { name: /^\s*apply( for this job| now| to this job)?\s*$/i }))
    .first();
  if (!(await apply.count())) return false;
  await apply.click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  return true;
}

function print(reports) {
  if (!reports.length) {
    console.log('\nNo form fields found. Open the application form in the window, then choose [r]efill.');
    return;
  }
  for (const r of reports) {
    console.log(`\n── ${new URL(r.url).host}`);
    console.log(`Filled ${r.filled.length}:`);
    for (const f of r.filled) console.log(`  ✓ ${f.question} → ${f.answer}`);
    console.log(`Left for you ${r.left.length}:`);
    for (const f of r.left) console.log(`  ${f.required ? '!' : '·'} ${f.question || '(unlabelled)'} (${f.why})`);
    console.log(`Resume: ${r.resume}${r.transcript !== 'no upload field' ? ` · Transcript: ${r.transcript}` : ''}${r.already ? ` · ${r.already} already filled` : ''}`);
    console.log(`Submit button: ${r.submit ?? 'not found'}`);
  }
  if (reports.some((r) => r.left.some((f) => f.required))) console.log('\n! = required: fill these in the window before submitting.');
}

async function launch() {
  const opts = { headless: false, viewport: null };
  try {
    return await chromium.launchPersistentContext(PROFILE, { ...opts, channel: 'chrome' });
  } catch {
    // No Chrome installed: Playwright's own Chromium (npx playwright install chromium)
    return chromium.launchPersistentContext(PROFILE, opts);
  }
}

async function main() {
  const { url, kitPath } = args();
  const path = kitPath ?? newestKit();
  const kit = loadKit(path);
  console.log(`Kit: ${path} (resume "${kit.resume.versionName}", ${new Date(kit.createdAt).toLocaleString()})`);

  const ctx = await launch();
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  let reports = await fillAll(page, kit);
  if (!reports.length && (await openForm(page))) reports = await fillAll(page, kit);
  print(reports);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let submitted = false;
  for (;;) {
    const ans = (await rl.question('\nCheck the window and finish what\'s left. [s]ubmit · [r]efill (e.g. next page) · [q]uit without submitting: ')).trim().toLowerCase();
    if (ans === 'q') break;
    if (ans === 'r') {
      reports = await fillAll(page, kit);
      print(reports);
      continue;
    }
    if (ans !== 's') continue;
    // The frame with the form: the one we filled most in, else any frame with a submit button.
    const frames = [...reports].sort((a, b) => b.filled.length - a.filled.length).map((r) => r.frame).concat(page.frames());
    for (const frame of frames) {
      const clicked = await frame
        .evaluate(() => {
          const b = window.__resumeStudio?.findSubmit();
          if (!b) return false;
          b.click();
          return true;
        })
        .catch(() => false);
      if (clicked) {
        submitted = true;
        break;
      }
    }
    if (!submitted) {
      console.log("Couldn't find the submit button. Click it in the window yourself, then [q]uit.");
      continue;
    }
    await page.waitForTimeout(4000);
    console.log(`\nClicked submit. Now on: ${await page.title()} (${page.url()})`);
    console.log('Check the window for a confirmation or for errors (missing fields, CAPTCHA). Fix and [s]ubmit again if needed.');
    const more = (await rl.question('Done? [y] / [s]ubmit again: ')).trim().toLowerCase();
    if (more === 's') {
      submitted = false;
      continue;
    }
    break;
  }
  rl.close();
  if (submitted) console.log('\nRemember: press "Applied" on this lead in Resume Studio.');
  await ctx.close();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
