# Email → application status tracking — design

Agreed with the owner 2026-10-16. Setup steps: `tools/mail/README.md`.

## Context
Status changes (rejections, OAs, interview invites, offers) arrive by email in Gmail and a school Microsoft 365 Outlook, and today they have to be copied into Resume Studio's tracker by hand. Goal: once a day, read new mail, match it to a tracked application, **apply the stage change automatically** (rejections and advances alike), and alert the user so any change can be reverted. Alerts appear in two places, with rejections shown separately from advances: in Resume Studio, and in a daily Gmail digest.

Constraints: Firebase is on the free Spark plan (no Cloud Functions), so the daily job runs in **Google Apps Script**, which is free, runs in Google's cloud on a time trigger and reads Gmail natively. Outlook mail reaches it by being forwarded into Gmail. Mail contents are personal, so only mail that matches a tracked company or reads as a status change is copied to Firestore, as a short excerpt, in an owner-only collection.

## Design

**Pure logic in TS, shared and tested** — `src/applications/mail.ts` (+ `mail.test.ts`):
- `unwrapForward(msg)`: for mail forwarded from Outlook (`FW:` subject or from the school address), pulls the original From/Subject/Date out of the forwarded header block.
- `classify(subject, body)` → `{ kind: 'rejected' | 'advanced' | 'applied' | 'other', toStage? }` using phrase rules:
  - rejected: "unfortunately", "not moving forward", "other candidates", "will not be proceeding", "position has been filled", "regret to inform". Rejection wins over advance phrases ("next steps" appears in rejections too).
  - Sentences that only make a promise ("if selected, you may be asked to complete an assessment") don't count as a step forward.
  - advanced: OA/assessment (HackerRank, CodeSignal, "online assessment", "coding challenge") → `screening`; interview ("schedule", "interview invitation", "next round", GoodTime/Calendly links) → `interviewing`; "pleased to offer" / "offer letter" → `offer`.
  - applied: "thank you for applying" / "application received" → `applied`, but only when the application is still `saved`.
  - Job-board alert senders (LinkedIn job alerts, Indeed, Glassdoor, Handshake digests) are skipped.
- `matchApplication(mail, apps)`: normalizes company names (case, Inc/Ltd/Corp, punctuation) and looks for them in the sender name, sender domain, subject and body. It only considers open applications. When several applications are at the same company, the role named in the mail decides; otherwise the most recently applied one is picked and flagged `ambiguous`.
- `decide(mail, apps)` → the update to apply or `unmatched`/`ignored`. Stages never move backward, and closed applications aren't reopened.
- Reuses `currentStage`, `sortHistory` and `isClosed` from `src/applications/model.ts`. Adds `withMailEvent` / `withoutMailEvent` beside them in mail.ts.

**Data** (`src/model/types.ts`, `firestore.rules`):
- `StageEvent` gains `mailId?: string`, so an automatic change can be found and reverted.
- New owner-only `mail/{gmailMessageId}`: `{ receivedAt, from, subject, excerpt (≤1500 chars), via: 'gmail'|'outlook', kind, applicationId?, fromStage?, toStage?, ambiguous?, status: 'applied'|'unmatched'|'reverted'|'dismissed', seen }`. The Gmail id is the dedupe key.

**Apps Script job** — `tools/mail/`:
- `main.ts`: Apps Script glue. `run()` searches `newer_than:3d -in:sent -in:chats`, skips ids already in `mail/`, reads open applications over the Firestore REST API, runs `decide`, then commits each result in **one Firestore commit**: create `mail/{id}` with `exists:false` precondition, plus an update to `applications/{id}` (`history`, `updatedAt` via updateMask). After the run it sends a digest with `MailApp.sendEmail`, but only if something happened. The digest has three sections: Rejected, Moving forward, and Couldn't match. Each links to `/admin/applications`. `setup()` installs a daily 7am time trigger.
- `firestore.ts` (+ test): service-account JWT → OAuth token (`Utilities.computeRsaSha256Signature`, cached in `CacheService`), and Firestore REST value encode/decode.
- `build.mjs`: bundles `main.ts` + `src/applications/mail.ts` with the esbuild that already ships with Vite into `tools/mail/dist/Code.js`, with top-level `run`/`setup` functions. `appsscript.json` sets the scopes `https://mail.google.com/` (Apps Script's Gmail service offers no read-only scope; the job only reads), `script.send_mail`, `script.external_request`, `script.scriptapp` and `userinfo.email`. Root `package.json` gets `"mail:build": "node tools/mail/build.mjs"`.
- `README.md`: setup steps, listed under Rollout.

**Resume Studio UI**:
- `src/pages/admin/store.ts` + `store.local.ts`: `listUnseenMail()`, `revertMail(mail, app)` (batch: remove the event from the app, set mail `reverted`), `dismissMail(ids)`, `assignMail(mail, to, from?)` (applies the stage to the chosen app, moving it off a wrong guess).
- New `src/pages/admin/MailAlerts.tsx`, shown at the top of `ApplicationsPage.tsx` for unseen mail. It has a red **Rejected** group, a green **Moving forward** group and a gray **Couldn't match** group. Each row shows company · role, from → to stage, subject, date and excerpt on expand. Actions: **Revert**, **Dismiss**, and on unmatched rows **Assign to…**. Ambiguous matches also get **Assign to…**. Styles go in `applications.css`.
- `ApplicationEditor.tsx` history: events with `mailId` show a "from email" marker and the subject.

**Event dates:** an automatic stage event is dated by when the email arrived, not by when the job ran. For forwarded mail, that's the original Date taken from the forwarded header. Mail is processed oldest first, so one application can step through several emails in order (for example, OA and then interview).

## One-time catch-up: the past week in both inboxes
- **Gmail:** `backfill()` in the Apps Script runs the same pipeline with `newer_than:7d`. Ids already processed are skipped, so it's safe to run again. It sends one digest for the whole catch-up.
- **Outlook:** the redirect rule only covers new mail, so last week's Outlook mail isn't in Gmail. With your OK, I'll use Claude in Chrome to open Outlook on the web (you're already signed in) and list the past 7 days' emails that look recruiting-related. You check the list, and then I **manually forward** those emails to Gmail. Manual forwarding isn't blocked by the school's auto-forward policy. `unwrapForward` recovers the original sender and date, so `backfill()` picks them up with the right dates. Order: forward the Outlook mail first, then run `backfill()` once.

## Rollout (user steps, in README)
1. In Google Cloud console (project `hyeonyoung-park-resume`), create a service account with role **Cloud Datastore User** and download its JSON key. This works on Spark.
2. Create an Apps Script project at script.google.com while signed in as phyeony@gmail.com. Paste in `dist/Code.js` and `appsscript.json` (or use `clasp push`). Set Script Properties `SA_KEY` (the JSON key), `PROJECT_ID` and `OUTLOOK_ADDRESS`. Run `setup()` once and approve the scopes.
3. Outlook (M365) → Gmail. Try an Outlook rule set to **Redirect to** phyeony@gmail.com, which keeps the original sender. Many schools block external forwarding. If yours does, use a **Power Automate** flow instead: "When a new email arrives (V3)" → "Send an email (V2)" to Gmail, with the original from/subject in the body. `unwrapForward` handles both. If both are blocked, Outlook mail is out of reach without IT consent, and the user forwards status emails by hand.
4. `firebase deploy --only firestore:rules,hosting --project hyeonyoung-park-resume`.

## Verification
- `npm test`: tests for `classify` (real-world rejection, OA, interview, offer and confirmation phrasings, rejection-beats-"next steps", job-alert skip), `matchApplication` (ATS senders like greenhouse/lever/workday, same-company tie-break, closed apps ignored), `decide` (never backward), `withoutMailEvent`, `unwrapForward` on Outlook and Gmail forwards, and the Firestore value encode/decode.
- `npm run typecheck`, `npm run mail:build`. Check that `dist/Code.js` exposes `run`/`setup` and contains no ES module syntax.
- `npm run local`: with sample mail written to localStorage by hand, the alerts render in the three groups, Revert restores the previous stage, and Move to… reassigns the step.
- Live: send yourself a test "Unfortunately…" email that names a tracked company, run `run()` by hand in Apps Script, and confirm that the application flips to Rejected, the alert shows in Resume Studio, the digest arrives, and Revert works.
