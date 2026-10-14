# Applications tracker — design

Agreed with the owner 2026-10-14.

## Goal

Track every job application in Resume Studio: which posting, which resume was sent (company link or
version), and how far it has progressed. Keep an exact, permanent copy of the posting, because companies
often take postings down once interviews start, plus a short summary (salary, location, what you'd do,
requirements).

## Scope (v1)

- New editor section **Applications** (owner-only, like versions and links).
- Capture a posting by pasting: copy the whole job page (⌘A ⌘C) or its page source, paste into the editor.
  The editor extracts the posting and pre-fills the fields; the owner reviews and saves.
- Summary fields are filled by rules (pattern matching), not AI.

Out of scope for now, but the design leaves room for it:
- **AI summaries.** Summary filling sits behind one function (`Summarizer`); each application records
  which one filled it (`summary.filledBy`, e.g. `rules`, later `ai:<model>`).
- **Fetching from a URL.** Greenhouse, Lever, Ashby and SmartRecruiters have public CORS-enabled APIs; a
  later "Import" button can feed their HTML into the same capture pipeline. A bookmarklet could also do
  the copy step in one click.

## Data

- `applications/{id}` — company, role, posting URL, stage history, linked company link (`linkSlug`) or
  version (`versionId`, when a file was sent instead), notes, summary.
- `postings/{id}` (same id) — the captured posting: sanitized HTML, plain text, capture time, how it was
  captured. Kept apart so the list stays light; written once, replaced only on an explicit re-capture.
- Firestore rules: both owner-only.

Stages: `saved → applied → screening → interviewing → offer`, plus `rejected`, `withdrawn`, `ghosted`.
History is a dated list of `{stage, at, note?}`; the current stage is the latest entry.

## Capture pipeline (`src/applications/`)

1. **Parse** pasted HTML with `DOMParser` (inert: no scripts run). Plain text pastes are turned into
   paragraphs/lists; pasted page source is recognised as HTML.
2. **Structured data first.** If the HTML holds a schema.org `JobPosting` (JSON-LD), its description is
   the posting, and title, company, location, remote flag and salary come from it.
3. **Otherwise find the posting block.** Drop scripts, styles, nav, header, footer, aside, forms, buttons,
   dialogs and elements whose class/id names cookie banners, sharing, similar jobs. Check known containers
   (LinkedIn, Workday, Greenhouse, Lever, Indeed). Else score every block: text not in links minus a
   penalty for link text; take the highest, preferring the deepest element whose score is within a few
   percent of the best. The next-best blocks are offered as "Choose another".
4. **Sanitize** to an allowlist (headings, p, lists, bold/italic, br, http(s) links); all attributes
   except `href` are removed. Words are never changed.
5. **Summarize (rules):** salary ranges via regex (currency, `k`, ranges, `/hr`/`/year`), location and
   work mode, sections by heading word lists (what you'd do / requirements / nice to have / benefits),
   company and role from JSON-LD, page title, first heading or the URL host (Greenhouse, Lever, Ashby,
   Workday, SmartRecruiters paths).

Everything pre-filled is editable before saving; the captured posting is read-only.

## UI

- `/admin/applications` — list with stage filter; shows role, company, stage, applied date, salary,
  location, the company link's views, and "no update in N days" for waiting stages.
- `/admin/applications/new` and `/admin/applications/:id` — one editor: paste zone (when nothing is
  captured yet), posting preview with block chooser, fields, stage timeline, resume sent (pick a link,
  create one for this company, or pick a version), notes, delete.
- Links page cards show the application a link belongs to.

## Testing

Unit tests (vitest + happy-dom) for salary parsing, summary rules, block finding, JSON-LD and
sanitizing. The local preview (`npm run local`) stores applications in localStorage like everything else.
