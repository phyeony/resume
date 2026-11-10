// Seats taken in each Spring 2027 section, from CourSys's public course browser. CourSys's browse
// page loads its table as JSON (one row per section: semester, code, title, "enrolled/capacity
// (+waitlist)", instructors, campus); like RateMyProfessors, it's fetched through the extension.

export const SEMESTER = '1271';
export const SEAT_SUBJECTS = ['CMPT', 'MACM', 'MATH', 'IAT'];

export interface Seats {
  taken: number;
  cap: number;
  waitlist: number;
}

/** "CMPT 431 D100" → its seats. */
export type SeatMap = Record<string, Seats>;

export const coursysTableUrl = (subject: string, semester = SEMESTER) =>
  `https://coursys.sfu.ca/browse/?tabledata=yes&draw=1&start=0&length=500&semester%5B%5D=${semester}&subject%5B%5D=${subject}`;

const text = (html: unknown) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** The sections in one CourSys table answer. Rows CourSys sends as objects or arrays both work. */
export function parseSeats(body: string): SeatMap {
  let rows: unknown[];
  try {
    const json = JSON.parse(body) as { data?: unknown[]; aaData?: unknown[] };
    rows = json.data ?? json.aaData ?? [];
  } catch {
    return {};
  }
  const out: SeatMap = {};
  for (const row of rows) {
    const cells = Array.isArray(row) ? row : [];
    const obj = !Array.isArray(row) && row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
    const code = text(obj ? obj.coursecode : cells[1]);
    const enrol = text(obj ? obj.enrol : cells[3]);
    // The first line is the section itself; crosslisted ones follow after an "X".
    const c = /^([A-Z]{2,5}) (\d{3}[A-Z]?) ([A-Z]\d{3})/.exec(code);
    const e = /^(\d+)\/(\d+)(?: \(\+(\d+)\))?/.exec(enrol);
    if (!c || !e) continue;
    out[`${c[1]} ${c[2]} ${c[3]}`] = { taken: Number(e[1]), cap: Number(e[2]), waitlist: Number(e[3] ?? 0) };
  }
  return out;
}

/** Every Spring 2027 section in the subjects the planner covers. */
export async function fetchSeats(fetchText: (url: string) => Promise<string>): Promise<SeatMap> {
  const parts = await Promise.all(SEAT_SUBJECTS.map(async (s) => parseSeats(await fetchText(coursysTableUrl(s)))));
  return Object.assign({}, ...parts) as SeatMap;
}

/** All of a course's sections added up. */
export function courseSeats(seats: SeatMap, code: string): Seats | null {
  const mine = Object.entries(seats).filter(([k]) => k.startsWith(`${code} `));
  if (!mine.length) return null;
  return mine.reduce((a, [, s]) => ({ taken: a.taken + s.taken, cap: a.cap + s.cap, waitlist: a.waitlist + s.waitlist }), { taken: 0, cap: 0, waitlist: 0 });
}

/** "full", "almost" (90%+) or "open", for a colour at a glance. */
export function seatTone(s: Seats): 'full' | 'almost' | 'open' {
  if (s.cap > 0 && s.taken >= s.cap) return 'full';
  return s.cap > 0 && s.taken / s.cap >= 0.9 ? 'almost' : 'open';
}

/** "42/50 seats taken", plus the waitlist. */
export function seatLine(s: Seats): string {
  return `${s.taken}/${s.cap} seats taken${s.waitlist ? ` · ${s.waitlist} waitlisted` : ''}`;
}
