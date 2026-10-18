// Daily mail job (Google Apps Script): reads recent Gmail, including school Outlook mail redirected
// there, moves the applications that status emails are about, keeps those emails in mail/{id} for the
// alerts in Resume Studio, and sends one digest. Build with `npm run mail:build`; setup in README.md.

import { decideAll, type MailMessage } from '../../src/applications/mail';
import { STAGE_LABELS, type Application, type MailUpdate } from '../../src/model/types';
import { Firestore, toFields, type Write } from './firestore';

const DEFAULT_SITE = 'https://hyeonyoung-park-resume.web.app';
const DAY = 86_400_000;

function prop(k: string): string {
  return PropertiesService.getScriptProperties().getProperty(k) ?? '';
}

/** Daily: the last 3 days, so a missed day is caught up. */
export function run(): void {
  process(3, 'Resume Studio: application updates');
}

/** One-off catch-up over the past week. Safe to repeat: emails already read are skipped. */
export function backfill(): void {
  process(7, 'Resume Studio: catch-up for the past week');
}

/** Installs the daily trigger (7am in the script's time zone). */
export function setup(): void {
  for (const t of ScriptApp.getProjectTriggers()) if (t.getHandlerFunction() === 'run') ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger('run').timeBased().everyDays(1).atHour(7).create();
  console.log('Daily trigger installed. Running once now…');
  run();
}

function process(days: number, digestSubject: string): void {
  const key = prop('SA_KEY');
  if (!key) throw new Error('Set the SA_KEY script property to the service account JSON key (see README).');
  const fs = new Firestore(JSON.parse(key));

  const messages = recentMail(days);
  const done = fs.existing('mail', messages.map((m) => m.id));
  const fresh = messages.filter((m) => !done.has(m.id));
  console.log(`${messages.length} emails in the last ${days} days, ${fresh.length} not read before.`);
  if (!fresh.length) return;

  const docs = fs.list<Application>('applications');
  const updateTime = new Map(docs.map((d) => [d.data.id, d.updateTime]));
  const decisions = decideAll(
    fresh,
    docs.map((d) => d.data),
    { outlook: prop('OUTLOOK_ADDRESS') },
  );

  const written: MailUpdate[] = [];
  for (const d of decisions) {
    const mail = d.mail!;
    const writes: Write[] = [{ update: { name: fs.name('mail', mail.id), fields: toFields({ ...mail }) }, currentDocument: { exists: false } }];
    if (d.app) {
      writes.push({
        update: { name: fs.name('applications', d.app.id), fields: toFields({ history: d.app.history, updatedAt: d.app.updatedAt }) },
        updateMask: { fieldPaths: ['history', 'updatedAt'] },
        currentDocument: { updateTime: updateTime.get(d.app.id)! },
      });
    }
    try {
      const times = fs.commit(writes);
      if (d.app) updateTime.set(d.app.id, times[1]);
      written.push(mail);
    } catch (e) {
      // e.g. the application was edited meanwhile; the email stays unread and is tried next run
      console.error(`Skipped "${mail.subject}": ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`${written.length} status emails recorded.`);
  if (written.length) sendDigest(digestSubject, written, new Map(docs.map((d) => [d.data.id, d.data])));
}

function recentMail(days: number): MailMessage[] {
  const since = Date.now() - days * DAY;
  const out: MailMessage[] = [];
  for (let start = 0; ; start += 100) {
    const threads = GmailApp.search(`newer_than:${days}d -in:sent -in:chats`, start, 100);
    for (const t of threads) {
      for (const m of t.getMessages()) {
        if (m.getDate().getTime() < since) continue;
        out.push({ id: m.getId(), from: m.getFrom(), to: m.getTo(), subject: m.getSubject(), body: m.getPlainBody(), date: m.getDate().getTime() });
      }
    }
    if (threads.length < 100 || start >= 900) break;
  }
  return out;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function sendDigest(subject: string, mails: MailUpdate[], apps: Map<string, Application>): void {
  const site = prop('SITE_URL') || DEFAULT_SITE;
  const line = (m: MailUpdate) => {
    const a = m.applicationId ? apps.get(m.applicationId) : undefined;
    const what = a ? `<a href="${site}/admin/applications/${a.id}">${esc(a.company)} · ${esc(a.role)}</a>` : esc(m.from);
    const step = m.fromStage ? `${STAGE_LABELS[m.fromStage]} → ${STAGE_LABELS[m.toStage]}` : `reads as ${STAGE_LABELS[m.toStage]}`;
    const date = new Date(m.receivedAt).toDateString().slice(4, 10);
    return `<li>${what}: <b>${step}</b>${m.ambiguous ? ' (best guess)' : ''}<br><span style="color:#5f6368">${date} · “${esc(m.subject)}”</span></li>`;
  };
  const group = (title: string, color: string, list: MailUpdate[]) =>
    list.length ? `<h3 style="color:${color};margin:16px 0 6px">${title} (${list.length})</h3><ul style="padding-left:18px">${list.map(line).join('')}</ul>` : '';
  const applied = mails.filter((m) => m.status === 'applied');
  const rejected = applied.filter((m) => m.kind === 'rejected');
  const forward = applied.filter((m) => m.kind !== 'rejected');
  const unmatched = mails.filter((m) => m.status === 'unmatched');

  const html =
    group('Moving forward', '#188038', forward) +
    group('Rejected', '#c5221f', rejected) +
    group("Couldn't match", '#5f6368', unmatched) +
    `<p><a href="${site}/admin/applications">Review in Resume Studio</a>: each change can be reverted there.</p>`;
  const counts = [forward.length && `${forward.length} moving forward`, rejected.length && `${rejected.length} rejected`, unmatched.length && `${unmatched.length} to match`].filter(Boolean).join(', ');
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: `${subject}: ${counts}`,
    htmlBody: html,
    body: `${counts}. Review: ${site}/admin/applications`,
  });
}
