# Autofill

Fills job application forms from your **apply kit** (Resume Studio → Profile → Application answers →
**Download apply kit**). Three ways to run the same filler (`extension/fill.js`); none of them submits
without you:

| | How | Who submits |
|---|---|---|
| Claude | Ask Claude Code to apply to a lead (`.claude/skills/apply`) | Claude, after you reply "submit" |
| Script | `node apply.mjs <job url>` | The script, after you type `s` |
| Extension | Popup → **Fill this page** | You |

After submitting, press **Applied** on the lead in Resume Studio.

The kit (`apply-kit.json`) holds your answers and resume PDF. It is git-ignored; don't commit or share it.
Download a new one after changing answers or to send a different resume version.

## Script

```sh
cd tools/autofill
npm install
node apply.mjs https://boards.greenhouse.io/acme/jobs/123
```

Uses the newest `~/Downloads/apply-kit*.json` (or `--kit <path>`). Opens Chrome with its own profile in
`~/.resume-studio/browser`, so your usual Chrome can stay open and sign-ins you make there are remembered.
Then: `s` submit, `r` fill again (next page of a multi-page form), `q` quit without submitting.

## Extension

1. Chrome → `chrome://extensions` → turn on Developer mode → **Load unpacked** → pick `tools/autofill/extension`.
2. Popup → **Import apply kit…** → the kit file (once per kit).
3. On an application form: popup → **Fill this page**. Green = filled, amber = left for you.

## What the filler does

- Matches each field's question to your answers: your own "Other questions" first, then the standard
  fields. Work authorization questions use the row for the country they name, else "Any other country".
- Fills text fields, dropdowns, radio buttons and searchable dropdowns; attaches the resume to the resume
  upload field. Never overwrites what's already filled.
- Leaves for you: free-text questions, consent checkboxes, questions it doesn't know, other uploads.
- Doesn't click Submit. Multi-page forms (Workday): fill each page.

Tests: `npx vitest run tools/autofill` from the repo root.

Avoid using these on LinkedIn Easy Apply or Indeed Apply: their terms forbid automated applying.
