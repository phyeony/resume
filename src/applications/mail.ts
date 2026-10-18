// Reading status emails: what an email says (rejected, moved on, received) and which tracked
// application it is about. Pure, so the Apps Script mail job (tools/mail) and the editor share it.

import type { Application, MailKind, MailUpdate, Stage, StageEvent } from '../model/types';
import { currentStage, isClosed, lastEventAt, sortHistory } from './model';

/** One email as the mail job reads it. */
export interface MailMessage {
  id: string;
  /** Raw From header: `Name <address>` or a bare address. */
  from: string;
  to?: string;
  subject: string;
  /** Plain-text body. */
  body: string;
  date: number;
}

export interface Sender {
  name: string;
  address: string;
  domain: string;
}

export function parseSender(raw: string): Sender {
  const address = (raw.match(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? '').toLowerCase();
  const name = raw
    .replace(/<[^>]*>/g, '')
    .replace(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/g, '')
    .replace(/["[\]]/g, '')
    .trim();
  return { name, address, domain: address.split('@')[1] ?? '' };
}

const FORWARD_SUBJECT = /^\s*(?:fwd?|fw)\s*:\s*/i;

/**
 * For an email forwarded by hand or by a Power Automate flow, the original sender, subject, date and
 * body, read from the header block Outlook/Gmail put on top ("From: … Sent: … Subject: …").
 * Redirected mail keeps its own headers and comes back unchanged.
 */
export function unwrapForward(m: MailMessage): MailMessage {
  const lines = m.body.replace(/\r/g, '').split('\n');
  const from = lines.findIndex((l) => /^\s*\*?From:\*?\s+\S/.test(l));
  // a flow's copy starts with the header block; a hand forward says so in the subject
  if (from < 0 || !(FORWARD_SUBJECT.test(m.subject) || from <= 1)) return m;

  const head: Record<string, string> = {};
  let i = from;
  for (; i < lines.length && i < from + 12; i++) {
    const h = lines[i].replace(/\*/g, '').match(/^\s*(From|Sent|Date|To|Cc|Subject|Received):\s*(.*)$/i);
    if (h) head[h[1].toLowerCase()] = h[2].trim();
    else if (lines[i].trim() === '' && head.subject !== undefined) break;
    else if (lines[i].trim() !== '' && Object.keys(head).length > 1) break;
  }
  if (head.subject === undefined) return m;
  const when = parseLooseDate(head.sent ?? head.date ?? head.received ?? '');
  return {
    ...m,
    from: head.from ?? m.from,
    subject: head.subject ?? m.subject.replace(FORWARD_SUBJECT, ''),
    body: lines.slice(i).join('\n').trim(),
    date: when ?? m.date,
  };
}

/** "Monday, October 12, 2026 3:04 PM", "Mon, Oct 12, 2026 at 3:04 PM", ISO… */
function parseLooseDate(s: string): number | null {
  const t = Date.parse(s.replace(/\s+at\s+/i, ' ').replace(/\s*\([^)]*\)\s*$/, ''));
  return Number.isNaN(t) ? null : t;
}

// ---- what the email says ----------------------------------------------------------

const REJECTED = [
  /\bnot (?:be )?(?:moving|move|proceed(?:ing)?|progress(?:ing)?) forward\b/,
  /\bnot (?:be )?(?:moving|proceeding|progressing|advancing) (?:with|further)\b/,
  /\b(?:decided|chosen|elected|opted) to (?:move|proceed|pursue|go|continue) (?:forward )?with other\b/,
  /\b(?:pursue|pursuing|proceed with|move forward with|moving forward with) other (?:candidates|applicants)\b/,
  /\bother candidates whose\b/,
  /\bwill not be (?:proceeding|moving|advancing|progressing|offering)\b/,
  /\bdecided not to (?:move|proceed|progress|advance|pursue)\b/,
  /\b(?:not|unable) (?:be )?(?:able )?to (?:offer you|move you forward|progress your|advance your)\b/,
  /\b(?:position|role|req(?:uisition)?) has (?:now )?been filled\b/,
  /\bregret to (?:inform|let you know|tell you)\b/,
  /\b(?:isn't|is not|wasn't|was not|aren't|are not|not) (?:the |a |an )?(?:best|right|strong|good) (?:fit|match)\b/,
  /\bno longer (?:being )?consider/,
  /\b(?:were|was|have|has) not (?:been )?selected\b/,
  /\bunfortunately[^.]{0,120}\b(?:not (?:be )?(?:moving|proceeding|selected|able to (?:offer|move|proceed))|unable to (?:offer|move|proceed)|other candidates|won't be (?:moving|proceeding))/,
];

const OFFER = [
  /\bpleased to (?:extend|offer) (?:you )?(?:an |the |a formal )?(?:offer|position)\b/,
  /\boffer letter\b/,
  /\boffer of employment\b/,
  /\bcongratulations[^.]{0,80}\boffer\b/,
];

const INTERVIEW = [
  /\bschedule (?:an? |your |the )?(?:\w+ ){0,2}interview/,
  /\binvit(?:e|ed|ing|ation)[^.]{0,60}\binterview/,
  /\binterview (?:invitation|invite|request|confirmation|availability)\b/,
  /\b(?:next|final|second|technical|onsite|on-site) (?:round|interview)/,
  /\bavailability for (?:an? |the )?(?:\w+ )?(?:interview|call|chat|conversation)\b/,
  /\b(?:goodtime\.io|calendly\.com|modernloop|yello\.co|karat\.io)\b/,
];

const SCREEN = [
  /\b(?:complete|take|start|invited? to|invitation to|link to|access)\b[^.]{0,80}\b(?:assessment|coding challenge|coding test|technical test|hackerrank|codesignal|codility|hirevue)\b/,
  /\b(?:online|technical|coding) assessment\b[^.]{0,80}\b(?:deadline|expires?|due|within \d+ (?:days|hours)|link)\b/,
  /\b(?:phone|recruiter) (?:screen|call)\b[^.]{0,80}\b(?:schedule|availability|invite|book)/,
  /\b(?:would like to|love to|like to) (?:schedule|set up|have) (?:a |an )?(?:quick |brief |short )?(?:call|chat|conversation)\b/,
];

const ASSESSMENT_SENDERS = /(?:^|\.)(?:hackerrank|hackerrankforwork|codesignal|codility|hirevue|coderbyte|testgorilla)\.(?:com|io)$/;

const RECEIVED = [
  /\bthank(?:s| you) for (?:applying|your application|submitting your application)\b/,
  /\b(?:we(?:'ve| have)|has been) received your application\b/,
  /\byour application (?:has been |was )?(?:received|submitted)\b/,
  /\bapplication (?:confirmation|received)\b/,
];

/** Job alerts and digests name companies too, but never mean a status change. */
const NOT_STATUS_SENDERS = /^(?:jobalerts-noreply@linkedin\.com|jobs-listings@linkedin\.com|alert@indeed\.com|.*@(?:glassdoor\.com|ziprecruiter\.com|joinhandshake\.com|simplify\.jobs|wellfound\.com|builtin\.com))$/;
const NOT_STATUS_SUBJECT = /\b(?:job alert|jobs? (?:for you|you may|we think)|recommended jobs|new jobs|weekly digest|newsletter|webinar)\b/i;

const CONDITIONAL = /\b(?:if (?:you are |you're )?(?:selected|shortlisted|chosen|successful)|if your (?:skills|experience|background|qualifications)|should you (?:be|move)|may be (?:asked|invited|contacted)|might be (?:asked|invited))\b/;

export interface Reading {
  kind: MailKind | 'other';
  toStage?: Stage;
}

/** What the email says about the application. A turn-down wins over "next steps" talk in the same email. */
export function classify(m: MailMessage): Reading {
  const sender = parseSender(m.from);
  if (NOT_STATUS_SENDERS.test(sender.address) || NOT_STATUS_SUBJECT.test(m.subject)) return { kind: 'other' };
  const text = `${m.subject}\n${m.body}`.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  const any = (rules: RegExp[]) => rules.some((r) => r.test(text));
  if (any(REJECTED)) return { kind: 'rejected', toStage: 'rejected' };
  // "if selected, you may be asked to complete an assessment" promises nothing yet
  const firm = text.split(/(?<=[.!?])\s+/).filter((s) => !CONDITIONAL.test(s)).join(' ');
  const anyFirm = (rules: RegExp[]) => rules.some((r) => r.test(firm));
  if (anyFirm(OFFER)) return { kind: 'advanced', toStage: 'offer' };
  if (anyFirm(INTERVIEW)) return { kind: 'advanced', toStage: 'interviewing' };
  if (anyFirm(SCREEN) || ASSESSMENT_SENDERS.test(sender.domain)) return { kind: 'advanced', toStage: 'screening' };
  if (any(RECEIVED)) return { kind: 'applied', toStage: 'applied' };
  return { kind: 'other' };
}

// ---- which application ----------------------------------------------------------------

const COMPANY_SUFFIX = /\b(?:inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|plc|gmbh|ag|sa|ulc|group|holdings)\b/g;

/** "Acme, Inc." → "acme"; "AT&T" → "at and t". */
export function companyKey(name: string): string {
  return norm(name.replace(/&/g, ' and ')).replace(COMPANY_SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** How strongly the email points at this company: sender (3), subject (2), body (1), none (0). */
function companyScore(key: string, sender: Sender, subject: string, body: string): number {
  if (!key) return 0;
  const has = (hay: string) => ` ${hay} `.includes(` ${key} `);
  const domainRoot = sender.domain.split('.').slice(-2, -1)[0] ?? '';
  const sub = sender.domain.split('.')[0] ?? '';
  const flat = key.replace(/ /g, '');
  if (has(norm(sender.name)) || domainRoot === flat || sub === flat) return 3;
  if (has(norm(subject))) return 2;
  // a short name alone in the body ("Box", "Apple") is too likely to be a coincidence
  if (has(norm(body.slice(0, 4000))) && (key.includes(' ') || key.length >= 6)) return 1;
  return 0;
}

/** Share of the role's words the email mentions. */
function roleScore(role: string, text: string): number {
  const words = norm(role).split(' ').filter((w) => w.length > 2 && !['and', 'the', 'for', 'intern', 'internship', 'co', 'op'].includes(w));
  if (!words.length) return 0;
  const hay = ` ${norm(text)} `;
  return words.filter((w) => hay.includes(` ${w} `)).length / words.length;
}

export interface Match {
  app: Application;
  ambiguous: boolean;
}

/** The open application the email is about, if one stands out. */
export function matchApplication(m: MailMessage, apps: Application[]): Match | null {
  const sender = parseSender(m.from);
  const scored = apps
    .filter((a) => !isClosed(currentStage(a)))
    .map((a) => ({ a, score: companyScore(companyKey(a.company), sender, m.subject, m.body) }))
    .filter((x) => x.score > 0);
  if (!scored.length) return null;
  const best = Math.max(...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === best).map((x) => x.a);
  const companies = new Set(top.map((a) => companyKey(a.company)));
  if (top.length === 1) return { app: top[0], ambiguous: false };

  const text = `${m.subject}\n${m.body.slice(0, 4000)}`;
  const byRole = top.map((a) => ({ a, r: roleScore(a.role, text) })).sort((x, y) => y.r - x.r || lastEventAt(y.a) - lastEventAt(x.a));
  const clear = byRole[0].r > 0 && byRole[0].r > byRole[1].r;
  return { app: byRole[0].a, ambiguous: !clear || companies.size > 1 };
}

// ---- what to do ------------------------------------------------------------------------

const RANK: Partial<Record<Stage, number>> = { saved: 0, applied: 1, screening: 2, interviewing: 3, offer: 4 };

/** Whether the email moves the application: never backward, never reopening a closed one. */
export function moves(app: Application, toStage: Stage): boolean {
  const s = currentStage(app);
  if (isClosed(s)) return false;
  if (toStage === 'rejected') return true;
  return (RANK[toStage] ?? -1) > (RANK[s] ?? 99);
}

/** The application with the email's step added. Dated by the email, but never before the latest step. */
export function withMailEvent(app: Application, mail: Pick<MailUpdate, 'id' | 'toStage' | 'subject' | 'receivedAt'>, now = Date.now()): Application {
  const at = Math.max(mail.receivedAt, lastEventAt(app) + 1);
  const event: StageEvent = { stage: mail.toStage, at, note: `Email: ${mail.subject}`.slice(0, 140), mailId: mail.id };
  return { ...app, history: [...app.history, event], updatedAt: now };
}

/** Undoes an email's step. */
export function withoutMailEvent(app: Application, mailId: string, now = Date.now()): Application {
  return { ...app, history: sortHistory(app.history.filter((e) => e.mailId !== mailId)), updatedAt: now };
}

/** Collapsed whitespace, quoted replies cut off. */
export function excerpt(body: string, max = 1500): string {
  const cut = body.replace(/\r/g, '').split(/\n(?:On .{5,120} wrote:|-{2,}\s*Original Message|_{8,}\s*\nFrom:)/)[0];
  const flat = cut.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

export interface Decision {
  /** What to store in mail/{id}; null when the email isn't a status change. */
  mail: MailUpdate | null;
  /** The application to save, when the email moved one. */
  app?: Application;
}

/**
 * Reads one email against the tracked applications. Status emails are always kept (matched or not);
 * a matched one moves its application when that's a step forward or a turn-down.
 */
export function decide(raw: MailMessage, apps: Application[], opts: { outlook?: string; now?: number } = {}): Decision {
  const now = opts.now ?? Date.now();
  const m = unwrapForward(raw);
  const reading = classify(m);
  if (reading.kind === 'other' || !reading.toStage) return { mail: null };

  const outlook = opts.outlook?.toLowerCase();
  const via = outlook && `${raw.to ?? ''} ${raw.from}`.toLowerCase().includes(outlook) ? 'outlook' : 'gmail';
  const base: MailUpdate = {
    id: raw.id,
    receivedAt: m.date,
    from: m.from,
    subject: m.subject,
    excerpt: excerpt(m.body),
    via,
    kind: reading.kind,
    toStage: reading.toStage,
    status: 'unmatched',
    seen: false,
    processedAt: now,
  };

  const match = matchApplication(m, apps);
  if (!match) return { mail: base };
  const { app, ambiguous } = match;
  if (!moves(app, reading.toStage)) return { mail: null };
  const mail: MailUpdate = { ...base, applicationId: app.id, fromStage: currentStage(app), status: 'applied', ...(ambiguous ? { ambiguous } : {}) };
  return { mail, app: withMailEvent(app, mail, now) };
}

/** Oldest first, so one application can step through several emails in order. */
export function decideAll(messages: MailMessage[], apps: Application[], opts: { outlook?: string; now?: number } = {}) {
  const byId = new Map(apps.map((a) => [a.id, a]));
  const out: Decision[] = [];
  for (const m of [...messages].sort((a, b) => unwrapForward(a).date - unwrapForward(b).date)) {
    const d = decide(m, [...byId.values()], opts);
    if (!d.mail) continue;
    if (d.app) byId.set(d.app.id, d.app);
    out.push(d);
  }
  return out;
}
