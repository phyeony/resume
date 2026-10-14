// Local preview backend (`npm run local`): the whole "database" is one JSON blob in
// localStorage, so the editor and public pages work without Firebase. Never in a real build.

import type { Library, Profile, PublicDoc, ShareLink, Version, ViewRecord } from '../model/types';

export interface LocalDb {
  profile: Profile | null;
  library: Library | null;
  versions: Record<string, Version>;
  links: Record<string, ShareLink>;
  public: Record<string, PublicDoc>;
  views: Record<string, ViewRecord[]>;
}

const KEY = 'resume-studio:local-db';

export function readDb(): LocalDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as LocalDb;
      db.links ??= {};
      // earlier previews stored bare timestamps
      for (const k of Object.keys(db.views)) {
        db.views[k] = db.views[k].map((v) => (typeof v === 'number' ? { at: v } : v));
      }
      return db;
    }
  } catch {
    // fall through to an empty db
  }
  return { profile: null, library: null, versions: {}, links: {}, public: {}, views: {} };
}

/** Applies `fn` and saves. JSON round-trip drops undefined fields, like Firestore does. */
export function writeDb(fn: (db: LocalDb) => void): void {
  const db = readDb();
  fn(db);
  localStorage.setItem(KEY, JSON.stringify(db));
}

/** Copy out, so callers can't mutate stored state by accident. */
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
