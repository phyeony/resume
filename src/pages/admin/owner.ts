// Who may use the editor. Mirrors isOwner() in firestore.rules, which is the real lock:
// this check only decides what the page shows.

import { OWNER_EMAIL } from '../../firebase';

export interface SessionUser {
  email: string | null;
  emailVerified: boolean;
}

export const isOwner = (u: SessionUser): boolean => u.emailVerified && u.email?.toLowerCase() === OWNER_EMAIL;

/** Turns Firebase Auth error codes into something actionable; null = nothing worth showing. */
export function signInErrorMessage(e: unknown): string | null {
  const code = (e as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/popup-blocked':
      return 'The browser blocked the sign-in popup. Allow popups for this site and try again.';
    case 'auth/configuration-not-found':
    case 'auth/operation-not-allowed':
      return 'Google sign-in isn\'t enabled for this Firebase project yet (Firebase console → Authentication → Sign-in method → Google).';
    case 'auth/unauthorized-domain':
      return `${location.hostname} isn't an authorized domain (Firebase console → Authentication → Settings → Authorized domains).`;
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return `Sign-in failed${code ? ` (${code})` : ''}.`;
  }
}
