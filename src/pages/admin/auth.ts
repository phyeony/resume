import { GoogleAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithPopup, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { OWNER_EMAIL, app } from '../../firebase';
import type { SessionUser } from './owner';

export const auth = getAuth(app);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

export type { SessionUser } from './owner';

export const watchUser = (cb: (u: SessionUser | null) => void) => onAuthStateChanged(auth, cb);
export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signOutUser = () => signOut(auth);

let gmail: { token: string; until: number } | undefined;

/**
 * A read-only Gmail token, from a sign-in popup the first time and again when it nears its hour.
 * Call it straight from a click, before any await, or the browser blocks the popup.
 */
export async function gmailToken(): Promise<string> {
  if (gmail && Date.now() < gmail.until) return gmail.token;
  if (!auth.currentUser) throw new Error('Sign in first.');
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
  provider.setCustomParameters({ login_hint: OWNER_EMAIL });
  const token = GoogleAuthProvider.credentialFromResult(await reauthenticateWithPopup(auth.currentUser, provider))?.accessToken;
  if (!token) throw new Error("Google didn't grant Gmail access.");
  gmail = { token, until: Date.now() + 50 * 60_000 };
  return token;
}

export const forgetGmailToken = () => {
  gmail = undefined;
};
