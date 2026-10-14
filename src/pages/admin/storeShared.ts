// Helpers shared by the Firestore store and the local-preview store.

import { MAIN_SLUG } from '../../data/publicStore';
import type { PublicDoc, ShareLink, Version, ViewRecord } from '../../model/types';

export function newId(prefix = ''): string {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

/** `<company>-<4 random chars>`: readable, but not guessable from the company name alone. */
export function makeSlug(company: string): string {
  const base =
    company
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'resume';
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 4).padEnd(4, '0');
  return `${base}-${suffix}`;
}

/** Slugs that would collide with app routes. */
export const RESERVED = new Set([MAIN_SLUG, 'admin', 'assets', 'index']);

/** Problem with a hand-edited slug, or null when it's usable (availability is checked separately). */
export function slugProblem(slug: string): string | null {
  if (slug.length < 3 || slug.length > 60) return 'Use 3–60 characters.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return 'Use lowercase letters, numbers and single dashes.';
  if (RESERVED.has(slug)) return 'That address is reserved.';
  return null;
}

export function publicDoc(v: Version, enabled: boolean, expiresAt: number | null): PublicDoc {
  return { snapshot: v.snapshot, enabled, expiresAt, versionId: v.id };
}

export const linkPublicDoc = (link: ShareLink, v: Version): PublicDoc => publicDoc(v, link.enabled, link.expiresAt);

export interface ViewStats {
  /** Visits that looked human. */
  views: number;
  /** Distinct browsers among those. */
  visitors: number;
  /** Visits that looked automated (email link scanners, crawlers). */
  bots: number;
  lastAt: number | null;
}

export function summarizeViews(views: ViewRecord[]): ViewStats {
  const human = views.filter((v) => !v.bot);
  return {
    views: human.length,
    visitors: new Set(human.map((v, i) => v.visitor ?? `anon-${i}`)).size,
    bots: views.length - human.length,
    lastAt: human.length ? Math.max(...human.map((v) => v.at)) : null,
  };
}
