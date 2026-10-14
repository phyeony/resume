import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, initializeFirestore } from 'firebase/firestore';
import { app } from '../../firebase';
import type { SessionUser } from './owner';

export const auth = getAuth(app);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

export type { SessionUser } from './owner';

export const watchUser = (cb: (u: SessionUser | null) => void) => onAuthStateChanged(auth, cb);
export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signOutUser = () => signOut(auth);

/** True when admins/{uid} exists — the same test firestore.rules uses for every owner read/write. */
export async function isAdmin(uid: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, 'admins', uid))).exists();
  } catch {
    return false; // rules deny the read when the doc isn't there
  }
}
