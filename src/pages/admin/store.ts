// All Firestore access lives here. Layout:
//   owner/profile, owner/library        owner-only master data
//   owner/leadFeeds                     owner-only lead import settings
//   owner/answers                       owner-only answer bank for application forms
//   versions/{id}                       owner-only tailored versions (frozen snapshots)
//   links/{slug}                        owner-only company links, each pointing at a version
//   public/main, public/{slug}          published copies visitors may `get`
//   public/{slug}/views/{auto}          visit log, create-only for visitors
//   applications/{id}, postings/{id}    owner-only job applications and their captured postings
//   leads/{id}                          owner-only jobs worth a look, before applying
//   companies/{key}                     owner-only stars, hiding and Wikipedia fame per company
// Editor-only; visitors go through src/data/publicStore.ts.

import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { MAIN_SLUG } from '../../data/publicStore';
import type { Application, ApplicationAnswers, CompanyInfo, ExportRecord, FeedSettings, Lead, Library, Posting, Profile, ShareLink, Version } from '../../model/types';
import { db } from './auth';
import { RESERVED, linkPublicDoc, publicDoc, summarizeViews, type ViewStats } from './storeShared';

export { newId, makeSlug, slugProblem, type ViewStats } from './storeShared';

// ---- master data -----------------------------------------------------------

export async function loadProfile(): Promise<Profile | null> {
  const snap = await getDoc(doc(db, 'owner', 'profile'));
  return snap.exists() ? (snap.data() as Profile) : null;
}

export const saveProfile = (p: Profile) => setDoc(doc(db, 'owner', 'profile'), p);

export async function loadAnswers(): Promise<Partial<ApplicationAnswers> | null> {
  const snap = await getDoc(doc(db, 'owner', 'answers'));
  return snap.exists() ? (snap.data() as Partial<ApplicationAnswers>) : null;
}

export const saveAnswers = (a: ApplicationAnswers) => setDoc(doc(db, 'owner', 'answers'), a);

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

/** Saves the version and refreshes every public copy it backs: main and its company links. */
export async function saveVersion(v: Version): Promise<void> {
  const links = await getDocs(query(collection(db, 'links'), where('versionId', '==', v.id)));
  const batch = writeBatch(db);
  batch.set(doc(db, 'versions', v.id), v);
  if (v.isMain) batch.set(doc(db, 'public', MAIN_SLUG), publicDoc(v, true, null));
  for (const d of links.docs) batch.set(doc(db, 'public', d.id), linkPublicDoc(d.data() as ShareLink, v));
  await batch.commit();
}

/** Refuses while links still show this version, so a link you sent never breaks silently. */
export async function deleteVersion(v: Version, links: ShareLink[]): Promise<void> {
  if (v.isMain) throw new Error('Set another version as main before deleting this one.');
  const used = links.filter((l) => l.versionId === v.id);
  if (used.length) {
    throw new Error(`Still used by ${used.map((l) => l.company).join(', ')}. Move or delete those links first.`);
  }
  await writeBatch(db).delete(doc(db, 'versions', v.id)).commit();
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

export async function listLinks(): Promise<ShareLink[]> {
  const snap = await getDocs(collection(db, 'links'));
  return snap.docs.map((d) => d.data() as ShareLink);
}

export async function slugAvailable(slug: string): Promise<boolean> {
  if (RESERVED.has(slug)) return false;
  const [pub, link] = await Promise.all([getDoc(doc(db, 'public', slug)), getDoc(doc(db, 'links', slug))]);
  return !pub.exists() && !link.exists();
}

export async function createLink(link: ShareLink, v: Version): Promise<void> {
  if (!(await slugAvailable(link.slug))) throw new Error(`/${link.slug} is already taken.`);
  const batch = writeBatch(db);
  batch.set(doc(db, 'links', link.slug), link);
  batch.set(doc(db, 'public', link.slug), linkPublicDoc(link, v));
  await batch.commit();
}

/** Applies edits (on/off, expiry, company, or which version it shows) to the link and its public copy. */
export async function updateLink(link: ShareLink, v: Version): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'links', link.slug), link);
  batch.set(doc(db, 'public', link.slug), linkPublicDoc(link, v));
  await batch.commit();
}

/** Removes the link, its public page and its view history. */
export async function deleteLink(slug: string): Promise<void> {
  const views = await getDocs(collection(db, 'public', slug, 'views'));
  // batches hold 500 writes
  for (let i = 0; i < views.docs.length; i += 450) {
    const batch = writeBatch(db);
    for (const d of views.docs.slice(i, i + 450)) batch.delete(d.ref);
    await batch.commit();
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, 'links', slug));
  batch.delete(doc(db, 'public', slug));
  await batch.commit();
}

export async function viewStats(slug: string): Promise<ViewStats> {
  const snap = await getDocs(collection(db, 'public', slug, 'views'));
  return summarizeViews(
    snap.docs.map((d) => {
      const v = d.data() as { at?: Timestamp; visitor?: string; bot?: boolean };
      return { at: v.at?.toMillis() ?? 0, visitor: v.visitor || undefined, bot: v.bot };
    }),
  );
}

/** Earlier builds kept one link on the version itself; give each its own links/{slug}. */
export async function migrateLegacyLinks(versions: Version[]): Promise<boolean> {
  const legacy = versions.filter((v) => v.slug);
  for (const v of legacy) {
    const slug = v.slug!;
    const batch = writeBatch(db);
    if (!(await getDoc(doc(db, 'links', slug))).exists()) {
      const link: ShareLink = {
        slug,
        company: v.company || v.name,
        versionId: v.id,
        createdAt: v.updatedAt,
        enabled: !!v.linkEnabled,
        expiresAt: v.expiresAt ?? null,
      };
      batch.set(doc(db, 'links', slug), link);
    }
    batch.update(doc(db, 'versions', v.id), { slug: deleteField(), linkEnabled: deleteField(), expiresAt: deleteField() });
    await batch.commit();
  }
  return legacy.length > 0;
}

// ---- job applications --------------------------------------------------------

export async function listApplications(): Promise<Application[]> {
  const snap = await getDocs(collection(db, 'applications'));
  return snap.docs.map((d) => d.data() as Application);
}

export async function getPosting(id: string): Promise<Posting | null> {
  const snap = await getDoc(doc(db, 'postings', id));
  return snap.exists() ? (snap.data() as Posting) : null;
}

/** Saves the application, and its captured posting when one is given (first capture or re-capture). */
export async function saveApplication(a: Application, posting?: Posting): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'applications', a.id), a);
  if (posting) batch.set(doc(db, 'postings', a.id), posting);
  await batch.commit();
}

export async function deleteApplication(id: string): Promise<void> {
  await writeBatch(db).delete(doc(db, 'applications', id)).delete(doc(db, 'postings', id)).commit();
}

// ---- leads -------------------------------------------------------------------

export async function listLeads(): Promise<Lead[]> {
  const snap = await getDocs(collection(db, 'leads'));
  return snap.docs.map((d) => d.data() as Lead);
}

export const saveLead = (l: Lead) => setDoc(doc(db, 'leads', l.id), l);

/** Many at once, e.g. an import. */
export async function saveLeads(leads: Lead[]): Promise<void> {
  // batches hold 500 writes
  for (let i = 0; i < leads.length; i += 450) {
    const batch = writeBatch(db);
    for (const l of leads.slice(i, i + 450)) batch.set(doc(db, 'leads', l.id), l);
    await batch.commit();
  }
}

export async function loadFeedSettings(): Promise<FeedSettings | null> {
  const snap = await getDoc(doc(db, 'owner', 'leadFeeds'));
  return snap.exists() ? (snap.data() as FeedSettings) : null;
}

export const saveFeedSettings = (s: FeedSettings) => setDoc(doc(db, 'owner', 'leadFeeds'), s);

// ---- companies -------------------------------------------------------------------

export async function listCompanies(): Promise<CompanyInfo[]> {
  const snap = await getDocs(collection(db, 'companies'));
  return snap.docs.map((d) => d.data() as CompanyInfo);
}

export async function saveCompanies(companies: CompanyInfo[]): Promise<void> {
  for (let i = 0; i < companies.length; i += 450) {
    const batch = writeBatch(db);
    for (const c of companies.slice(i, i + 450)) batch.set(doc(db, 'companies', c.key), c);
    await batch.commit();
  }
}
