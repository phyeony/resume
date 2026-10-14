import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { app } from '../../firebase';
import type { SessionUser } from './owner';

export const auth = getAuth(app);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

export type { SessionUser } from './owner';

export const watchUser = (cb: (u: SessionUser | null) => void) => onAuthStateChanged(auth, cb);
export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signOutUser = () => signOut(auth);
