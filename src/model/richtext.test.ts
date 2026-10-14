import { describe, expect, it } from 'vitest';
import { parseRich, plain } from './richtext';

describe('parseRich', () => {
  it('splits bold segments', () => {
    expect(parseRich('by **90%** faster')).toEqual([
      { text: 'by ', bold: false },
      { text: '90%', bold: true },
      { text: ' faster', bold: false },
    ]);
  });
  it('leaves an unmatched marker literal', () => {
    expect(plain('a **b')).toBe('a **b');
    expect(parseRich('a **b').every((r) => !r.bold)).toBe(true);
  });
  it('handles leading bold', () => {
    expect(parseRich('**Courses:** OS')[0]).toEqual({ text: 'Courses:', bold: true });
  });
});
