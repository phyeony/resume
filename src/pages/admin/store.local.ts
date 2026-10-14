// Local-preview stand-in for store.ts (swapped in by vite.config.ts in `preview-local` mode).
// Same exports and behaviour, backed by localStorage instead of Firestore.

import { MAIN_SLUG } from '../../data/publicStore';
import { clone, readDb, writeDb } from '../../data/localDb';
import type { ExportRecord, Library, Profile, Version } from '../../model/types';
import { RESERVED, makeSlug, publicDoc, type ViewStats } from './storeShared';

export { newId, makeSlug, type ViewStats } from './storeShared';

export const loadProfile = async (): Promise<Profile | null> => clone(readDb().profile);
export const saveProfile = async (p: Profile) => writeDb((db) => void (db.profile = clone(p)));
export const loadLibrary = async (): Promise<Library | null> => clone(readDb().library);
export const saveLibrary = async (l: Library) => writeDb((db) => void (db.library = clone(l)));

export const listVersions = async (): Promise<Version[]> => clone(Object.values(readDb().versions));
export const getVersion = async (id: string): Promise<Version | null> => clone(readDb().versions[id] ?? null);

export async function saveVersion(v: Version): Promise<void> {
  writeDb((db) => {
    db.versions[v.id] = clone(v);
    if (v.isMain) db.public[MAIN_SLUG] = clone(publicDoc(v, true, null));
    if (v.slug) db.public[v.slug] = clone(publicDoc(v, !!v.linkEnabled, v.expiresAt ?? null));
  });
}

export async function deleteVersion(v: Version): Promise<void> {
  if (v.isMain) throw new Error('Set another version as main before deleting this one.');
  writeDb((db) => {
    delete db.versions[v.id];
    if (v.slug) delete db.public[v.slug];
  });
}

export async function setMain(target: Version, all: Version[]): Promise<void> {
  writeDb((db) => {
    for (const v of all) if (db.versions[v.id]) db.versions[v.id].isMain = v.id === target.id;
    db.public[MAIN_SLUG] = clone(publicDoc(target, true, null));
  });
}

export async function recordExport(id: string, format: ExportRecord['format']): Promise<void> {
  writeDb((db) => void db.versions[id]?.exports.push({ format, at: Date.now() }));
}

export async function publishLink(v: Version): Promise<Version> {
  const taken = readDb().public;
  let slug = makeSlug(v.company || v.name);
  while (RESERVED.has(slug) || taken[slug]) slug = makeSlug(v.company || v.name);
  const next: Version = { ...v, slug, linkEnabled: true, expiresAt: v.expiresAt ?? null, updatedAt: Date.now() };
  await saveVersion(next);
  return next;
}

export async function setLinkState(v: Version, enabled: boolean, expiresAt: number | null): Promise<Version> {
  writeDb((db) => {
    const stored = db.versions[v.id];
    if (stored) Object.assign(stored, { linkEnabled: enabled, expiresAt });
    const pub = v.slug ? db.public[v.slug] : undefined;
    if (pub) Object.assign(pub, { enabled, expiresAt });
  });
  return { ...v, linkEnabled: enabled, expiresAt };
}

export async function viewStats(slug: string): Promise<ViewStats> {
  const views = readDb().views[slug] ?? [];
  return { count: views.length, lastAt: views.length ? Math.max(...views) : null };
}
