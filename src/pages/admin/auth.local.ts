// Local-preview stand-in for auth.ts: you're always the owner, no Google sign-in.

import { OWNER_EMAIL } from '../../firebase';
import type { SessionUser } from './owner';

export type { SessionUser } from './owner';

const owner: SessionUser = { email: OWNER_EMAIL, emailVerified: true };

export function watchUser(cb: (u: SessionUser | null) => void): () => void {
  cb(owner);
  return () => {};
}
export const signIn = async () => {};
export const signOutUser = async () => {};
