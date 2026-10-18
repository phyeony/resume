import { describe, expect, it } from 'vitest';
import type { Application, Stage } from '../model/types';
import { classify, companyKey, decide, decideAll, excerpt, matchApplication, parseSender, unwrapForward, withoutMailEvent, type MailMessage } from './mail';
import { currentStage, newApplication } from './model';

const DAY = 86_400_000;

const msg = (p: Partial<MailMessage>): MailMessage => ({ id: 'm1', from: 'Recruiting <no-reply@acme.com>', subject: '', body: '', date: 10 * DAY, ...p });

function app(id: string, company: string, role: string, stage: Stage = 'applied', at = DAY): Application {
  const a = newApplication(id, 0);
  return { ...a, company, role, history: stage === 'saved' ? a.history : [...a.history, { stage, at }] };
}

describe('parseSender', () => {
  it('splits name and address', () => {
    expect(parseSender('"Acme Talent" <Talent@Acme.com>')).toEqual({ name: 'Acme Talent', address: 'talent@acme.com', domain: 'acme.com' });
    expect(parseSender('no-reply@greenhouse.io')).toEqual({ name: '', address: 'no-reply@greenhouse.io', domain: 'greenhouse.io' });
    expect(parseSender('Shopify <mailto:jobs@shopify.com>').address).toBe('jobs@shopify.com');
  });
});

describe('classify', () => {
  const kind = (subject: string, body: string, from?: string) => classify(msg({ subject, body, ...(from ? { from } : {}) }));

  it('reads turn-downs', () => {
    for (const body of [
      'After careful consideration, we have decided to move forward with other candidates whose experience more closely matches.',
      'Unfortunately, we will not be moving forward with your application at this time.',
      'We regret to inform you that the position has been filled.',
      "We've decided not to proceed with your candidacy.",
      'Your application is no longer being considered for this role.',
      'After reviewing your responses to the qualification questions, this particular role isn\u2019t the best fit at this time.',
    ]) {
      expect(kind('Your application', body).kind, body).toBe('rejected');
    }
  });
  it("doesn't read fit talk in a confirmation as a turn-down", () => {
    expect(kind('Thanks for applying', "We'll review whether your background is the right fit and be in touch.").kind).toBe('applied');
  });
  it('lets a turn-down win over "next steps" in the same email', () => {
    expect(kind('Update on next steps', 'Thank you for completing the online assessment. Unfortunately, we will not be moving forward.').kind).toBe('rejected');
  });
  it("doesn't mistake an unavailable time slot for a turn-down", () => {
    expect(kind('Interview scheduling', 'Unfortunately, the time you picked is not available. Please choose another slot to schedule your interview.')).toEqual({ kind: 'advanced', toStage: 'interviewing' });
  });
  it('reads assessments, interviews and offers', () => {
    expect(kind('Acme coding challenge', 'Please complete the HackerRank assessment within 7 days.')).toEqual({ kind: 'advanced', toStage: 'screening' });
    expect(kind('Invitation', 'You have a new test', 'Acme via CodeSignal <noreply@codesignal.com>')).toEqual({ kind: 'advanced', toStage: 'screening' });
    expect(kind('Next steps', "We'd like to invite you to a technical interview. Please share your availability.")).toEqual({ kind: 'advanced', toStage: 'interviewing' });
    expect(kind('Schedule your interview', 'Pick a time: https://app.goodtime.io/x')).toEqual({ kind: 'advanced', toStage: 'interviewing' });
    expect(kind('Congratulations!', 'We are pleased to extend an offer for the Software Engineering Intern position.')).toEqual({ kind: 'advanced', toStage: 'offer' });
  });
  it('reads confirmations, without mistaking a mention of a later assessment for one', () => {
    expect(kind('Thank you for applying to Acme', 'We have received your application. If selected, you may be asked to complete an online assessment.')).toEqual({
      kind: 'applied',
      toStage: 'applied',
    });
  });
  it('ignores job alerts and everything else', () => {
    expect(kind('Software Engineer Intern at Acme', 'Acme is hiring', 'LinkedIn <jobalerts-noreply@linkedin.com>').kind).toBe('other');
    expect(kind('New jobs for you', 'Unfortunately…').kind).toBe('other');
    expect(kind('Lunch?', 'Want to grab lunch?').kind).toBe('other');
  });
});

describe('unwrapForward', () => {
  it('takes the original sender, subject and date from an Outlook forward', () => {
    const m = unwrapForward(
      msg({
        from: 'Hyeonyoung Park <hpa@sfu.ca>',
        subject: 'FW: Your application to Acme',
        date: 99 * DAY,
        body: [
          '',
          '________________________________',
          'From: Acme Recruiting <careers@acme.com>',
          'Sent: Monday, October 12, 2026 3:04 PM',
          'To: Hyeonyoung Park <hpa@sfu.ca>',
          'Subject: Your application to Acme',
          '',
          'Hi Hyeonyoung, unfortunately we will not be moving forward.',
        ].join('\n'),
      }),
    );
    expect(m.from).toBe('Acme Recruiting <careers@acme.com>');
    expect(m.subject).toBe('Your application to Acme');
    expect(new Date(m.date).getFullYear()).toBe(2026);
    expect(m.body).toBe('Hi Hyeonyoung, unfortunately we will not be moving forward.');
  });
  it('reads a Gmail-style forward', () => {
    const m = unwrapForward(
      msg({
        subject: 'Fwd: Interview',
        body: '---------- Forwarded message ---------\nFrom: Jane <jane@beta.io>\nDate: Mon, Oct 12, 2026 at 3:04 PM\nSubject: Interview\nTo: <me@x.com>\n\nLet us schedule an interview.',
      }),
    );
    expect(m.from).toBe('Jane <jane@beta.io>');
    expect(new Date(m.date).getMonth()).toBe(9);
  });
  it('leaves ordinary mail alone', () => {
    const m = msg({ subject: 'Hello', body: 'Some text\nmore\n\nFrom: the team' });
    expect(unwrapForward(m)).toBe(m);
  });
});

describe('matchApplication', () => {
  const apps = [app('a', 'Acme, Inc.', 'Software Engineer Intern'), app('b', 'Shopify', 'Backend Developer Intern'), app('c', 'Shopify', 'Data Science Intern', 'applied', 2 * DAY), app('d', 'Box', 'Intern')];

  it('normalizes company names', () => {
    expect(companyKey('Acme, Inc.')).toBe('acme');
    expect(companyKey('AT&T')).toBe('at and t');
  });
  it('matches on the sender domain or name, even through an ATS', () => {
    expect(matchApplication(msg({ from: 'no-reply@acme.com' }), apps)?.app.id).toBe('a');
    expect(matchApplication(msg({ from: 'Acme Hiring Team <no-reply@us.greenhouse-mail.io>' }), apps)?.app.id).toBe('a');
    expect(matchApplication(msg({ from: 'x@myworkday.com', subject: 'Your Acme application' }), apps)?.app.id).toBe('a');
  });
  it('uses the role to pick between applications at one company', () => {
    const m = matchApplication(msg({ from: 'jobs@shopify.com', subject: 'Backend Developer Intern' }), apps);
    expect(m).toEqual({ app: apps[1], ambiguous: false });
    const vague = matchApplication(msg({ from: 'jobs@shopify.com', subject: 'Your application' }), apps);
    expect(vague).toEqual({ app: apps[2], ambiguous: true });
  });
  it("doesn't trust a short name found only in the body", () => {
    expect(matchApplication(msg({ from: 'x@y.com', body: 'Drop it in the box.' }), apps)).toBeNull();
  });
  it('skips closed applications', () => {
    expect(matchApplication(msg({ from: 'no-reply@acme.com' }), [app('a', 'Acme', 'Intern', 'rejected')])).toBeNull();
  });
});

describe('decide', () => {
  const reject = msg({ id: 'r1', subject: 'Acme update', body: 'Unfortunately, we will not be moving forward with your application.' });

  it('moves the matching application and keeps the email', () => {
    const d = decide(reject, [app('a', 'Acme', 'Intern')], { now: 11 * DAY });
    expect(d.mail).toMatchObject({ id: 'r1', kind: 'rejected', toStage: 'rejected', applicationId: 'a', fromStage: 'applied', status: 'applied', seen: false, via: 'gmail' });
    expect(currentStage(d.app!)).toBe('rejected');
    expect(d.app!.history.at(-1)).toMatchObject({ mailId: 'r1', at: 10 * DAY });
  });
  it('keeps unmatched status emails for review', () => {
    const d = decide(reject, [app('z', 'Zeta', 'Intern')]);
    expect(d.mail?.status).toBe('unmatched');
    expect(d.app).toBeUndefined();
  });
  it('never moves backward', () => {
    const oa = msg({ subject: 'Acme assessment', body: 'Please complete the HackerRank assessment.' });
    expect(decide(oa, [app('a', 'Acme', 'Intern', 'interviewing')]).mail).toBeNull();
    const confirm = msg({ subject: 'Thank you for applying to Acme' });
    expect(decide(confirm, [app('a', 'Acme', 'Intern')]).mail).toBeNull();
    expect(currentStage(decide(confirm, [app('a', 'Acme', 'Intern', 'saved')]).app!)).toBe('applied');
  });
  it('dates the step after the latest one, so it becomes current', () => {
    const d = decide(reject, [app('a', 'Acme', 'Intern', 'applied', 20 * DAY)]);
    expect(currentStage(d.app!)).toBe('rejected');
  });
  it('tells Outlook mail apart', () => {
    expect(decide({ ...reject, to: 'hpa@sfu.ca' }, [app('a', 'Acme', 'Intern')], { outlook: 'HPA@sfu.ca' }).mail?.via).toBe('outlook');
  });
  it('steps through several emails oldest first', () => {
    const later = msg({ id: 'i', date: 12 * DAY, subject: 'Acme interview', body: 'We would like to schedule an interview.' });
    const earlier = msg({ id: 'o', date: 11 * DAY, subject: 'Acme', body: 'Please complete the CodeSignal assessment.' });
    const out = decideAll([later, earlier], [app('a', 'Acme', 'Intern')]);
    expect(out.map((d) => d.mail!.toStage)).toEqual(['screening', 'interviewing']);
    expect(out[1].app!.history.map((e) => e.stage)).toEqual(['saved', 'applied', 'screening', 'interviewing']);
  });
  it('reverts just the email’s step', () => {
    const d = decide(reject, [app('a', 'Acme', 'Intern')]);
    expect(currentStage(withoutMailEvent(d.app!, 'r1'))).toBe('applied');
  });
});

describe('excerpt', () => {
  it('cuts quoted replies and long bodies', () => {
    expect(excerpt('Hello\n\n\n\nthere\nOn Mon, Oct 12, 2026 Jane <j@x.com> wrote:\n> old')).toBe('Hello\n\nthere');
    expect(excerpt('x'.repeat(2000)).length).toBe(1500);
  });
});
