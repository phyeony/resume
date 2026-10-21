import { describe, expect, it } from 'vitest';
import type { Lead } from '../model/types';
import { planImport } from './feeds';
import { isLinkedInAlert, linkedInJobId, parseLinkedInAlert, withoutKnownLinkedIn } from './linkedin';
import type { MailMessage } from './mail';
import { newApplication } from './model';

const DAY = 86_400_000;

const ALERT = `Your job alert for software engineer intern in Vancouver, British Columbia, Canada
30+ new jobs match your preferences.

Software Engineer Intern
Acme Robotics
Vancouver, BC (Hybrid)
CA$30/hr - CA$38/hr
Actively recruiting
3 connections
View job: https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc%3D%3D&refId=xyz&trk=eml-email_job_alert_digest_01-job_card-0-view_job

---------------------------------------------------------

New Grad Software Developer
Globex · Corp
Burnaby, British Columbia, Canada
Easy Apply
View job: https://www.linkedin.com/comm/jobs/view/4087654321/?trackingId=def

---------------------------------------------------------

Software Engineer Intern
Acme Robotics
Vancouver, BC (Hybrid)
View job: https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=again

---------------------------------------------------------

See all jobs: https://www.linkedin.com/comm/jobs/search?keywords=software%20engineer%20intern
You're receiving job alert emails. Unsubscribe: https://www.linkedin.com/comm/psettings/email-unsubscribe
© 2026 LinkedIn Corporation`;

const alert = (body = ALERT): MailMessage => ({ id: 'm1', from: 'LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>', subject: 'software engineer intern: Acme Robotics and more', body, date: 10 * DAY });

describe('isLinkedInAlert', () => {
  it('knows the alert senders only', () => {
    expect(isLinkedInAlert(alert())).toBe(true);
    expect(isLinkedInAlert({ ...alert(), from: 'LinkedIn <messages-noreply@linkedin.com>' })).toBe(false);
    expect(isLinkedInAlert({ ...alert(), from: 'Acme <jobalerts-noreply@acme.com>' })).toBe(false);
  });
});

describe('linkedInJobId', () => {
  it('reads every kind of job link', () => {
    expect(linkedInJobId('https://www.linkedin.com/jobs/view/4012345678/')).toBe('4012345678');
    expect(linkedInJobId('https://ca.linkedin.com/jobs/view/software-engineer-intern-at-acme-4012345678?trk=x')).toBe('4012345678');
    expect(linkedInJobId('https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=x')).toBe('4012345678');
    expect(linkedInJobId('https://boards.greenhouse.io/acme/jobs/4012345678')).toBeUndefined();
  });
});

describe('parseLinkedInAlert', () => {
  it('reads each job once, without the notes around it', () => {
    expect(parseLinkedInAlert(alert())).toEqual([
      {
        source: 'LinkedIn',
        sourceId: 'linkedin:4012345678',
        company: 'Acme Robotics',
        role: 'Software Engineer Intern',
        url: 'https://www.linkedin.com/jobs/view/4012345678/',
        locations: ['Vancouver, BC (Hybrid)'],
        postedAt: 10 * DAY,
        salary: 'CA$30/hr - CA$38/hr',
      },
      {
        source: 'LinkedIn',
        sourceId: 'linkedin:4087654321',
        company: 'Globex',
        role: 'New Grad Software Developer',
        url: 'https://www.linkedin.com/jobs/view/4087654321/',
        locations: ['Burnaby, British Columbia, Canada'],
        postedAt: 10 * DAY,
      },
    ]);
  });

  it('reads jobs that have no dashed lines between them', () => {
    const body = ALERT.replace(/^-+$/gm, '');
    expect(parseLinkedInAlert(alert(body)).map((j) => `${j.company}|${j.role}`)).toEqual(['Acme Robotics|Software Engineer Intern', 'Globex|New Grad Software Developer']);
  });

  it('skips a link with no job written above it', () => {
    expect(parseLinkedInAlert(alert('View job: https://www.linkedin.com/comm/jobs/view/4012345678/'))).toEqual([]);
  });
});

describe('dedupe against what is already tracked', () => {
  const lead = (p: Partial<Lead>): Lead => ({ id: 'x', company: '', role: '', url: '', source: 'Simplify', addedAt: 0, status: 'dismissed', ...p });

  it('skips postings already saved under another link, and jobs known from other lists', () => {
    const jobs = parseLinkedInAlert(alert());
    const app = { ...newApplication('a1', 0), company: 'Other', role: 'Other', url: 'https://ca.linkedin.com/jobs/view/software-dev-at-globex-4087654321' };
    const existing = { leads: [lead({ company: 'ACME Robotics', role: 'Software Engineer, Intern' })], applications: [app] };
    const plan = planImport(withoutKnownLinkedIn(jobs, existing), existing, () => 'l1', 11 * DAY);
    expect(plan.leads).toEqual([]);
  });

  it('adds new postings once, even across alerts', () => {
    let n = 0;
    const jobs = [...parseLinkedInAlert(alert()), ...parseLinkedInAlert({ ...alert(), id: 'm2' })];
    const plan = planImport(jobs, { leads: [], applications: [] }, () => `l${++n}`, 11 * DAY);
    expect(plan.leads.map((l) => [l.id, l.company, l.source, l.status])).toEqual([
      ['l1', 'Acme Robotics', 'LinkedIn', 'new'],
      ['l2', 'Globex', 'LinkedIn', 'new'],
    ]);
  });
});
