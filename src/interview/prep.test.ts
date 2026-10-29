import { describe, expect, it } from 'vitest';
import { ALL_KEYS, BEHAVIOURAL, STORIES, gapCount, splitGaps } from './prep';

describe('interview prep', () => {
  it('uses each key once', () => {
    expect(new Set(ALL_KEYS).size).toBe(ALL_KEYS.length);
  });

  it('points questions at real stories', () => {
    const keys = new Set(STORIES.map((s) => s.key));
    for (const q of BEHAVIOURAL) for (const k of q.stories) expect(keys).toContain(k);
  });

  it('splits out the gaps to fill in', () => {
    expect(splitGaps('Cut it [fill: by how much] last year')).toEqual([
      { text: 'Cut it ', gap: false },
      { text: 'by how much', gap: true },
      { text: ' last year', gap: false },
    ]);
    expect(splitGaps('no gaps')).toEqual([{ text: 'no gaps', gap: false }]);
  });

  it('counts gaps per story', () => {
    const s = { ...STORIES[0], situation: '[fill: a]', task: 't', action: ['[fill: b] and [fill: c]'], result: 'r', followUps: [] };
    expect(gapCount(s)).toBe(3);
  });
});
