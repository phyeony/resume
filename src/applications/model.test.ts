import { describe, expect, it } from 'vitest';
import { appliedAt, currentStage, newApplication, nextStage, waitingDays } from './model';

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
