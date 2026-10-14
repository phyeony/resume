// Local-preview stand-in for auth.ts: you're always the owner, no Google sign-in.

import type { SessionUser } from './owner';

export type { SessionUser } from './owner';

const owner: SessionUser = { uid: 'local-preview', email: null };

export function watchUser(cb: (u: SessionUser | null) => void): () => void {
  cb(owner);
  return () => {};
}
export const isAdmin = async (_uid: string) => true;
export const signIn = async () => {};
export const signOutUser = async () => {};
