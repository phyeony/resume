// RateMyProfessors summaries for instructors. RMP doesn't let other sites read it, so the pages
// come through the autofill extension (see applications/pageFetch.ts); without it, the planner
// just links to the search. RMP renders its data into the page as a Relay store (or Next.js data),
// so the parser walks whatever JSON it finds for Teacher, Rating and tag records.

export const SFU_SCHOOLS = [
  { id: 1482, name: 'Simon Fraser University' },
  { id: 4267, name: 'Simon Fraser University - Surrey' },
];

export const rmpSearchUrl = (name: string, school = SFU_SCHOOLS[0].id) =>
  `https://www.ratemyprofessors.com/search/professors/${school}?q=${encodeURIComponent(name)}`;

export const rmpProfileUrl = (id: number) => `https://www.ratemyprofessors.com/professor/${id}`;

export interface RmpTeacher {
  id: number;
  firstName: string;
  lastName: string;
  department: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
  /** -1 when RMP has no answers. */
  wouldTakeAgainPercent: number;
}

export interface RmpReview {
  course: string;
  date: string;
  quality: number;
  difficulty: number;
  comment: string;
}

export interface RmpSummary extends RmpTeacher {
  tags: string[];
  reviews: RmpReview[];
  fetchedAt: number;
}

type Json = Record<string, unknown>;

/** Every JSON blob RMP puts in its page. */
function blobs(html: string): unknown[] {
  const out: unknown[] = [];
  const relay = html.indexOf('window.__RELAY_STORE__');
  if (relay >= 0) {
    const start = html.indexOf('{', relay);
    // The store is one line of JSON (strings can't hold raw newlines), ending in ";".
    const end = html.indexOf('\n', start);
    const text = html.slice(start, end < 0 ? undefined : end).trim().replace(/;\s*$/, '');
    try {
      out.push(JSON.parse(text));
    } catch {
      // Layout changed; try the next form.
    }
  }
  const next = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (next) {
    try {
      out.push(JSON.parse(next[1]));
    } catch {
      // Same.
    }
  }
  return out;
}

function walk(v: unknown, visit: (o: Json) => void, depth = 0) {
  if (depth > 40 || !v || typeof v !== 'object') return;
  if (Array.isArray(v)) {
    for (const x of v) walk(x, visit, depth + 1);
    return;
  }
  visit(v as Json);
  for (const x of Object.values(v as Json)) walk(x, visit, depth + 1);
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function asTeacher(o: Json): RmpTeacher | null {
  const id = num(o.legacyId, NaN);
  if (!Number.isFinite(id) || !str(o.lastName) || !('avgRating' in o || 'numRatings' in o)) return null;
  return {
    id,
    firstName: str(o.firstName).trim(),
    lastName: str(o.lastName).trim(),
    department: str(o.department),
    avgRating: num(o.avgRating),
    avgDifficulty: num(o.avgDifficulty),
    numRatings: num(o.numRatings),
    wouldTakeAgainPercent: num(o.wouldTakeAgainPercent, -1),
  };
}

/** The professors on an RMP search (or profile) page. */
export function parseTeachers(html: string): RmpTeacher[] {
  const byId = new Map<number, RmpTeacher>();
  for (const b of blobs(html)) {
    walk(b, (o) => {
      const t = asTeacher(o);
      if (t && !byId.has(t.id)) byId.set(t.id, t);
    });
  }
  return [...byId.values()];
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The search result that is this instructor: same last name, same first name or initial,
 * computing departments first, then the most-rated.
 */
export function pickTeacher(name: string, teachers: RmpTeacher[]): RmpTeacher | null {
  const parts = norm(name).split(' ');
  const first = parts[0];
  const last = parts[parts.length - 1];
  const matches = teachers.filter((t) => {
    const tl = norm(t.lastName).split(' ');
    const tf = norm(t.firstName);
    return tl.includes(last) && (tf === first || tf.split(' ')[0] === first || tf[0] === first[0]);
  });
  const computing = (t: RmpTeacher) => (/comput|engineering|math/i.test(t.department) ? 1 : 0);
  if (!matches.length) {
    // Goes by a middle name (SFU lists "William Sumner", students rate "Nick Sumner"): take the
    // only computing professor with that last name.
    const sameLast = teachers.filter((t) => norm(t.lastName).split(' ').includes(last) && computing(t));
    return sameLast.length === 1 ? sameLast[0] : null;
  }
  matches.sort((a, b) => computing(b) - computing(a) || b.numRatings - a.numRatings);
  return matches[0] ?? null;
}

/** A profile page's teacher, top tags and newest reviews. */
export function parseProfile(html: string, id: number, now = Date.now()): RmpSummary | null {
  const teacher = parseTeachers(html).find((t) => t.id === id) ?? null;
  if (!teacher) return null;
  const tags = new Map<string, number>();
  const reviews: RmpReview[] = [];
  for (const b of blobs(html)) {
    walk(b, (o) => {
      if (typeof o.tagName === 'string' && typeof o.tagCount === 'number') {
        tags.set(o.tagName, Math.max(tags.get(o.tagName) ?? 0, o.tagCount));
      }
      if (typeof o.comment === 'string' && ('clarityRating' in o || 'helpfulRating' in o || 'difficultyRating' in o)) {
        const comment = o.comment.replace(/\s+/g, ' ').trim();
        if (comment && !reviews.some((r) => r.comment === comment)) {
          reviews.push({
            course: str(o.class),
            date: str(o.date),
            quality: (num(o.clarityRating) + num(o.helpfulRating, num(o.clarityRating))) / 2,
            difficulty: num(o.difficultyRating),
            comment,
          });
        }
      }
    });
  }
  reviews.sort((a, b) => Date.parse(b.date || '0') - Date.parse(a.date || '0'));
  return {
    ...teacher,
    tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t),
    reviews: reviews.slice(0, 3),
    fetchedAt: now,
  };
}

/** One line: "4.2/5 · difficulty 3.1 · 85% would take again · 40 ratings". */
export function ratingLine(s: RmpTeacher): string {
  if (!s.numRatings) return 'No ratings yet';
  const parts = [`${s.avgRating.toFixed(1)}/5`, `difficulty ${s.avgDifficulty.toFixed(1)}`];
  if (s.wouldTakeAgainPercent >= 0) parts.push(`${Math.round(s.wouldTakeAgainPercent)}% would take again`);
  parts.push(`${s.numRatings} rating${s.numRatings === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** "Good", "Mixed" or "Poor", for a colour at a glance. */
export function ratingTone(s: RmpTeacher): 'good' | 'mixed' | 'poor' | 'none' {
  if (!s.numRatings) return 'none';
  return s.avgRating >= 4 ? 'good' : s.avgRating >= 3 ? 'mixed' : 'poor';
}

export function clip(s: string, n = 180): string {
  if (s.length <= n) return s;
  const cut = s.lastIndexOf(' ', n - 1);
  return `${s.slice(0, cut > n / 2 ? cut : n - 1)}…`;
}

/**
 * Finds an instructor on RMP (Burnaby listings, then Surrey) and reads their profile.
 * null when RMP has nobody by that name at SFU.
 */
export async function lookup(name: string, fetchHtml: (url: string) => Promise<string>, now = Date.now()): Promise<RmpSummary | null> {
  for (const school of SFU_SCHOOLS) {
    const t = pickTeacher(name, parseTeachers(await fetchHtml(rmpSearchUrl(name, school.id))));
    if (!t) continue;
    try {
      return parseProfile(await fetchHtml(rmpProfileUrl(t.id)), t.id, now) ?? { ...t, tags: [], reviews: [], fetchedAt: now };
    } catch {
      // The search alone has the numbers.
      return { ...t, tags: [], reviews: [], fetchedAt: now };
    }
  }
  return null;
}
