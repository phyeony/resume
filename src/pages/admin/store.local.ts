// Local-preview stand-in for store.ts (swapped in by vite.config.ts in `preview-local` mode).
// Same exports and behaviour, backed by localStorage instead of Firestore.

import { MAIN_SLUG } from '../../data/publicStore';
import { clone, readDb, writeDb } from '../../data/localDb';
import type { ExportRecord, Library, Profile, ShareLink, Version } from '../../model/types';
import { RESERVED, linkPublicDoc, publicDoc, summarizeViews, type ViewStats } from './storeShared';

export { newId, makeSlug, slugProblem, type ViewStats } from './storeShared';

export const loadProfile = async (): Promise<Profile | null> => clone(readDb().profile);
export const saveProfile = async (p: Profile) => writeDb((db) => void (db.profile = clone(p)));
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
