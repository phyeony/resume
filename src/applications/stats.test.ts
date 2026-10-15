import { describe, expect, it } from 'vitest';
import type { Application, StageEvent } from '../model/types';
import { newApplication } from './model';
import { appliedPerWeek, bySource, NO_SOURCE, weekStart } from './stats';

const DAY = 86_400_000;
// Monday, 2026-10-12, local time
const MON = new Date(2026, 9, 12).getTime();

function app(source: string | undefined, ...history: StageEvent[]): Application {
  const a = newApplication(`a${Math.random()}`, MON - 60 * DAY);
  return { ...a, source, history: [...a.history, ...history] };
}

describe('weekStart', () => {
  it('goes back to Monday midnight', () => {
    expect(weekStart(MON)).toBe(MON);
    expect(weekStart(MON + 6 * DAY + 3600_000)).toBe(MON);
    expect(weekStart(MON - 1)).toBe(new Date(2026, 9, 5).getTime());
  });
});

describe('appliedPerWeek', () => {
  it('counts first-applied dates into weeks ending this week', () => {
    const apps = [
      app('A', { stage: 'applied', at: MON + DAY }),
      app('A', { stage: 'applied', at: MON + 2 * DAY }),
      app('A', { stage: 'applied', at: MON - 3 * DAY }),
      app('A', { stage: 'applied', at: MON - 90 * DAY }), // too old
      app('A'), // never applied
    ];
    const w = appliedPerWeek(apps, 3, MON + 3 * DAY);
    expect(w.map((r) => r.count)).toEqual([0, 1, 2]);
    expect(w[2].week).toBe(MON);
  });
});

describe('bySource', () => {
  it('counts answers, interviews and offers per source', () => {
    const t = MON;
    const rows = bySource([
      app('LinkedIn', { stage: 'applied', at: t }, { stage: 'rejected', at: t + 4 * DAY }),
      app('LinkedIn', { stage: 'applied', at: t }),
      app('Referral', { stage: 'applied', at: t }, { stage: 'screening', at: t + 2 * DAY }, { stage: 'interviewing', at: t + 9 * DAY }, { stage: 'offer', at: t + 20 * DAY }),
      app(undefined, { stage: 'applied', at: t }),
      app('LinkedIn'), // saved only: not counted
    ]);
    expect(rows).toEqual([
      { source: 'LinkedIn', applied: 2, replied: 1, interviews: 0, offers: 0, medianReplyDays: 4 },
      { source: NO_SOURCE, applied: 1, replied: 0, interviews: 0, offers: 0, medianReplyDays: null },
      { source: 'Referral', applied: 1, replied: 1, interviews: 1, offers: 1, medianReplyDays: 2 },
    ]);
  });
});
