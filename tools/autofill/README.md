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
4. Resume row: **Download** saves the PDF the extension attaches; **Replace…** swaps in another PDF (max 5 MB,
   sent under its own file name) and keeps your answers. Importing a kit again brings back the kit's resume.
5. Transcript row: the same, for upload fields that ask for a transcript. The kit carries the one uploaded on
   Profile in Resume Studio; one added here is sent as `First_Last_Transcript.pdf`.

## What the filler does

- Matches each field's question to your answers: your own "Other questions" first, then the standard
  fields. Work authorization questions use the row for the country they name, else "Any other country".
- Fills text fields, dropdowns, radio buttons and searchable dropdowns; attaches the resume to the resume
  upload field. Never overwrites what's already filled.
- Leaves for you: free-text questions, consent checkboxes, questions it doesn't know, other uploads.
- Workday's **My Experience** page: deletes the work experience entries Workday parsed from your resume and adds
  your jobs from the kit (title, company, location, "I currently work here", from/to month and year, bullets as
  the description). Run it again and it leaves matching entries alone. The extension's checkbox (or
  `fill(kit, { keepExperience: true })`) keeps Workday's entries instead. The jobs come from the kit's resume
  version, so download a new kit after editing them; Profile lists what goes in and flags dates it can't read.
- Other sites, best effort: finds job entries (a job title and a company field together, with dates or a
  description, and no email/phone, so references aren't taken for jobs), fills the blank ones with your jobs in
  order and clicks the form's "Add" for more. Skips jobs already on the form; never changes a filled entry.
  Date fields get month/year selects, `type=month`, or the format their placeholder asks for. "Current company"
  and "Current title" questions get your latest job. What it can't place is outlined amber.
- Doesn't click Submit. Multi-page forms (Workday): fill each page.

Tests: `npx vitest run tools/autofill` from the repo root.

Avoid using these on LinkedIn Easy Apply or Indeed Apply: their terms forbid automated applying.

## Fetching postings

The extension also fetches job postings for Resume Studio, so there's nothing to paste. **Track** on a
lead opens the new application and fetches the posting from the lead's address; for any other
application, the editor shows **Fetch from the posting address**. A browser page can't read other sites,
so `bridge.js` (which runs only on Resume Studio) passes the request to `background.js`, which fetches the
page signed out and sends its HTML back. LinkedIn jobs are read from their public guest page. When a site
only shows the posting once its JavaScript runs, the editor says so and pasting works as before.
Reload the extension in `chrome://extensions` after updating it.
