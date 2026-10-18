// Local-preview stand-in for store.ts (swapped in by vite.config.ts in `preview-local` mode).
// Same exports and behaviour, backed by localStorage instead of Firestore.

import { MAIN_SLUG } from '../../data/publicStore';
import { clone, readDb, writeDb } from '../../data/localDb';
import type { Application, ApplicationAnswers, CompanyInfo, ExportRecord, FeedSettings, Lead, Library, MailUpdate, Posting, Profile, ShareLink, StoredPdf, Version } from '../../model/types';
import { currentStage } from '../../applications/model';
import { withMailEvent, withoutMailEvent } from '../../applications/mail';
import { RESERVED, linkPublicDoc, publicDoc, summarizeViews, type ViewStats } from './storeShared';

export { newId, makeSlug, slugProblem, type ViewStats } from './storeShared';

export const loadProfile = async (): Promise<Profile | null> => clone(readDb().profile);
export const saveProfile = async (p: Profile) => writeDb((db) => void (db.profile = clone(p)));
export const loadAnswers = async (): Promise<Partial<ApplicationAnswers> | null> => clone(readDb().answers ?? null);
export const saveAnswers = async (a: ApplicationAnswers) => writeDb((db) => void (db.answers = clone(a)));
export const loadTranscript = async (): Promise<StoredPdf | null> => clone(readDb().transcript ?? null);
export const saveTranscript = async (t: StoredPdf) => writeDb((db) => void (db.transcript = clone(t)));
export const deleteTranscript = async () => writeDb((db) => void delete db.transcript);
export const loadLibrary = async (): Promise<Library | null> => clone(readDb().library);
export const saveLibrary = async (l: Library) => writeDb((db) => void (db.library = clone(l)));

// ---- versions --------------------------------------------------------------

export const listVersions = async (): Promise<Version[]> => clone(Object.values(readDb().versions));
export const getVersion = async (id: string): Promise<Version | null> => clone(readDb().versions[id] ?? null);

export async function saveVersion(v: Version): Promise<void> {
  writeDb((db) => {
    db.versions[v.id] = clone(v);
    if (v.isMain) db.public[MAIN_SLUG] = clone(publicDoc(v, true, null));
    for (const link of Object.values(db.links)) {
      if (link.versionId === v.id) db.public[link.slug] = clone(linkPublicDoc(link, v));
    }
  });
}

export async function deleteVersion(v: Version, links: ShareLink[]): Promise<void> {
  if (v.isMain) throw new Error('Set another version as main before deleting this one.');
  const used = links.filter((l) => l.versionId === v.id);
  if (used.length) {
    throw new Error(`Still used by ${used.map((l) => l.company).join(', ')}. Move or delete those links first.`);
  }
  writeDb((db) => void delete db.versions[v.id]);
}

export async function setMain(target: Version, all: Version[]): Promise<void> {
  writeDb((db) => {
    for (const v of all) if (db.versions[v.id]) db.versions[v.id].isMain = v.id === target.id;
    if (db.versions[target.id]) db.versions[target.id].isMain = true;
    db.public[MAIN_SLUG] = clone(publicDoc(target, true, null));
  });
}

export async function recordExport(id: string, format: ExportRecord['format']): Promise<void> {
  writeDb((db) => void db.versions[id]?.exports.push({ format, at: Date.now() }));
}

// ---- company links ---------------------------------------------------------

export const listLinks = async (): Promise<ShareLink[]> => clone(Object.values(readDb().links));

export async function slugAvailable(slug: string): Promise<boolean> {
  const db = readDb();
  return !RESERVED.has(slug) && !db.public[slug] && !db.links[slug];
}

export async function createLink(link: ShareLink, v: Version): Promise<void> {
  if (!(await slugAvailable(link.slug))) throw new Error(`/${link.slug} is already taken.`);
  await updateLink(link, v);
}

export async function updateLink(link: ShareLink, v: Version): Promise<void> {
  writeDb((db) => {
    db.links[link.slug] = clone(link);
    db.public[link.slug] = clone(linkPublicDoc(link, v));
  });
}

export async function deleteLink(slug: string): Promise<void> {
  writeDb((db) => {
    delete db.links[slug];
    delete db.public[slug];
    delete db.views[slug];
  });
}

export const viewStats = async (slug: string): Promise<ViewStats> => summarizeViews(readDb().views[slug] ?? []);

export async function migrateLegacyLinks(versions: Version[]): Promise<boolean> {
  const legacy = versions.filter((v) => v.slug);
  writeDb((db) => {
    for (const v of legacy) {
      const slug = v.slug!;
      db.links[slug] ??= {
        slug,
        company: v.company || v.name,
        versionId: v.id,
        createdAt: v.updatedAt,
        enabled: !!v.linkEnabled,
        expiresAt: v.expiresAt ?? null,
      };
      const stored = db.versions[v.id];
      if (stored) {
        delete stored.slug;
        delete stored.linkEnabled;
        delete stored.expiresAt;
      }
    }
  });
  return legacy.length > 0;
}

// ---- job applications --------------------------------------------------------

export const listApplications = async (): Promise<Application[]> => clone(Object.values(readDb().applications));
export const getPosting = async (id: string): Promise<Posting | null> => clone(readDb().postings[id] ?? null);

export async function saveApplication(a: Application, posting?: Posting): Promise<void> {
  writeDb((db) => {
    db.applications[a.id] = clone(a);
    if (posting) db.postings[a.id] = clone(posting);
  });
}

export async function deleteApplication(id: string): Promise<void> {
  writeDb((db) => {
    delete db.applications[id];
    delete db.postings[id];
  });
}

// ---- leads -------------------------------------------------------------------

export const listLeads = async (): Promise<Lead[]> => clone(Object.values(readDb().leads));

export async function saveLead(l: Lead): Promise<void> {
  writeDb((db) => void (db.leads[l.id] = clone(l)));
}

export async function saveLeads(leads: Lead[]): Promise<void> {
  writeDb((db) => leads.forEach((l) => (db.leads[l.id] = clone(l))));
}

export const loadFeedSettings = async (): Promise<FeedSettings | null> => clone(readDb().feedSettings ?? null);

export async function saveFeedSettings(s: FeedSettings): Promise<void> {
  writeDb((db) => void (db.feedSettings = clone(s)));
}

// ---- companies -------------------------------------------------------------------

export const listCompanies = async (): Promise<CompanyInfo[]> => clone(Object.values(readDb().companies));

export async function saveCompanies(companies: CompanyInfo[]): Promise<void> {
  writeDb((db) => companies.forEach((c) => (db.companies[c.key] = clone(c))));
}

// ---- status emails -------------------------------------------------------------------

export const listUnseenMail = async (): Promise<MailUpdate[]> => clone(Object.values(readDb().mail).filter((m) => !m.seen));

export async function dismissMail(ids: string[]): Promise<void> {
  writeDb((db) => ids.forEach((id) => db.mail[id] && (db.mail[id].seen = true)));
}

export async function revertMail(m: MailUpdate, app: Application | undefined): Promise<void> {
  writeDb((db) => {
    if (app) db.applications[app.id] = clone(withoutMailEvent(app, m.id));
    db.mail[m.id] = { ...db.mail[m.id], status: 'reverted', seen: true };
  });
}

export async function assignMail(m: MailUpdate, to: Application, from?: Application): Promise<void> {
  writeDb((db) => {
    if (from) db.applications[from.id] = clone(withoutMailEvent(from, m.id));
    db.applications[to.id] = clone(withMailEvent(to, m));
    const { ambiguous: _, ...rest } = db.mail[m.id];
    db.mail[m.id] = { ...rest, applicationId: to.id, fromStage: currentStage(to), status: 'applied', seen: true };
  });
}
