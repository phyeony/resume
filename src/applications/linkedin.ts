// LinkedIn job alert emails as leads. The mail job (tools/mail) reads them from Gmail; each job in an
// alert becomes a FeedJob, so planImport skips the ones already seen, exactly as for the GitHub lists.

import type { Application, Lead } from '../model/types';
import type { FeedJob } from './feeds';
import { parseSender, type MailMessage } from './mail';

const ALERT_SENDERS = /^(?:jobalerts-noreply|jobs-listings|jobs-noreply)@linkedin\.com$/;

export function isLinkedInAlert(m: MailMessage): boolean {
  return ALERT_SENDERS.test(parseSender(m.from).address);
}

/** The posting's number in any LinkedIn job link: /jobs/view/123, /comm/jobs/view/123, ?currentJobId=123. */
export function linkedInJobId(url: string | undefined): string | undefined {
  if (!url || !/linkedin\.com/i.test(url)) return undefined;
  return /\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i.exec(url)?.[1] ?? /[?&]currentJobId=(\d{6,})/i.exec(url)?.[1];
}

const JOB_LINK = /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/\S+/i;
const SEPARATOR = /^\s*[-–—_=*]{5,}\s*$/;
/** Lines around a job that aren't its title, company or location: whole lines, then phrases. */
const NOTE_LINE =
  /^(?:view job:?|apply(?: now)?|easy apply|promoted|new|actively recruiting|this company is actively hiring|be an early applicant|top applicant|see all jobs|linkedin|help|unsubscribe)$/i;
const NOTE_TEXT =
  /\b(?:connections?|alumni|applicants?|works? here|job alert|new jobs? match|match(?:es)? your preferences|\d+\s*(?:minutes?|hours?|days?|weeks?) ago|you(?:'|’)re receiving|unsubscribe)\b|https?:\/\/|©/i;
const SALARY = /(?:[$€£]|\bca\$|\bus\$)\s?\d|\/(?:hr|hour|yr|year)\b/i;

/**
 * Jobs in one alert's plain-text body. Each job reads as its title, company and location, a few
 * notes ("Easy Apply", "3 connections"), then a "View job:" link; jobs are split by dashed lines.
 */
export function parseLinkedInAlert(m: MailMessage): FeedJob[] {
  const jobs: FeedJob[] = [];
  const seen = new Set<string>();
  let lines: string[] = [];
  for (const raw of m.body.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (SEPARATOR.test(line)) {
      lines = [];
      continue;
    }
    const link = JOB_LINK.exec(line)?.[0].replace(/[>)\].,]+$/, '');
    const id = linkedInJobId(link);
    if (!id) {
      if (line) lines.push(line);
      continue;
    }
    const text = lines.filter((l) => !NOTE_LINE.test(l) && !NOTE_TEXT.test(l));
    const salary = text.find((l) => SALARY.test(l));
    // Lines left from the alert's heading come first, so the job is the last three.
    const fields = text.filter((l) => l !== salary);
    const [role, company, location] = fields.length > 3 ? fields.slice(-3) : fields;
    lines = [];
    if (!role || !company || seen.has(id)) continue;
    seen.add(id);
    jobs.push({
      source: 'LinkedIn',
      sourceId: `linkedin:${id}`,
      company: company.replace(/\s+[·•|]\s+.*$/, ''),
      role,
      url: `https://www.linkedin.com/jobs/view/${id}/`,
      locations: location ? [location] : [],
      postedAt: m.date,
      ...(salary ? { salary } : {}),
    });
  }
  return jobs;
}

/** Drops jobs whose LinkedIn posting is already a lead or an application, whatever its link looks like. */
export function withoutKnownLinkedIn(jobs: FeedJob[], existing: { leads: Lead[]; applications: Application[] }): FeedJob[] {
  const known = new Set([...existing.leads, ...existing.applications].map((x) => linkedInJobId(x.url)).filter(Boolean));
  return jobs.filter((j) => !known.has(j.sourceId.slice('linkedin:'.length)));
}
