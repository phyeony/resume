---
name: apply
description: Fill a job application in the user's Chrome from their Resume Studio apply kit, stop for their review, and submit only after they say so. Use when the user asks Claude to apply to a lead or a job link.
---

# Apply to a job in the user's Chrome

The user reviews every application before it is sent. **Never click Submit (or Apply/Send/Finish on the
last step) until the user has replied "submit" for that application in chat.** Approval for one application
never carries over to the next.

## Before starting

1. Get the job link(s). If the user names leads ("the first three starred"), open Resume Studio
   (`/admin/leads`) in Chrome and read the links from there.
2. `node tools/autofill/kit.mjs info`. If it says there's no kit, or the kit is old and the user mentions
   changed answers, ask them to press **Download apply kit** on the Profile page first.
3. Load the Chrome tools in one ToolSearch call (tabs_context_mcp, tabs_create_mcp, navigate, computer,
   read_page, find, form_input, javascript_tool, file_upload, get_page_text).

## For each application

1. Open the link in a new tab. If the form is behind an "Apply" button, click it (that's not submitting).
   If a site wants an account, a sign-in or a CAPTCHA, stop and ask the user to do that part.
2. Run the shared filler. Read `tools/autofill/extension/fill.js` and run its contents with
   `javascript_tool`, then run
   `await window.__resumeStudio.fill(<output of: node tools/autofill/kit.mjs answers>)`.
   If the form is in an iframe from another site, navigate the tab to the iframe's `src` and run it there.
3. Resume: if the report says it wasn't attached, write it with
   `node tools/autofill/kit.mjs pdf <session outputs folder>/<fileName>` and use `file_upload` on the
   resume input. If the upload tool rejects the path, rerun the filler with the full kit
   (`JSON.parse` of the kit file, pdfBase64 included) so it attaches the PDF itself.
4. Handle what the filler left (amber outlines; `left` in the report):
   - Custom dropdowns and comboboxes: pick the option matching the answer bank, with `form_input` or clicks.
   - Free-text questions ("Why do you want to work here?"): draft a short, specific answer from the
     posting (get_page_text) and the resume version in the kit. Put the draft in the field but list it
     for the user in the summary.
   - Questions the answer bank doesn't cover (e.g. "Current company"), consent checkboxes, cover letter
     uploads: leave them, and list them for the user. Don't guess facts about the user.
5. Stop and report in chat:
   - Job and link, resume attached (file name).
   - Filled fields, briefly. Drafted free-text answers in full.
   - What still needs the user, required ones first.
   - "Reply **submit** to send it, or tell me what to change."
6. On "submit": click the submit button (`__resumeStudio.findSubmit()` finds it), wait, and check the
   page for a confirmation or errors. Report which. If errors, fix what you can and ask again before
   resubmitting.
7. After a confirmed submission: in Resume Studio `/admin/leads`, press **Applied** on that lead (it
   records the application with the kit's resume). If the job isn't a lead, tell the user so they can
   add it under Applications.

## Notes

- Workday and other multi-page forms: run the filler on each page; "Next"/"Continue" between pages is
  fine to click, the final "Submit" is not without approval.
- Don't apply through LinkedIn Easy Apply or Indeed Apply; their terms forbid automation. Use the
  company's own application page instead, or leave it to the user.
- Suggest new entries for the answer bank (Profile → Other questions) when the same question keeps
  coming up.
