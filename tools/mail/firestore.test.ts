import { describe, expect, it } from 'vitest';
import { fromFields, toFields } from './firestore';

describe('Firestore REST values', () => {
  it('round-trips an application history', () => {
    const o = { history: [{ stage: 'applied', at: 1760000000000, note: 'Email: x', mailId: 'abc' }], updatedAt: 1760000000001, ratio: 0.5, seen: false, gone: null };
    const f = toFields(o);
    expect(f.updatedAt).toEqual({ integerValue: '1760000000001' });
    expect(f.ratio).toEqual({ doubleValue: 0.5 });
    expect(fromFields(f)).toEqual(o);
  });
  it('leaves out undefined fields', () => {
    expect(toFields({ a: 1, b: undefined })).toEqual({ a: { integerValue: '1' } });
  });
});
