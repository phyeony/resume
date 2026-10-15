import { describe, expect, it } from 'vitest';
import { appliedAt, currentStage, newApplication, nextStage, urlKey, waitingDays, withFollowUp } from './model';

const DAY = 86_400_000;

describe('application helpers', () => {
  const a = newApplication('a1', 0);
  a.history.push({ stage: 'screening', at: 20 * DAY }, { stage: 'applied', at: 2 * DAY });

  it('takes the current stage from the latest date, not insertion order', () => {
    expect(currentStage(a)).toBe('screening');
    expect(appliedAt(a)).toBe(2 * DAY);
  });
  it('flags long waits only while waiting', () => {
    expect(waitingDays(a, 40 * DAY)).toBe(20);
    expect(waitingDays(a, 25 * DAY)).toBeNull();
    expect(waitingDays(newApplication('b', 0), 99 * DAY)).toBeNull();
  });
  it('suggests the next stage', () => {
    expect(nextStage('saved')).toBe('applied');
    expect(nextStage('offer')).toBe('offer');
    expect(nextStage('rejected')).toBe('rejected');
  });
});

describe('follow-ups', () => {
  it('restarts the wait without changing the stage', () => {
    const a = newApplication('a', 0);
    a.history.push({ stage: 'applied', at: DAY });
    expect(waitingDays(a, 30 * DAY)).toBe(29);
    const b = withFollowUp(a, 30 * DAY);
    expect(currentStage(b)).toBe('applied');
    expect(appliedAt(b)).toBe(DAY);
    expect(waitingDays(b, 31 * DAY)).toBeNull();
    expect(waitingDays(b, 44 * DAY)).toBe(14);
  });
});

describe('urlKey', () => {
  it('treats the same posting reached different ways as one', () => {
    const k = urlKey('https://jobs.ashbyhq.com/tessera-labs/892bb150');
    expect(urlKey('https://jobs.ashbyhq.com/tessera-labs/892bb150/application?embed=true')).toBe(k);
    expect(urlKey('https://www.jobs.ashbyhq.com/tessera-labs/892bb150/?utm_source=x#apply')).toBe(k);
    expect(urlKey('https://jobs.lever.co/acme/123/apply?lever-source=Simplify')).toBe(urlKey('https://jobs.lever.co/acme/123'));
  });
  it('keeps parameters that pick the job', () => {
    expect(urlKey('https://boards.greenhouse.io/embed/job_app?token=1&for=acme')).toBe('boards.greenhouse.io/embed/job_app?for=acme&token=1');
    expect(urlKey('https://x.com/jobs?id=1')).not.toBe(urlKey('https://x.com/jobs?id=2'));
  });
  it('ignores what is not a URL', () => {
    expect(urlKey('')).toBeNull();
    expect(urlKey('not a url')).toBeNull();
  });
});
