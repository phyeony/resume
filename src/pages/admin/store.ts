// All Firestore access lives here. Layout:
//   owner/profile, owner/library        owner-only master data
//   versions/{id}                       owner-only tailored versions (frozen snapshots)
//   public/main, public/{slug}          published copies visitors may `get`
//   public/{slug}/views/{auto}          visit log, create-only for visitors
// Editor-only; visitors go through src/data/publicStore.ts.

import {
  arrayUnion,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { MAIN_SLUG } from '../../data/publicStore';
import type { ExportRecord, Library, Profile, Version } from '../../model/types';
import { db } from './auth';
import { RESERVED, makeSlug, publicDoc, type ViewStats } from './storeShared';

export { newId, makeSlug, type ViewStats } from './storeShared';

// ---- master data -----------------------------------------------------------

export async function loadProfile(): Promise<Profile | null> {
  const snap = await getDoc(doc(db, 'owner', 'profile'));
  return snap.exists() ? (snap.data() as Profile) : null;
}

export const saveProfile = (p: Profile) => setDoc(doc(db, 'owner', 'profile'), p);

export async function loadLibrary(): Promise<Library | null> {
  const snap = await getDoc(doc(db, 'owner', 'library'));
  return snap.exists() ? (snap.data() as Library) : null;
}

export const saveLibrary = (l: Library) => setDoc(doc(db, 'owner', 'library'), l);

// ---- versions --------------------------------------------------------------

export async function listVersions(): Promise<Version[]> {
  const snap = await getDocs(collection(db, 'versions'));
  return snap.docs.map((d) => d.data() as Version);
}

export async function getVersion(id: string): Promise<Version | null> {
  const snap = await getDoc(doc(db, 'versions', id));
  return snap.exists() ? (snap.data() as Version) : null;
}

/** Saves the version and refreshes any public copies it backs (main and/or its link). */
export async function saveVersion(v: Version): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'versions', v.id), v);
  if (v.isMain) batch.set(doc(db, 'public', MAIN_SLUG), publicDoc(v, true, null));
  if (v.slug) batch.set(doc(db, 'public', v.slug), publicDoc(v, !!v.linkEnabled, v.expiresAt ?? null));
  await batch.commit();
}

export async function deleteVersion(v: Version): Promise<void> {
  if (v.isMain) throw new Error('Set another version as main before deleting this one.');
  const batch = writeBatch(db);
  batch.delete(doc(db, 'versions', v.id));
  // The link stops working; its view log stays readable to me under public/{slug}/views.
  if (v.slug) batch.delete(doc(db, 'public', v.slug));
  await batch.commit();
}

export async function setMain(target: Version, all: Version[]): Promise<void> {
  const batch = writeBatch(db);
  for (const v of all) {
    if (v.isMain && v.id !== target.id) batch.update(doc(db, 'versions', v.id), { isMain: false });
  }
  batch.update(doc(db, 'versions', target.id), { isMain: true });
  batch.set(doc(db, 'public', MAIN_SLUG), publicDoc(target, true, null));
  await batch.commit();
}

export const recordExport = (id: string, format: ExportRecord['format']) =>
  updateDoc(doc(db, 'versions', id), { exports: arrayUnion({ format, at: Date.now() }) });

// ---- company links ---------------------------------------------------------

export async function publishLink(v: Version): Promise<Version> {
  let slug = makeSlug(v.company || v.name);
  while (RESERVED.has(slug) || (await getDoc(doc(db, 'public', slug))).exists()) slug = makeSlug(v.company || v.name);
  const next: Version = { ...v, slug, linkEnabled: true, expiresAt: v.expiresAt ?? null, updatedAt: Date.now() };
  await saveVersion(next);
  return next;
}

export async function setLinkState(v: Version, enabled: boolean, expiresAt: number | null): Promise<Version> {
  const next: Version = { ...v, linkEnabled: enabled, expiresAt };
  const batch = writeBatch(db);
  batch.update(doc(db, 'versions', v.id), { linkEnabled: enabled, expiresAt });
  if (v.slug) batch.update(doc(db, 'public', v.slug), { enabled, expiresAt });
  await batch.commit();
  return next;
}

export async function viewStats(slug: string): Promise<ViewStats> {
  const views = collection(db, 'public', slug, 'views');
  const [count, last] = await Promise.all([
    getCountFromServer(views),
    getDocs(query(views, orderBy('at', 'desc'), limit(1))),
  ]);
  const at = last.docs[0]?.data().at as Timestamp | undefined;
  return { count: count.data().count, lastAt: at ? at.toMillis() : null };
}
