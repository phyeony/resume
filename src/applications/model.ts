// Small helpers over Application records, shared by the list and the editor.

import { CLOSED_STAGES, type Application, type PostingSummary, type Stage, type StageEvent } from '../model/types';

const DAY = 24 * 60 * 60 * 1000;

export const emptySummary = (filledBy = 'manual'): PostingSummary => ({
  responsibilities: [],
  requirements: [],
  niceToHave: [],
  benefits: [],
  filledBy,
});

export function isSummaryEmpty(s: PostingSummary): boolean {
  return !s.location && !s.workMode && !s.salary && !s.responsibilities.length && !s.requirements.length && !s.niceToHave.length && !s.benefits.length;
}

export function newApplication(id: string, now = Date.now()): Application {
  return {
    id,
    company: '',
    role: '',
    history: [{ stage: 'saved', at: now }],
    summary: emptySummary(),
    hasPosting: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** History in date order; ties keep the order they were added in. */
export const sortHistory = (h: StageEvent[]): StageEvent[] => [...h].sort((a, b) => a.at - b.at);

export function currentStage(a: Application): Stage {
  const h = sortHistory(a.history);
  return h[h.length - 1]?.stage ?? 'saved';
}

export function lastEventAt(a: Application): number {
  return Math.max(a.createdAt, ...a.history.map((e) => e.at));
}

/** When it was first marked applied. */
export function appliedAt(a: Application): number | null {
  const e = sortHistory(a.history).find((x) => x.stage === 'applied');
  return e ? e.at : null;
}

export const isClosed = (s: Stage) => CLOSED_STAGES.includes(s);

/** Days since the last change while waiting to hear back, else null. Also: time to follow up. */
export function waitingDays(a: Application, now = Date.now()): number | null {
  const s = currentStage(a);
  if (s !== 'applied' && s !== 'screening') return null;
  const days = Math.floor((now - lastEventAt(a)) / DAY);
  return days >= 14 ? days : null;
}

/** The stage the "add" control suggests next. */
export function nextStage(s: Stage): Stage {
  const flow: Stage[] = ['saved', 'applied', 'screening', 'interviewing', 'offer'];
  const i = flow.indexOf(s);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : s;
}

/** Records a follow-up: the current stage again, so the wait starts over. */
export function withFollowUp(a: Application, now = Date.now()): Application {
  return { ...a, history: [...a.history, { stage: currentStage(a), at: now, note: 'Followed up' }], updatedAt: now };
}

// Query parameters that only say how you got to a page, not which page it is.
const TRACKING_PARAM = /^(utm_.*|st_source|ref|refs|source|src|gh_src|lever-source|lever-origin|trk|trackingid|embed|iis|iisn)$/i;

/**
 * The same posting gives the same key however it was reached: no tracking parameters, no "www.", no
 * fragment, and the apply page counts as the posting (…/apply, …/application).
 */
export function urlKey(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const params = [...u.searchParams].filter(([k]) => !TRACKING_PARAM.test(k)).sort(([a], [b]) => a.localeCompare(b));
  const path = u.pathname.replace(/\/(apply|application)\/?$/i, '').replace(/\/+$/, '');
  const query = params.length ? '?' + new URLSearchParams(params).toString() : '';
  return u.hostname.toLowerCase().replace(/^www\./, '') + path + query;
}
