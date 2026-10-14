import { describe, expect, it } from 'vitest';
import { looksAutomated } from '../../data/visit';
import { slugProblem, summarizeViews } from './storeShared';

describe('summarizeViews', () => {
  it('separates people from bots and counts distinct visitors', () => {
    const s = summarizeViews([
      { at: 1, visitor: 'a' },
      { at: 5, visitor: 'a' },
      { at: 3, visitor: 'b' },
      { at: 9, visitor: 'c', bot: true },
    ]);
    expect(s).toEqual({ views: 3, visitors: 2, bots: 1, lastAt: 5 });
  });
  it('counts visits without an id as separate visitors', () => {
    expect(summarizeViews([{ at: 1 }, { at: 2 }]).visitors).toBe(2);
  });
  it('handles no views', () => {
    expect(summarizeViews([])).toEqual({ views: 0, visitors: 0, bots: 0, lastAt: null });
  });
});

describe('slugProblem', () => {
  it('accepts normal slugs', () => {
    expect(slugProblem('amazon-x7k2')).toBeNull();
  });
  it('rejects bad or reserved slugs', () => {
    expect(slugProblem('Amazon')).not.toBeNull();
    expect(slugProblem('a--b')).not.toBeNull();
    expect(slugProblem('ab')).not.toBeNull();
    expect(slugProblem('admin')).not.toBeNull();
  });
});

describe('looksAutomated', () => {
  it('flags scanners, unfurlers and headless browsers', () => {
    expect(looksAutomated('Mozilla/5.0 (compatible; Googlebot/2.1)', false)).toBe(true);
    expect(looksAutomated('Mozilla/5.0 HeadlessChrome/120.0', false)).toBe(true);
    expect(looksAutomated('LinkedInBot/1.0', false)).toBe(true);
    expect(looksAutomated('Mozilla/5.0 (Macintosh) Chrome/130.0 Safari/537.36', true)).toBe(true);
  });
  it('passes ordinary browsers', () => {
    expect(looksAutomated('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', false)).toBe(false);
  });
});
