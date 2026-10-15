// Numbers for the stats page: how many applications go out, and which sources get answers.

import type { Application, Stage } from '../model/types';
import { appliedAt } from './model';

const DAY = 24 * 60 * 60 * 1000;

/** Stages that mean the company answered (a rejection is an answer too). */
const REPLY: Stage[] = ['screening', 'interviewing', 'offer', 'rejected'];
const INTERVIEW: Stage[] = ['interviewing', 'offer'];

export const NO_SOURCE = 'Not set';

/** Local midnight of the Monday starting the week that holds `ms`. */
export function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Applications sent per week, oldest week first, ending with this week. */
export function appliedPerWeek(apps: Application[], weeks: number, now = Date.now()): { week: number; count: number }[] {
  const last = weekStart(now);
  const out = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(last);
    d.setDate(d.getDate() - 7 * (weeks - 1 - i));
    return { week: d.getTime(), count: 0 };
  });
  for (const a of apps) {
    const at = appliedAt(a);
    if (at === null) continue;
    const w = weekStart(at);
    const row = out.find((r) => r.week === w);
    if (row) row.count++;
  }
  return out;
}

export interface SourceRow {
  source: string;
  applied: number;
  replied: number;
  interviews: number;
  offers: number;
  /** Median days from applying to the first answer, among those answered. */
  medianReplyDays: number | null;
}

/** One row per source, counting only applications that were sent; most applications first. */
export function bySource(apps: Application[]): SourceRow[] {
  const rows = new Map<string, SourceRow & { waits: number[] }>();
  for (const a of apps) {
    const at = appliedAt(a);
    if (at === null) continue;
    const source = a.source?.trim() || NO_SOURCE;
    const row = rows.get(source) ?? { source, applied: 0, replied: 0, interviews: 0, offers: 0, medianReplyDays: null, waits: [] };
    rows.set(source, row);
    row.applied++;
    const reply = a.history.filter((e) => REPLY.includes(e.stage) && e.at >= at).sort((x, y) => x.at - y.at)[0];
    if (reply) {
      row.replied++;
      row.waits.push((reply.at - at) / DAY);
    }
    if (a.history.some((e) => INTERVIEW.includes(e.stage))) row.interviews++;
    if (a.history.some((e) => e.stage === 'offer')) row.offers++;
  }
  return [...rows.values()]
    .map(({ waits, ...r }) => ({ ...r, medianReplyDays: median(waits) }))
    .sort((a, b) => b.applied - a.applied || a.source.localeCompare(b.source));
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

/** Every source used so far, for the "Found via" suggestions. */
export function knownSources(apps: { source?: string }[]): string[] {
  const common = ['LinkedIn', 'Simplify', 'SpeedyApply', 'Company site', 'Referral', 'Instagram'];
  return [...new Set([...apps.map((a) => a.source?.trim()).filter((s): s is string => !!s), ...common])];
}
