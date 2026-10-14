// Local-preview stand-in for publicStore.ts (swapped in by vite.config.ts in `preview-local` mode).

import type { PublicDoc } from '../model/types';
import { clone, readDb, writeDb } from './localDb';

export const MAIN_SLUG = 'main';

/** Same visibility as firestore.rules: missing, disabled or expired reads as null. */
export async function getPublic(slug: string): Promise<PublicDoc | null> {
  const d = readDb().public[slug];
  if (!d || !d.enabled || (d.expiresAt != null && d.expiresAt <= Date.now())) return null;
  return clone(d);
}

export async function logView(slug: string): Promise<void> {
  writeDb((db) => void (db.views[slug] ??= []).push(Date.now()));
}
