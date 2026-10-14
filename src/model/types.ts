// Data model shared by the editor, the public pages and every renderer.
//
// Library = the master list I keep adding to.
// Version = a tailored selection from the library, saved with a frozen Snapshot.
// Snapshot = exactly what gets rendered (web, DOCX, PDF). Renderers only ever see a Snapshot.

export type ContactKind = 'linkedin' | 'email' | 'phone' | 'github' | 'location' | 'url';

export interface Contact {
  id: string;
  kind: ContactKind;
  /** Text shown on the resume, e.g. "hyeonyoung-park" or "604-715-2074". */
  label: string;
  /** Optional link target (https:, mailto:, tel:). */
  href?: string;
  /** Pre-checked when a new version is created. */
  isDefault: boolean;
}

export interface Profile {
  name: string;
  contacts: Contact[];
}

export interface SkillItem {
  id: string;
  text: string;
  isDefault: boolean;
}

export interface SkillCategory {
  id: string;
  name: string;
  items: SkillItem[];
}

export type SectionKey = 'skills' | 'work' | 'projects' | 'education';

export const SECTION_TITLES: Record<SectionKey, string> = {
  skills: 'Skills',
  work: 'Work Experience',
  projects: 'Project',
  education: 'Education',
};

export const DEFAULT_SECTION_ORDER: SectionKey[] = ['skills', 'work', 'projects', 'education'];

export type EntrySection = Exclude<SectionKey, 'skills'>;

export interface Bullet {
  id: string;
  /** Supports **bold** inline markup. */
  text: string;
  isDefault: boolean;
}

export interface Entry {
  id: string;
  section: EntrySection;
  /** Role, project name or degree. Bold, left of the date. */
  title: string;
  /** Tech stack shown after the title as "Title | stack" (projects). */
  stack?: string;
  /** Italic line under the title: company, school. */
  org?: string;
  /** Shown right-aligned on the org line, e.g. "GPA: 3.40 / 4.33". */
  orgRight?: string;
  /** Free text so "March 2023" and "May 2019 – December 2027" both work. */
  dates: string;
  bullets: Bullet[];
  isDefault: boolean;
  archived?: boolean;
}

export interface Library {
  skills: SkillCategory[];
  /** Ordered: the order here is the order on the resume within a section. */
  entries: Entry[];
}

export interface Layout {
  sectionOrder: SectionKey[];
  contactIds: string[];
}

/** Which library ids are switched on for a version. */
export interface Selection {
  entryIds: string[];
  bulletIds: string[];
  skillItemIds: string[];
}

// ---- Snapshot: the frozen, fully resolved resume -----------------------------

export interface SnapshotEntry {
  title: string;
  stack?: string;
  org?: string;
  orgRight?: string;
  dates: string;
  bullets: string[];
}

export interface SnapshotSection {
  key: SectionKey;
  title: string;
  /** For skills: one "Category: items" line per category. */
  skills?: { name: string; items: string }[];
  entries?: SnapshotEntry[];
}

export interface Snapshot {
  name: string;
  contacts: Contact[];
  sections: SnapshotSection[];
}

// ---- Versions & public links ---------------------------------------------

export interface ExportRecord {
  format: 'pdf' | 'docx';
  at: number; // epoch ms
}

export interface Version {
  id: string;
  name: string;
  company?: string;
  role?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  isMain: boolean;
  selection: Selection;
  /** bulletId -> reworded text for this version only. */
  overrides: Record<string, string>;
  layout: Layout;
  snapshot: Snapshot;
  exports: ExportRecord[];
  /** Legacy single link per version; moved to links/{slug} on load. */
  slug?: string;
  linkEnabled?: boolean;
  expiresAt?: number | null;
}

/**
 * A shareable page for one company: links/{slug} (owner-only) plus its published copy
 * public/{slug}. Several links can show the same version; a link follows its version's edits.
 */
export interface ShareLink {
  slug: string;
  /** Who it was sent to, e.g. "Amazon". */
  company: string;
  note?: string;
  versionId: string;
  createdAt: number;
  enabled: boolean;
  expiresAt: number | null;
}

/** One logged visit: public/{slug}/views/{auto}. */
export interface ViewRecord {
  at: number; // epoch ms
  /** Random id kept in the visitor's browser, to count distinct visitors. */
  visitor?: string;
  /** Looked automated (link scanner, crawler, headless browser). */
  bot?: boolean;
}

/** What visitors can read: public/{slug} and public/main. */
export interface PublicDoc {
  snapshot: Snapshot;
  enabled: boolean;
  expiresAt: number | null;
  versionId: string;
}
