import { describe, expect, it } from 'vitest';
import { signInErrorMessage } from './owner';

describe('signInErrorMessage', () => {
  it('stays quiet when the user closes the popup', () => {
    expect(signInErrorMessage({ code: 'auth/popup-closed-by-user' })).toBeNull();
  });
  it('explains a project without Google sign-in', () => {
    expect(signInErrorMessage({ code: 'auth/configuration-not-found' })).toMatch(/isn't enabled/);
  });
});
