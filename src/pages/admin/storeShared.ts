// Helpers shared by the Firestore store and the local-preview store.

import { MAIN_SLUG } from '../../data/publicStore';
import type { PublicDoc, Version } from '../../model/types';

export function newId(prefix = ''): string {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

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

export function publicDoc(v: Version, enabled: boolean, expiresAt: number | null): PublicDoc {
  return { snapshot: v.snapshot, enabled, expiresAt, versionId: v.id };
}

export interface ViewStats {
  count: number;
  lastAt: number | null;
}
