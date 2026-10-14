import { describe, expect, it } from 'vitest';
import { isOwner, signInErrorMessage } from './owner';

describe('isOwner', () => {
  it('accepts only the verified owner email', () => {
    expect(isOwner({ email: 'phyeony@gmail.com', emailVerified: true })).toBe(true);
    expect(isOwner({ email: 'PHYEONY@gmail.com', emailVerified: true })).toBe(true);
  });
  it('rejects other accounts and unverified emails', () => {
    expect(isOwner({ email: 'someone@gmail.com', emailVerified: true })).toBe(false);
    expect(isOwner({ email: 'phyeony@gmail.com', emailVerified: false })).toBe(false);
    expect(isOwner({ email: null, emailVerified: true })).toBe(false);
  });
});

describe('signInErrorMessage', () => {
  it('stays quiet when the user closes the popup', () => {
    expect(signInErrorMessage({ code: 'auth/popup-closed-by-user' })).toBeNull();
  });
  it('explains a project without Google sign-in', () => {
    expect(signInErrorMessage({ code: 'auth/configuration-not-found' })).toMatch(/isn't enabled/);
  });
});
