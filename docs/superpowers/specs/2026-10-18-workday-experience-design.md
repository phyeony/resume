# Workday work experience autofill — plan

Agreed with the owner 2026-10-18, including replacing Workday's parsed entries. Goal: on Workday's **My Experience** step, the filler writes the work
experience entries itself from the resume version in the kit, instead of keeping what Workday's resume
parser guessed. Other sites come later (phase 3).

## What's there today

- `fill.js` fills one field at a time from flat answers. It has no idea of repeated entries, never touches
  a filled field (so Workday's wrong parsed entries stay), and never ticks a single checkbox.
- The kit (`ApplyKit`) carries answers and the resume **PDF only**; the experience data isn't in it.
- The data exists: the version's `snapshot` has a `work` section of `SnapshotEntry` (`title`, `org`,
  `dates`, `bullets`). Formats seen in the library: `org` is "Company" or "Company, BC";
  `dates` is free text like "November 2024 – August 2026"; bullets use `**bold**`.

## Decisions (defaults; change any)

1. **Source**: the work entries of the resume version the kit was made for, so the form matches the PDF sent.
2. **Replace, don't merge**: on Workday, delete the parsed entries and add ours. It's the one place the
   filler overwrites, it's only in the experience section, and the report lists what was removed.
   A popup toggle "Replace Workday's experience" (on by default) turns it off.
3. **Description**: bullets joined as `• line` per line, markdown stripped, cut at Workday's limit
   (check it; typically 2000 characters) at a bullet boundary.
4. **Education** gets the same treatment in phase 2 (same parser problem, same code path).

## Phase 0 — check Workday's DOM (half a day)

Save the HTML of a real My Experience page (a couple of different employers' Workday tenants) as test
fixtures, and confirm in the console:

- Section and buttons: `[data-automation-id="workExperienceSection"]`, its **Add** / **Add Another**
  button, and each entry's delete button (`panel-set-delete-button`).
- Fields per entry (`formField-jobTitle`, `formField-companyName`, `formField-location`,
  `formField-currentlyWorkHere`, `formField-startDate`, `formField-endDate`, `formField-roleDescription`).
- **Dates** are the risk: month/year spinbuttons (`dateSectionMonth-input`, `dateSectionYear-input`)
  that may ignore the value setter `fill.js` uses. Try in order: setter + input/change/blur; focus and
  per-key `keydown`/`input` events; if neither sticks, the extension needs trusted typing through
  `chrome.debugger` (extra permission, Chrome shows a banner). The script and Claude drivers can type
  with real keys either way.
- Whether uploading the resume on this page re-runs parsing (if it does, attach the resume first, then
  fill experience).

The selectors above are from memory of Workday's markup and must be confirmed here before coding.

### Confirmed 2026-10-18 (Motorola Solutions, wd5, My Experience page, read only)

- Page `[data-automation-id="applyFlowMyExpPage"]`. Sections are `[role="group"][aria-labelledby="Work-Experience-section"]`,
  `Education-section`, `Resume/CV-section`; each entry is `[role="group"][aria-labelledby="Work-Experience-N-panel"]`
  (label text "Work Experience N").
- **Add Another** is `button[data-automation-id="add-button"]` inside the section. Each entry's **Delete** is the
  panel's first `button` (text "Delete", no automation id), not `panel-set-delete-button`.
- Field wrappers `formField-jobTitle`, `-companyName`, `-location`, `-currentlyWorkHere`, `-startDate`, `-endDate`,
  `-roleDescription`. Inputs have ids `workExperience-<n>--jobTitle`, `--companyName`, `--location`,
  `--currentlyWorkHere` (checkbox), `--startDate-dateSectionMonth-input`, `--startDate-dateSectionYear-input`,
  `--endDate-…`, `--roleDescription` (textarea, no maxlength; a 1,012-character description was accepted).
  `<n>` is not the entry number (entry 1 was `workExperience-5`), so find fields by suffix within the panel.
- Dates: month values have no leading zero ("7", "11"), year is four digits ("2024"). Both are React-controlled `type=text`
  `role=spinbutton` inputs with `onChange`, `onFocus` and `onKeyDown` props, so the setter + `input` event that
  `fill.js` already uses should reach `onChange`.
- The checkbox is a React-controlled `input[type=checkbox]` with `onChange`.

**Live test (owner's OK, on a blank 4th entry, then deleted; nothing saved):** Add Another made a new
panel within ~1 s. `fill.js`'s `setValue` worked for title, company, description and all four date
boxes: React's own `value` prop and `aria-valuenow` updated and the field showed "03/2021". `.click()`
on "I currently work here" ticked it and removed the To date. Delete removed the entry at once, with no
confirm dialog. So **no `chrome.debugger` / trusted typing is needed**; plain events are enough.
Location is a plain text box on this tenant (other tenants may make it a lookup; treat it like a combobox
if it has `role=combobox`).

Location: the owner's resume has the job locations (e.g. "Daejeon, Korea"); `seed.ts`, which shows
"Korea Air Force" alone, is only starter data, not the live library in Firestore. Take location from
`orgRight` when it isn't a GPA/score, else from the place split off the end of `org` (`splitOrg`). Check
against the real library when building phase 1.

## Phase 1 — put experience in the kit (app)

- `ApplyKit.experience?: KitJob[]` with
  `{ title, company, location, startMonth, startYear, endMonth?, endYear?, current, description }`.
  Optional, so old kits still import.
- `src/applications/experience.ts`: `jobsFromSnapshot(snapshot)` and its parsers, with tests:
  - `parseDates("November 2024 – August 2026")` → 11/2024 – 8/2026; "Present"/"Current"/"Now" → current;
    a lone "March 2023" → start and end the same month; accepts –, —, - and "to"; month names and
    abbreviations.
  - `splitOrg("Cambian Business Service Inc, BC")` → company "Cambian Business Service Inc", location
    "BC"; only a trailing part that looks like a place (2-letter code, known province/state/country)
    is split off, so "Acme, Inc." stays whole.
- `makeKit` adds `experience`. On Profile → Download apply kit, show the parsed list under the version
  picker, with a warning on any entry whose dates didn't parse (the kit still downloads; that entry's
  dates are left for you).

## Phase 2 — fill it on Workday (`fill.js`)

New `fillWorkdayExperience(kit, report)` called from `fill()` when the page has the Workday experience
section (hosts `*.myworkdayjobs.com` / `*.myworkdaysite.com`, or `data-automation-id` markers inside an
iframe). Runs before the generic field loop, and the loop then skips fields inside that section.

1. Read the existing entries (title + company) into `report.experience.removed`.
2. If replacing: click each entry's delete button, waiting for it to go (poll, like `fillCombobox`).
3. For each kit job: click Add, wait for the new empty entry, fill title, company, location, tick
   "I currently work here" when current (the single-checkbox rule doesn't apply here), set From/To
   month and year, fill the description. Mark green/amber like other fields.
4. Report `report.experience = { removed: [...], added: n, left: [...] }`; the popup and `apply.mjs`
   print "Experience: replaced 3 parsed entries with 3 from your resume" plus anything left.
5. Same for the Education section (school, degree, field of study, from/to year), from the snapshot's
   `education` entries.

Safety: still never clicks Save and Continue or Submit; if the page doesn't look like expected (no Add
button, an entry won't delete), stop that section, leave it amber and say why, rather than half-replace.

Tests (`tools/autofill/fill.test.ts`, happy-dom): a fixture built from the phase-0 HTML with a fake Add
button that appends an entry; check removed/added entries, the current-job checkbox, dates, description
cut, and that non-Workday pages are untouched.

## Phase 3 — other sites (later)

Detect a repeated employment block anywhere: a container whose fields ask job title + company + dates,
with an "Add" button next to it. Fill the first blank block, click Add for the rest. Worth it mainly for
iCIMS, SuccessFactors, Oracle/Taleo; Greenhouse, Lever and Ashby usually only ask for the resume file.
Starts with the same `KitJob` data, so phase 1 isn't wasted. Replacing parsed entries stays Workday-only
unless a site shows the same problem.

## Done when

On two different Workday tenants, after the resume parse step, Fill this page leaves My Experience with
exactly the resume's jobs, correct dates and descriptions, and nothing else changed; tests pass.
