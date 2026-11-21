// Dev and tech events worth going to while job hunting: what kind each is, how much it can help you get
// hired, and the filters and sorts the Events page offers. The list comes from events.json
// (tools/events/build.py).

export type Region = 'van' | 'seoul' | 'online';
export type Kind = 'career' | 'hackathon' | 'conference' | 'workshop' | 'networking' | 'meetup';
export type Audience = 'ca' | 'kr' | 'any';

/** events.json as the build script writes it. */
export interface EventsData {
  generatedAt: string;
  capturedAt: string;
  /** Seoul events are only listed up to this day, "2026-12-25". */
  seoulUntil: string;
  sources: string[];
  events: RawEvent[];
}

export interface RawEvent {
  id: string;
  title: string;
  /** ISO with the event's own offset, "2026-11-21T10:00:00-07:00". */
  start: string;
  end?: string;
  city?: string;
  region: Region;
  online?: boolean;
  url: string;
  host?: string;
  source: string;
  /** Dev-Event's kind and topic labels, in Korean: "대회", "AI", "무료". */
  tags?: string[];
  /** Only the registration window was given: start is when it closes, not when the event is. */
  deadline?: boolean;
  /** The time of day is unknown. */
  allDay?: boolean;
  audience?: 'kr';
}

export interface DevEvent extends RawEvent {
  at: number;
  until?: number;
  kind: Kind;
  /** 0 to 3: how directly it can lead to a job. */
  relevance: number;
  /** Why it scored what it did, shortest first. */
  reasons: string[];
  audienceOf: Audience;
  free?: boolean;
}

export const REGION_LABELS: Record<Region, string> = { van: 'Vancouver', seoul: 'Seoul', online: 'Virtual' };

export const KIND_LABELS: Record<Kind, string> = {
  career: 'Career & hiring',
  hackathon: 'Hackathon',
  conference: 'Conference',
  workshop: 'Workshop & study',
  networking: 'Networking',
  meetup: 'Meetup & talk',
};

export const RELEVANCE_LABELS = ['Low', 'Some', 'Good', 'High'];

const RULES: [Kind, RegExp][] = [
  ['career', /career fair|job fair|job expo|career connect|hiring|recruit|hiredx|hackerx|get hired|job search|land (a|your)|interview|resume|job market|connect with tech companies|employment|systems fair|채용|커리어|취업|잡페어/i],
  ['hackathon', /hack|datathon|game jam|jam\b|competition|challenge|prompt-?thon|ctf|해커톤|대회|공모전|챌린지/i],
  ['conference', /conf\b|conference|devfest|summit|symposium|festival|expo|showcase|demo ?day|converge|forum|day 20\d\d|korea day|unite\b|컨퍼런스|콘퍼런스|페스티벌|심포지엄|포럼|데모데이/i],
  ['workshop', /workshop|hands-?on|study|studio session|reading group|leetcode|coding club|pair coding|bootcamp|course|class\b|핸즈온|워크샵|워크숍|교육|스터디|부트캠프|과정/i],
  ['networking', /network|mixer|coffee|social|happy hour|celebration|party|brunch|meet ?up.*networking|네트워킹|커피/i],
];

/** Dev-Event's own kind, when the title says nothing clearer. */
const TAG_KINDS: Record<string, Kind> = { 대회: 'hackathon', 교육: 'workshop', 세미나: 'meetup', 모임: 'meetup', 동아리: 'workshop' };

export function kindOf(e: Pick<RawEvent, 'title' | 'host' | 'tags'>): Kind {
  // The title first: a course run by a "youth employment academy" is still a course.
  for (const text of [e.title, e.host ?? '']) for (const [kind, re] of RULES) if (re.test(text)) return kind;
  for (const t of e.tags ?? []) if (TAG_KINDS[t]) return TAG_KINDS[t];
  return 'meetup';
}

const STUDENT = /student|campus|universit|college|\bubc\b|\bsfu\b|bcit|uvic|northeastern|youth|new grad|intern(ship)?s?\b|co-?op\b|대학|학생|gdgoc|sbg|student builder|ssafy|청년/i;
const EMPLOYERS = /amazon|aws|google|microsoft|oracle|nvidia|notion|openai|github|mongodb|clickhouse|olive ?young|kakao|naver|toss|line\b|coupang|hyundai|현대|네이버|카카오|토스|삼성|samsung|sk /i;
const FOUNDERS = /founder|investor|fundrais|venture|pitch|vc\b|startup valuation|투자|창업/i;
const TECH = /tech|software|developer|engineer|coding|\bit\b|\bai\b|data|cyber|hacker|\bsde\b|systems|개발|테크|\bsw\b/i;
const CANADA = /canad|vancouver|\bbc\b|burnaby|surrey|calgary|edmonton|toronto|uvic|victoria/i;

/** How much an event can help a student land an internship or new-grad job, and why. */
export function relevanceOf(e: RawEvent, kind: Kind): { relevance: number; reasons: string[] } {
  const text = `${e.title} ${e.host ?? ''}`;
  const reasons: string[] = [];
  let score = { career: 3, hackathon: 2, conference: 2, networking: 2, workshop: 1, meetup: 1 }[kind];
  if (kind === 'career') reasons.push('meet recruiters or practise for the hiring process');
  if (kind === 'career' && !TECH.test(text)) {
    score -= 1;
    reasons.push('not just for tech');
  }
  if (kind === 'hackathon') reasons.push('a project for your resume, and sponsors scout here');
  if (kind === 'conference') reasons.push('many companies and engineers in one place');
  if (kind === 'networking') reasons.push('time set aside for meeting people');
  // Either one lifts an event a step, not both: a student club named after a company isn't a recruiting event.
  const student = STUDENT.test(text);
  const employer = EMPLOYERS.test(text) && kind !== 'career';
  if (student) reasons.push('aimed at students');
  if (employer) reasons.push('people from companies that hire');
  if (student || (employer && (kind === 'meetup' || kind === 'workshop'))) score += 1;
  if (FOUNDERS.test(text) && kind !== 'career' && kind !== 'hackathon') {
    score -= 1;
    reasons.push('mostly for founders and investors');
  }
  if (e.deadline) reasons.push('sign up before registration closes');
  return { relevance: Math.max(0, Math.min(3, score)), reasons };
}

export function audienceOf(e: RawEvent): Audience {
  if (e.audience === 'kr') return 'kr';
  if (e.region !== 'online') return e.region === 'van' ? 'ca' : 'kr';
  return CANADA.test(`${e.title} ${e.host ?? ''} ${e.city ?? ''}`) ? 'ca' : 'any';
}

export function prepare(raw: RawEvent[]): DevEvent[] {
  return raw.map((e) => {
    const kind = kindOf(e);
    const tags = e.tags ?? [];
    return {
      ...e,
      at: Date.parse(e.start),
      until: e.end ? Date.parse(e.end) : undefined,
      kind,
      ...relevanceOf(e, kind),
      audienceOf: audienceOf(e),
      free: tags.includes('무료') ? true : tags.includes('유료') ? false : undefined,
    };
  });
}

export interface EventFilter {
  regions: Region[];
  kinds: Kind[];
  /** Virtual, in person, or both. */
  format: 'any' | 'online' | 'in-person';
  minRelevance: number;
  /** Days ahead to show, 0 for all. */
  within: number;
  /** Virtual events for Canadians only. */
  canadaOnly: boolean;
  search: string;
}

export const DEFAULT_FILTER: EventFilter = { regions: [], kinds: [], format: 'any', minRelevance: 0, within: 0, canadaOnly: false, search: '' };

const DAY = 24 * 60 * 60 * 1000;

/** Not over yet; a deadline counts until the day it closes. */
export function upcoming(e: DevEvent, now: number): boolean {
  return (e.until ?? e.at + (e.allDay || e.deadline ? DAY : 0)) >= now;
}

export function matches(e: DevEvent, f: EventFilter, now: number): boolean {
  if (!upcoming(e, now)) return false;
  if (f.regions.length && !f.regions.includes(e.region)) return false;
  if (f.kinds.length && !f.kinds.includes(e.kind)) return false;
  if (f.format === 'online' && !e.online) return false;
  if (f.format === 'in-person' && e.region === 'online') return false;
  if (e.relevance < f.minRelevance) return false;
  if (f.within && e.at > now + f.within * DAY) return false;
  if (f.canadaOnly && e.region === 'online' && e.audienceOf !== 'ca') return false;
  const q = f.search.trim().toLowerCase();
  if (q && !`${e.title} ${e.host ?? ''} ${e.city ?? ''}`.toLowerCase().includes(q)) return false;
  return true;
}

export type EventSort = 'soonest' | 'relevant';

export const SORT_LABELS: Record<EventSort, string> = { soonest: 'Soonest first', relevant: 'Most useful for getting hired' };

/** Events already under way (a month-long online hackathon) sort by when they end, so they don't sit on top. */
export function sortEvents(events: DevEvent[], sort: EventSort, now = Date.now()): DevEvent[] {
  const key = (e: DevEvent) => (e.at >= now ? e.at : e.until ?? e.at);
  const byTime = (a: DevEvent, b: DevEvent) => key(a) - key(b) || a.title.localeCompare(b.title);
  return [...events].sort(sort === 'soonest' ? byTime : (a, b) => b.relevance - a.relevance || byTime(a, b));
}

export const ZONES: Record<Region, string> = { van: 'America/Vancouver', seoul: 'Asia/Seoul', online: 'America/Vancouver' };

/** "Sat, Nov 21, 10:00 AM – 5:30 PM" in the event's own time (Vancouver time for virtual events, Seoul time for Korean ones). */
export function whenLabel(e: DevEvent, zone = zoneOf(e)): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' });
  const time = new Intl.DateTimeFormat('en-CA', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
  if (e.deadline) return `Registration closes ${day.format(e.at)}${e.allDay ? '' : `, ${time.format(e.at)}`}`;
  if (e.allDay) return e.until && dayKey(e.until, zone) !== dayKey(e.at, zone) ? `${day.format(e.at)} – ${day.format(e.until)}` : day.format(e.at);
  const start = `${day.format(e.at)}, ${time.format(e.at)}`;
  if (!e.until) return start;
  return dayKey(e.until, zone) === dayKey(e.at, zone) ? `${start} – ${time.format(e.until)}` : `${start} – ${day.format(e.until)}, ${time.format(e.until)}`;
}

/** The time zone an event's times are shown in: its own, or Seoul's for Korean virtual events. */
export function zoneOf(e: Pick<RawEvent, 'region' | 'audience'>): string {
  return e.audience === 'kr' ? ZONES.seoul : ZONES[e.region];
}

function dayKey(t: number, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

/** A Google Calendar "add event" link. */
export function calendarLink(e: DevEvent): string {
  const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = e.until ?? e.at + 2 * 60 * 60 * 1000;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.deadline ? `Register: ${e.title}` : e.title,
    dates: `${stamp(e.at)}/${stamp(e.deadline ? e.at + 30 * 60 * 1000 : end)}`,
    details: e.url,
    location: e.online ? 'Online' : e.city ?? '',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}
