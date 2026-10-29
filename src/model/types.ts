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
  projects: 'Projects',
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
  /** Project address as typed, e.g. "goshiwonseoul.com"; shown after the stack as a link. */
  url?: string;
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
  /** Full https: address; renderers show it via linkLabel(). */
  url?: string;
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

// ---- Job applications ------------------------------------------------------

export type Stage = 'saved' | 'applied' | 'screening' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn' | 'ghosted';

export const STAGES: Stage[] = ['saved', 'applied', 'screening', 'interviewing', 'offer', 'rejected', 'withdrawn', 'ghosted'];

export const STAGE_LABELS: Record<Stage, string> = {
  saved: 'Saved',
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  ghosted: 'Ghosted',
};

/** Stages that end an application. */
export const CLOSED_STAGES: Stage[] = ['rejected', 'withdrawn', 'ghosted'];

export interface StageEvent {
  stage: Stage;
  at: number; // epoch ms
  note?: string;
  /** Set when an email moved the application here (mail/{id}), so the change can be reverted. */
  mailId?: string;
}

/** What a status email says: turned down, moved on (assessment, interview, offer), or application received. */
export type MailKind = 'rejected' | 'advanced' | 'applied';

/**
 * A status email the daily mail job found: mail/{gmail message id}. Only emails that read as a status
 * change are kept, as a short excerpt. Written by tools/mail (Apps Script), reviewed in Applications.
 */
export interface MailUpdate {
  id: string;
  /** When the email was sent; for forwarded mail, the original's date. */
  receivedAt: number;
  /** Original sender, "Name <address>". */
  from: string;
  subject: string;
  excerpt: string;
  /** The inbox it came from: Gmail, or the school Outlook redirected into Gmail. */
  via: 'gmail' | 'outlook';
  kind: MailKind;
  toStage: Stage;
  /** The application it moved; absent when no tracked application matched. */
  applicationId?: string;
  fromStage?: Stage;
  /** Several applications could fit; the most recent was picked. */
  ambiguous?: boolean;
  status: 'applied' | 'unmatched' | 'reverted';
  /** Dismissed from the alerts. */
  seen: boolean;
  processedAt: number;
}

export type SalaryPeriod = 'hour' | 'day' | 'week' | 'month' | 'year';

export interface Salary {
  /** As shown and edited, e.g. "$120,000 – $150,000 CAD / year". */
  text: string;
  min?: number;
  max?: number;
  currency?: string;
  period?: SalaryPeriod;
}

export type WorkMode = 'remote' | 'hybrid' | 'onsite';

/** The short version of a posting. Filled by a Summarizer, then corrected by hand. */
export interface PostingSummary {
  location?: string;
  workMode?: WorkMode;
  salary?: Salary;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  benefits: string[];
  /** What filled it: "rules", later e.g. "ai:<model>". */
  filledBy: string;
}

/**
 * The exact posting as captured: postings/{applicationId}. Written once, so it survives the company
 * taking the posting down; replaced only by an explicit re-capture.
 */
export interface Posting {
  /** Sanitized HTML: headings, paragraphs, lists, bold/italic, links. Wording untouched. */
  html: string;
  text: string;
  capturedAt: number;
  /** How the block was found: "json-ld", "known:<site>", "scored", "text". */
  method: string;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  /** The posting's address. */
  url?: string;
  /** Oldest first; the last entry is the current stage. */
  history: StageEvent[];
  /** Company link sent with this application. */
  linkSlug?: string;
  /** Version sent as a file, when there's no link. */
  versionId?: string;
  notes?: string;
  /** Where the job was found: "LinkedIn", "Simplify", "Referral"… */
  source?: string;
  summary: PostingSummary;
  hasPosting: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---- Application answers (autofill) ----------------------------------------------

/** Work status for one country. Questions usually name it: "authorized to work in the United States?". */
export interface WorkAuth {
  id: string;
  /** "Canada", "United States", "Germany"…; "*" = any country not listed, or none named. */
  country: string;
  /** "Yes" / "No" as you'd answer it. */
  authorized: string;
  sponsorship: string;
  /** For your own reference, e.g. "Working Holiday visa". Not filled into forms. */
  note?: string;
}

/** A question the standard fields don't cover: forms whose question contains `pattern` get `answer`. */
export interface CustomAnswer {
  id: string;
  /** Words from the question, e.g. "how did you hear". Case doesn't matter. */
  pattern: string;
  answer: string;
}

/**
 * What job application forms ask every time: owner/answers. Owner-only, never in the repo; travels to
 * the autofill tools inside a downloaded apply kit.
 */
export interface ApplicationAnswers {
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  linkedin: string;
  github: string;
  website: string;
  school: string;
  degree: string;
  major: string;
  /** As you'd type it, e.g. "May 2027". */
  graduation: string;
  startDate: string;
  salary: string;
  pronouns: string;
  gender: string;
  race: string;
  hispanic: string;
  veteran: string;
  disability: string;
  workAuth: WorkAuth[];
  custom: CustomAnswer[];
  /** Version in the last downloaded kit; "Applied" on a lead records it as the resume sent. */
  kitVersionId?: string;
}

/** The file the autofill tools read: answers plus the resume PDF. */
export interface ApplyKit {
  kind: 'resume-studio-apply-kit';
  format: 1;
  createdAt: number;
  answers: ApplicationAnswers;
  resume: { versionId: string; versionName: string; fileName: string; pdfBase64: string };
  /** Absent in kits from before transcripts, and when none is uploaded. */
  transcript?: { fileName: string; pdfBase64: string };
  /** The version's work entries, for forms that ask for each job (Workday). Absent in older kits. */
  experience?: KitJob[];
}

/** A work entry the way application forms ask for it. Months are 1–12; a date that didn't parse is left out. */
export interface KitJob {
  title: string;
  company: string;
  location: string;
  startMonth?: number;
  startYear?: number;
  endMonth?: number;
  endYear?: number;
  /** "– Present": no end date, and "I currently work here" ticked. */
  current: boolean;
  /** The bullets, one "• " line each, without markdown. */
  description: string;
}

/** A PDF kept in Firestore itself (owner/transcript): the free plan has no file storage for new projects. */
export interface StoredPdf {
  fileName: string;
  pdfBase64: string;
  uploadedAt: number;
}

// ---- Leads ---------------------------------------------------------------------

/** new: not looked at yet · dismissed: not for me · tracked: became an application. */
export type LeadStatus = 'new' | 'dismissed' | 'tracked';

/** faang, quant: SpeedyApply's tables. hot: marked 🔥 on hanzili's Canadian list. */
export type LeadTier = 'faang' | 'quant' | 'hot';

export const TIER_LABELS: Record<LeadTier, string> = { faang: 'FAANG+', quant: 'Quant', hot: '🔥 Hot' };

/** Which tier wins when lists disagree, and how tiers sort. */
export const TIER_RANK: Record<LeadTier, number> = { faang: 3, quant: 2, hot: 1 };

/**
 * A job worth a look, before deciding to apply: leads/{id}. Cheap to add (no captured posting), so a
 * feed can drop in many; "Track" turns one into an application.
 */
export interface Lead {
  id: string;
  company: string;
  role: string;
  url: string;
  location?: string;
  /** As the source shows it, e.g. "$55/hr". */
  salary?: string;
  /** How a list rates the company: SpeedyApply's FAANG+ or Quant table, or hanzili's 🔥. */
  tier?: LeadTier;
  /** The company's own website, when the source gives it; helps find its Wikipedia article. */
  companySite?: string;
  /** Where it was found, carried over to the application. */
  source: string;
  /** Its id in the source's feed, so a re-import skips it. */
  sourceId?: string;
  postedAt?: number;
  addedAt: number;
  status: LeadStatus;
  applicationId?: string;
}

/** What "Import" pulls into leads: owner/leadFeeds. */
export interface FeedSettings {
  /** Enabled feed ids (see FEEDS in src/applications/feeds.ts). */
  feeds: string[];
  /** Categories to keep, for lists that have them; empty keeps all. */
  categories: string[];
  /** Terms to keep, e.g. "Summer 2027", for jobs that name one; empty keeps all. */
  terms: string[];
  /** Skip jobs posted longer ago than this. */
  maxAgeDays: number;
  /** Comma-separated words; the title must contain one. Empty keeps all. */
  include: string;
  /** Comma-separated words; a title containing one is skipped. */
  exclude: string;
  /** Comma-separated places; a location must contain one. Empty keeps all. */
  locations: string;
  /** Best match: comma-separated title words that rank a lead higher. */
  prefer: string;
  /** Best match: comma-separated places that rank a lead higher. */
  preferPlaces: string;
  lastImportAt?: number;
}

/**
 * What's known about a company across its leads: companies/{key}, key = lowercased letters and digits
 * of the name. Starred and hidden are the owner's; the rest comes from Wikipedia.
 */
export interface CompanyInfo {
  key: string;
  name: string;
  /** Always sorts first. */
  starred?: boolean;
  /** Its leads aren't shown or imported. */
  hidden?: boolean;
  /** English Wikipedia article; null when looked up and none matched; absent when not looked up yet. */
  article?: string | null;
  /** How the article was chosen: by the company's website, its name as a website, its description, or by hand. */
  matchedBy?: 'site' | 'name' | 'description' | 'manual';
  /** How many Wikipedias have an article on it. */
  langs?: number;
  /** Views of the English article by people during viewsMonth. */
  views?: number;
  /** "2026-09". */
  viewsMonth?: string;
  checkedAt?: number;
}
