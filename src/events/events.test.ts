import { describe, expect, it } from 'vitest';
import data from './events.json';
import { DEFAULT_FILTER, audienceOf, kindOf, matches, prepare, relevanceOf, sortEvents, whenLabel, type EventsData, type RawEvent } from './events';

const raw = (over: Partial<RawEvent>): RawEvent => ({
  id: 'x',
  title: 'Meetup',
  start: '2026-12-01T18:00:00-07:00',
  region: 'van',
  url: 'https://example.com',
  source: 'Luma',
  ...over,
});

describe('kindOf', () => {
  it('reads the kind from the title', () => {
    expect(kindOf(raw({ title: 'HiredX #12 - Tech Speed Networking (Candidates)' }))).toBe('career');
    expect(kindOf(raw({ title: 'Vancouver Job Fair - Vancouver Career Fair' }))).toBe('career');
    expect(kindOf(raw({ title: '(강북3기/AI핵심) 풀스택 AI 실무 프로젝트 과정', host: '청년취업사관학교 새싹(SeSAC)' }))).toBe('workshop');
    expect(kindOf(raw({ title: 'Hack The Halls - 4th Annual' }))).toBe('hackathon');
    expect(kindOf(raw({ title: '[2회차] 디노티시아 NIPA 오픈소스 해커톤' }))).toBe('hackathon');
    expect(kindOf(raw({ title: 'DevFest Surrey 2026' }))).toBe('conference');
    expect(kindOf(raw({ title: 'Machine Learning Reading Group: Tulu 3' }))).toBe('workshop');
    expect(kindOf(raw({ title: 'Burnaby Tech Community Coffee Meetup' }))).toBe('networking');
    expect(kindOf(raw({ title: 'VanJS November Talks' }))).toBe('meetup');
  });

  it("falls back to Dev-Event's own kind", () => {
    expect(kindOf(raw({ title: '2027 MOBIS Robotics', tags: ['무료', '대회'] }))).toBe('hackathon');
    expect(kindOf(raw({ title: '모두콘 2026', tags: ['세미나'] }))).toBe('meetup');
  });
});

describe('relevanceOf', () => {
  it('puts hiring events and student events first, founder events lower', () => {
    expect(relevanceOf(raw({ title: 'SFU Systems Fair 2027' }), 'career').relevance).toBe(3);
    expect(relevanceOf(raw({ title: 'Vancouver Job Fair - Vancouver Career Fair' }), 'career').relevance).toBe(2);
    expect(relevanceOf(raw({ title: 'Vancouver AI, Tech & International Holiday Networking' }), 'networking').relevance).toBe(2);
    expect(relevanceOf(raw({ title: 'Dataverse 2026: WiDS x USS Datathon', host: 'UBC Undergraduate Science Society' }), 'hackathon').relevance).toBe(3);
    expect(relevanceOf(raw({ title: 'AWS Tech Talk with an Amazon SDE', host: 'AWS Student Builder Group at UVic' }), 'meetup').relevance).toBe(2);
    expect(relevanceOf(raw({ title: 'VanJS November Talks' }), 'meetup').relevance).toBe(1);
    expect(relevanceOf(raw({ title: 'Fall Fundraising Playbook for Founders' }), 'meetup').relevance).toBe(0);
  });
});

describe('audienceOf', () => {
  it('marks virtual events run from Canada', () => {
    expect(audienceOf(raw({ region: 'online', title: 'Weekly Dev Chat', city: 'Edmonton' }))).toBe('ca');
    expect(audienceOf(raw({ region: 'online', title: 'Recruiter Truths', host: 'BoulderNet' }))).toBe('any');
    expect(audienceOf(raw({ region: 'online', title: 'kt cloud 웨비나', audience: 'kr' }))).toBe('kr');
  });
});

describe('filters', () => {
  const now = Date.parse('2026-11-30T00:00:00Z');
  const events = prepare([
    raw({ id: 'past', title: 'Old meetup', start: '2026-11-21T18:00:00-07:00', end: '2026-11-21T20:00:00-07:00' }),
    raw({ id: 'van', title: 'Vancouver Job Fair', start: '2026-12-09T10:00:00-07:00' }),
    raw({ id: 'seoul', title: 'Seoul dbt Meetup #11', region: 'seoul', start: '2026-12-09T19:00:00+09:00' }),
    raw({ id: 'web', title: 'Weekly Dev Chat', region: 'online', online: true, city: 'Edmonton', start: '2026-12-01T12:00:00-06:00' }),
    raw({ id: 'us', title: 'Coding Club', region: 'online', online: true, start: '2026-12-01T18:00:00-08:00' }),
    raw({ id: 'due', title: 'DDD Seoul 2026', region: 'seoul', deadline: true, allDay: true, start: '2026-11-29T00:00:00+09:00' }),
  ]);
  const ids = (f: Partial<typeof DEFAULT_FILTER>) => events.filter((e) => matches(e, { ...DEFAULT_FILTER, ...f }, now)).map((e) => e.id);

  it('hides past events, and deadlines after their last day', () => {
    expect(ids({})).toEqual(['van', 'seoul', 'web', 'us']);
  });

  it('filters by place, format, kind, hiring value and Canada', () => {
    expect(ids({ regions: ['seoul'] })).toEqual(['seoul']);
    expect(ids({ format: 'online' })).toEqual(['web', 'us']);
    expect(ids({ format: 'in-person' })).toEqual(['van', 'seoul']);
    expect(ids({ kinds: ['career'] })).toEqual(['van']);
    expect(ids({ minRelevance: 2 })).toEqual(['van']);
    expect(ids({ canadaOnly: true })).toEqual(['van', 'seoul', 'web']);
    expect(ids({ within: 7 })).toEqual(['web', 'us']);
    expect(ids({ search: 'dbt' })).toEqual(['seoul']);
  });

  it('sorts by time or by hiring value', () => {
    const live = events.filter((e) => matches(e, DEFAULT_FILTER, now));
    expect(sortEvents(live, 'soonest').map((e) => e.id)).toEqual(['web', 'us', 'seoul', 'van']); // 7 PM in Seoul comes before 10 AM in Vancouver
    expect(sortEvents(live, 'relevant')[0].id).toBe('van');
  });

  it('sorts an event already under way by when it ends', () => {
    const [long, next] = prepare([
      raw({ id: 'long', title: 'Month-long online hackathon', start: '2026-11-01T00:00:00+09:00', end: '2026-12-12T23:59:00+09:00' }),
      raw({ id: 'next', start: '2026-12-01T18:00:00-07:00' }),
    ]);
    expect(sortEvents([long, next], 'soonest', now).map((e) => e.id)).toEqual(['next', 'long']);
  });
});

describe('whenLabel', () => {
  it("shows the event's own local time", () => {
    const [e] = prepare([raw({ start: '2026-11-21T10:00:00-07:00', end: '2026-11-21T17:30:00-07:00' })]);
    expect(whenLabel(e, 'America/Vancouver')).toMatch(/Nov\.? 21, 10:00\s?a\.?m\.? – 5:30\s?p\.?m\.?/i);
    const [d] = prepare([raw({ deadline: true, allDay: true, start: '2026-12-04T00:00:00+09:00', region: 'seoul' })]);
    expect(whenLabel(d, 'Asia/Seoul')).toMatch(/^Registration closes .*Dec\.? 4$/);
  });
});

describe('events.json', () => {
  const d = data as EventsData;
  it('has events in every region, and none in Seoul after the cutoff', () => {
    for (const r of ['van', 'seoul', 'online']) expect(d.events.some((e) => e.region === r)).toBe(true);
    expect(d.events.filter((e) => e.region === 'seoul' && e.start.slice(0, 10) > d.seoulUntil)).toEqual([]);
  });

  it('has a valid start, a URL and a unique id on every event', () => {
    for (const e of d.events) {
      expect(Number.isNaN(Date.parse(e.start)), e.title).toBe(false);
      expect(e.url).toMatch(/^https?:\/\//);
    }
    expect(new Set(d.events.map((e) => e.id)).size).toBe(d.events.length);
  });
});
