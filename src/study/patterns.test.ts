import { describe, expect, it } from 'vitest';
import { ALL_PROBLEMS, CHEAT_SHEET, PATTERNS, WEEKS, nextProblem, problemUrl } from './patterns';

describe('study plan', () => {
  it('lists each problem once', () => {
    const ids = ALL_PROBLEMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points cheat sheet rows and weeks at real patterns', () => {
    const keys = new Set(PATTERNS.map((p) => p.key));
    for (const row of CHEAT_SHEET) expect(keys).toContain(row.pattern);
    for (const w of WEEKS) for (const k of w.patterns) expect(keys).toContain(k);
  });

  it('suggests the first unsolved problem in plan order', () => {
    expect(nextProblem(new Set())?.problem.id).toBe(217);
    expect(nextProblem(new Set([217, 242]))?.problem.id).toBe(1);
    const firstPattern = PATTERNS[0].problems.map((p) => p.id);
    expect(nextProblem(new Set(firstPattern))?.pattern.key).toBe(PATTERNS[1].key);
    expect(nextProblem(new Set(ALL_PROBLEMS.map((p) => p.id)))).toBeNull();
  });

  it('builds LeetCode links from slugs', () => {
    expect(problemUrl(ALL_PROBLEMS[0])).toBe('https://leetcode.com/problems/contains-duplicate/');
  });
});
