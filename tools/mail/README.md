# Mail job

Once a day, a Google Apps Script reads the last 3 days of Gmail. That includes your school Outlook mail, which an
Outlook rule redirects into Gmail. When an email is about a tracked application, the script moves the application:

| Email says | Stage |
|---|---|
| Turned down ("not moving forward", "other candidates"…) | Rejected |
| Assessment (HackerRank, CodeSignal, "complete the online assessment"…) | Screening |
| Interview ("schedule an interview", GoodTime/Calendly link…) | Interviewing |
| Offer | Offer |
| "Thank you for applying" (only while still Saved) | Applied |

Stages only move forward, and closed applications are never reopened. Each change appears in
**Applications** under *Moving forward* or *Rejected*, where **Revert** takes it back out and **Move to…**
reassigns it. Status emails that match no application go under *Couldn't match*. After each run that
finds something, you also get a digest email.

Only status emails are saved, as a short excerpt in the owner-only `mail/{id}` collection. Every other
email stays in Gmail and is never copied anywhere.

The matching rules live in `src/applications/mail.ts` and are tested in `mail.test.ts`. This folder holds
the Apps Script glue.

## Setup (once)

1. **Service account.** Open the [Google Cloud console](https://console.cloud.google.com/iam-admin/serviceaccounts?project=hyeonyoung-park-resume)
   for project `hyeonyoung-park-resume`. Choose **Create service account** and name it `mail-job`.
   Give it the role **Cloud Datastore User** and finish. Then open the account, go to **Keys → Add key → JSON**,
   and a JSON file downloads. This works on the free Spark plan. Treat the key like a password:
   don't commit it, and delete the downloaded file once step 3 is done.
2. **Build:** `npm run mail:build` writes `tools/mail/dist/Code.js` and `appsscript.json`.
3. **Apps Script.** Go to [script.google.com](https://script.google.com) signed in as phyeony@gmail.com and create a
   **New project** named "Resume Studio mail".
   - In ⚙ **Project Settings**, tick *Show "appsscript.json" manifest file*. Then, under **Script Properties**, add:
     - `SA_KEY`: the whole contents of the JSON key file
     - `OUTLOOK_ADDRESS`: your school email address, so mail redirected from Outlook is labelled "Outlook"
     - `SITE_URL` (optional): defaults to https://hyeonyoung-park-resume.web.app
   - In the **Editor**, replace `Code.gs` with the contents of `dist/Code.js`, and `appsscript.json` with
     `dist/appsscript.json`. Save.
4. **Catch up on the past week.** Pick `backfill` in the function menu and click **Run**. The first time,
   Google asks you to approve access. It shows "Google hasn't verified this app": choose *Advanced → Go to
   Resume Studio mail* (it's your own script). The log shows what was found, and a digest arrives if anything
   was.
5. **Daily from now on.** Run `setup` once. It installs a 7am daily trigger and runs straight away.

After changing the rules, run `npm run mail:build` again and paste in the new `Code.js`.

## Outlook (school Microsoft 365)

Add an Outlook on the web rule: **Settings → Mail → Rules → Apply to all messages → Redirect to** phyeony@gmail.com.
If it bounces with `550 5.7.520 … does not allow external forwarding`, use a Power Automate flow instead:
*When a new email arrives (V3)* → *Send an email (V2)* to phyeony@gmail.com. Set the subject to
`FW: <Subject>` and start the body with

    From: <From>
    Sent: <Received Time>
    Subject: <Subject>

    <Body>

The job reads that header block, so the email counts as coming from the company and is dated when the
company sent it. A forward you make by hand works the same way.

## Permissions it asks for

- Read Gmail: Apps Script's Gmail service only offers full mail access. The job only searches and reads.
- Send email as you: the digest, sent to yourself only.
- External requests: Firestore and Google sign-in for the service account.
- Triggers: the daily run.
