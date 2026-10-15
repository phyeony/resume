# Autofill applications — design

Agreed with the owner 2026-10-15/16. Goal: try three ways of filling job applications from the leads list,
compare them on real applications, keep the best (the other two are prototypes). Every submission is
confirmed by the owner first.

## Shared foundation (app)

- **Answer bank** `owner/answers` (owner-only, never in the repo): name, contact, address, links, school,
  graduation, start date, salary, pronouns, own demographic answers, per-country work authorization
  (`*` row = any other country), custom question → answer pairs. Edited on Profile; first filled from the
  profile's contacts.
- **Apply kit**: Profile → Download apply kit (choose resume version) saves `apply-kit.json` to Downloads:
  answers + the version's PDF (base64). Read by the script and Claude, imported by the extension.
  Git-ignored. The chosen version is remembered as `kitVersionId`.
- **Applied** on a lead creates the application at stage applied, with the kit's version (else main).
  Tools can't write to Firestore (no sign-in); recording is this one click.

## Filler (`tools/autofill/extension/fill.js`)

One plain script for all three. Finds each field's question (label, aria, fieldset legend, nearest
container text, placeholder, name), answers custom patterns first then built-in rules, fills text, select,
radio, checkbox groups, comboboxes (type and pick option), attaches the resume, outlines green/amber,
returns a report. Never overwrites filled fields, never ticks single (consent) checkboxes, never clicks
submit — `findSubmit()` is for the caller after confirmation.

## Drivers

1. **Claude** — `.claude/skills/apply/SKILL.md`: open link in the owner's Chrome, run the filler, handle the
   rest (custom dropdowns, drafted free-text answers), report, submit only on "submit", then press Applied.
2. **Script** — `tools/autofill/apply.mjs` (own package, Playwright pinned): headed Chrome with a separate
   profile in `~/.resume-studio/browser`, opens the form behind "Apply", fills all frames, prints the
   report, submits on `s`.
3. **Extension** — `tools/autofill/extension` (MV3, unpacked): import kit, fill all frames, show report;
   the owner submits.

Out of scope: Workday end-to-end (fill per page), CAPTCHAs, accounts, LinkedIn/Indeed Apply.
