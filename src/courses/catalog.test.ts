import { describe, expect, it } from 'vitest';
import { compareCodes, topRatedByTerm, usualTerms, COURSES, PAST_SECTIONS, RECOMMENDED, SPRING_2027, UNITS_LEFT, clashes, TOP_FIVE, offeredIn, courseLink, coursysOfferingUrl, recommendByRatings, teachersOf, usualSeason, eligibility, expected, normalizePlan, outlineUrl, planProblems, planUnits, slots } from './catalog';

describe('course catalogue', () => {
  it('describes every Spring offering and expected course', () => {
    for (const o of SPRING_2027) expect(COURSES).toHaveProperty([o.code]);
    for (const t of ['summer', 'fall'] as const) for (const e of expected(t)) expect(COURSES).toHaveProperty([e.code]);
  });

  it('marks courses taken, in progress, eligible or blocked', () => {
    expect(eligibility(COURSES['CMPT 354']).status).toBe('taken');
    expect(eligibility(COURSES['CMPT 431']).status).toBe('eligible');
    expect(eligibility(COURSES['CMPT 454']).status).toBe('eligible');
    // Something in progress counts as done for prerequisites, and can't be planned again.
    expect(eligibility(COURSES['CMPT 431'], undefined, ['CMPT 431']).status).toBe('in-progress');
    expect(eligibility(COURSES['CMPT 420'], undefined, ['CMPT 410']).status).toBe('eligible');
    // CMPT 300 counts for the systems prerequisite.
    expect(eligibility(COURSES['CMPT 471']).status).toBe('eligible');
    // No CMPT 272 on the transcript.
    expect(eligibility(COURSES['CMPT 372'])).toMatchObject({ status: 'missing', missing: ['CMPT 272'] });
    // Deep Learning needs Machine Learning first.
    expect(eligibility(COURSES['CMPT 420'])).toMatchObject({ status: 'missing', missing: ['CMPT 410 or CMPT 419'] });
    // Special topics can be taken again.
    expect(eligibility(COURSES['CMPT 419'], undefined, ['CMPT 419']).status).toBe('eligible');
  });

  it('asks for an advisor when an old course stands in or content overlaps', () => {
    const dm = eligibility(COURSES['CMPT 455']);
    expect(dm.status).toBe('check');
    expect(dm.notes[0]).toMatch(/STAT 270/);
    expect(eligibility(COURSES['CMPT 303']).status).toBe('missing');
    expect(eligibility(COURSES['CMPT 303']).notes.join()).toMatch(/CMPT 300/);
    // The 105W prerequisite is waived.
    expect(eligibility(COURSES['CMPT 376W'])).toMatchObject({ status: 'eligible', missing: [] });
    expect(eligibility(COURSES['CMPT 410']).status).toBe('eligible');
    expect(eligibility(COURSES['CMPT 410'], undefined, ['CMPT 419']).notes.join()).toMatch(/Machine Learning/);
  });

  it('recommends exactly the units left, with nothing you can’t take and no clashes', () => {
    expect(planUnits(RECOMMENDED)).toBe(UNITS_LEFT);
    expect(planProblems(RECOMMENDED)).toEqual([]);
    expect(clashes(RECOMMENDED.spring)).toEqual([]);
    for (const i of RECOMMENDED.spring) expect(SPRING_2027.some((o) => o.code === i.code)).toBe(true);
    for (const t of ['summer', 'fall'] as const) for (const i of RECOMMENDED[t]) expect(expected(t).map((e) => e.code)).toContain(i.code);
  });

  it('finds time clashes', () => {
    expect(slots('Mo 10:30–11:20, Th 10:30–12:20')).toEqual([
      { day: 'Mo', start: 630, end: 680 },
      { day: 'Th', start: 630, end: 740 },
    ]);
    // 409 and 410 meet at the same times.
    expect(clashes([{ code: 'CMPT 409' }, { code: 'CMPT 410' }])).toEqual([['CMPT 409', 'CMPT 410']]);
    // Back to back is fine: 376W E100 ends at 18:20 Wednesday, nothing else then.
    expect(clashes([{ code: 'CMPT 376W', section: 'E100' }, { code: 'CMPT 419', section: 'D100' }])).toEqual([]);
    expect(clashes([{ code: 'CMPT 376W', section: 'E100' }, { code: 'CMPT 419', section: 'E100' }])).toHaveLength(1);
  });

  it('flags a course planned twice or already taken', () => {
    const p = normalizePlan({ spring: [{ code: 'CMPT 454' }], fall: [{ code: 'CMPT 454' }, { code: 'CMPT 354' }] });
    expect(planProblems(p)).toEqual(['CMPT 454 is planned in both Spring 2027 and Fall 2027.', "You've already taken CMPT 354."]);
    // Special topics may repeat.
    expect(planProblems(normalizePlan({ spring: [{ code: 'CMPT 419' }], summer: [{ code: 'CMPT 419' }] }))).toEqual([]);
  });

  it('repairs saved plans', () => {
    expect(normalizePlan(null)).toEqual({ spring: [], summer: [], fall: [] });
    expect(normalizePlan({ spring: [{ code: 'CMPT 999' }, { code: 'CMPT 410' }] }).spring).toEqual([{ code: 'CMPT 410' }]);
  });

  it('expects courses from past years', () => {
    const fall = expected('fall');
    expect(fall.find((e) => e.code === 'CMPT 373')?.likelihood).toBe('likely');
    expect(fall.find((e) => e.code === 'CMPT 473')).toMatchObject({ likelihood: 'possible', years: [2026] });
  });

  it('links SFU outlines', () => {
    expect(outlineUrl('CMPT 376W', 'E100')).toBe('https://www.sfu.ca/outlines.html?2027/spring/cmpt/376w/e100');
  });
});

describe('past instructors', () => {
  it('groups terms by instructor, Spring 2027 included', () => {
    const ml = teachersOf('CMPT 410');
    expect(ml.find((t) => t.name === 'Ke Li')).toMatchObject({ terms: ['Spring 2025', 'Spring 2026', 'Spring 2027'], spring2027: true, topics: [] });
    expect(ml.find((t) => t.name === 'Mo Chen')).toMatchObject({ terms: ['Fall 2025', 'Fall 2026'], spring2027: false });
    expect(teachersOf('CMPT 376W').find((t) => t.name === 'Herbert Tsang')?.offerings).toEqual([{ term: 'Summer 2026', section: 'E200' }]);
    expect(['Ke Li', 'Mo Chen'].map((n) => usualSeason(ml.find((t) => t.name === n)!))).toEqual(['Spring', 'Fall']);
    // TBA sections drop out.
    expect(teachersOf('CMPT 410').map((t) => t.name)).not.toContain(undefined);
    expect(teachersOf('CMPT 479').find((t) => t.name === 'Keval Vora')?.topics).toEqual(['Privacy Preserving Graph Analytics']);
    expect(teachersOf('CMPT 999')).toEqual([]);
  });

  it('only lists courses the catalogue knows', () => {
    for (const code of Object.keys(PAST_SECTIONS)) expect(COURSES).toHaveProperty([code]);
  });
});

describe('CourSys links', () => {
  it('builds offering URLs like CourSys', () => {
    expect(coursysOfferingUrl('CMPT 431', 'Spring 2027', 'D100')).toBe('https://coursys.sfu.ca/browse/info/2027sp-cmpt-431-d1');
    expect(coursysOfferingUrl('CMPT 376W', 'Summer 2026', 'E200')).toBe('https://coursys.sfu.ca/browse/info/2026su-cmpt-376w-e2');
    expect(coursysOfferingUrl('CMPT 403', 'Fall 2025')).toBe('https://coursys.sfu.ca/browse/info/2025fa-cmpt-403-d1');
  });

  it('links each course to its newest offering', () => {
    expect(courseLink('CMPT 410')).toEqual({ url: 'https://coursys.sfu.ca/browse/info/2027sp-cmpt-410-d1', term: 'Spring 2027' });
    expect(courseLink('CMPT 373').term).toBe('Fall 2026');
    expect(courseLink('CMPT 403').term).toBe('Fall 2026');
    expect(courseLink('CMPT 372').term).toBe('Summer 2026');
  });
});

describe('ratings plan', () => {
  const ratings: Record<string, number> = { 'Ke Li': 2.5, 'Mo Chen': 4.8, 'Keval Vora': 4.2, 'Mohamed Hefeeda': 4.9, 'Felix Lo': 4.7, 'Chris Kerslake': 3, 'Nick Sumner': 4.6, 'Angel Chang': 4.4 };
  const { plan, picks } = recommendByRatings((n) => ratings[n] ?? null);

  it('fills the units with nothing you can’t take and no clashes', () => {
    expect(planUnits(plan)).toBe(UNITS_LEFT);
    expect(planProblems(plan)).toEqual([]);
    expect(clashes(plan.spring)).toEqual([]);
  });

  it('follows the better instructor to their term, and keeps 376W', () => {
    // Mo Chen teaches 410 in Fall, so it moves out of Spring.
    expect(picks.find((p) => p.code === 'CMPT 410')).toMatchObject({ term: 'fall', instructor: 'Mo Chen', expectedInstructor: true });
    expect(picks.find((p) => p.code === 'CMPT 471')).toMatchObject({ term: 'spring', instructor: 'Mohamed Hefeeda', expectedInstructor: false });
    // Felix Lo taught 376W in Summer and Fall 2025.
    expect(picks.find((p) => p.code === 'CMPT 376W')?.instructor).toBe('Felix Lo');
    expect(Object.values(plan).flat().map((i) => i.code)).toContain('CMPT 376W');
  });

  it('skips poorly rated instructors', () => {
    expect(picks.some((p) => p.instructor === 'Ke Li' || p.instructor === 'Chris Kerslake')).toBe(false);
  });

  it('falls back to the job-value plan without ratings', () => {
    expect(recommendByRatings(() => null).plan).toEqual(RECOMMENDED);
  });
});

describe('top five', () => {
  it('only lists courses that run that term and that you can take', () => {
    for (const t of ['spring', 'summer', 'fall'] as const) {
      expect(TOP_FIVE[t]).toHaveLength(5);
      for (const code of TOP_FIVE[t]) {
        expect(offeredIn(t)).toContain(code);
        expect(['eligible', 'check']).toContain(eligibility(COURSES[code]).status);
      }
    }
    // All five fit together, with 376W's Burnaby section.
    expect(clashes(TOP_FIVE.spring.map((code) => ({ code, section: code === 'CMPT 376W' ? 'E100' : undefined })))).toEqual([]);
  });

  it('knows Alaa Alameldeen taught 431 in 2024', () => {
    expect(teachersOf('CMPT 431').map((t) => t.name)).toEqual(['Alaa Alameldeen', 'Keval Vora']);
  });
});

describe('MATH, MACM and IAT', () => {
  it('checks their prerequisites against your history', () => {
    expect(eligibility(COURSES['MACM 476']).status).toBe('eligible');
    expect(eligibility(COURSES['MATH 308']).status).toBe('eligible');
    expect(eligibility(COURSES['MATH 345']).status).toBe('eligible');
    // IAT 210 isn't IAT 235 or 265.
    expect(eligibility(COURSES['IAT 339'])).toMatchObject({ status: 'missing', missing: ['IAT 235', 'IAT 265'] });
    expect(eligibility(COURSES['IAT 360']).status).toBe('eligible');
    expect(eligibility(COURSES['MACM 442']).status).toBe('missing');
  });

  it('opens CMPT 478 only after a quantum algorithms course', () => {
    expect(eligibility(COURSES['CMPT 478']).status).toBe('missing');
    const after = eligibility(COURSES['CMPT 478'], undefined, ['MACM 476']);
    expect(after.status).toBe('check');
    expect(after.notes.join()).toMatch(/MACM 476/);
    expect(eligibility(COURSES['CMPT 476'], undefined, ['MACM 476']).notes.join()).toMatch(/MACM 476/);
  });

  it('counts IAT courses as 4 units and sorts subjects', () => {
    expect(planUnits(normalizePlan({ spring: [{ code: 'IAT 360' }, { code: 'MATH 308' }] }))).toBe(7);
    expect(offeredIn('spring').indexOf('MACM 476')).toBeGreaterThan(offeredIn('spring').indexOf('CMPT 495'));
    expect(['IAT 339', 'MATH 308', 'CMPT 410', 'MACM 476'].sort(compareCodes)).toEqual(['CMPT 410', 'MACM 476', 'MATH 308', 'IAT 339']);
    expect(expected('fall').map((e) => e.code)).toContain('MATH 345');
  });
});

describe('usual terms', () => {
  it('tags when courses run', () => {
    expect(usualTerms('CMPT 376W').label).toBe('Every term');
    expect(usualTerms('CMPT 373')).toMatchObject({ label: 'Every Fall', tone: 'regular' });
    expect(usualTerms('CMPT 410').label).toBe('Spring & Fall');
    expect(usualTerms('CMPT 431').label).toBe('Spring & Fall');
    // Summer 2025 and Spring 2027 only.
    expect(usualTerms('CMPT 379')).toMatchObject({ label: 'Irregular', tone: 'irregular' });
    expect(usualTerms('CMPT 379').detail).toMatch(/Summer 2025, Spring 2027/);
    expect(usualTerms('CMPT 362').label).toBe('Usually Fall');
    expect(usualTerms('IAT 339').label).toBe('Every term');
  });
});

describe('top rated by term', () => {
  const ratings: Record<string, number> = { 'Mo Chen': 4.8, 'Ke Li': 2.5, 'Anders Miltner': 4.6, 'Nick Sumner': 4.4 };
  const top = topRatedByTerm((n) => ratings[n] ?? null);

  it('lists five per term, best-rated first, then by value', () => {
    for (const t of ['spring', 'summer', 'fall'] as const) expect(top[t]).toHaveLength(5);
    expect(top.spring[0]).toMatchObject({ code: 'CMPT 379', instructor: 'Anders Miltner', rating: 4.6, expectedInstructor: false });
    expect(top.fall[0]).toMatchObject({ code: 'CMPT 410', instructor: 'Mo Chen', expectedInstructor: true });
    expect(top.fall[1].instructor).toBe('Nick Sumner');
    // Nothing you've taken or can't take.
    for (const t of ['spring', 'summer', 'fall'] as const) for (const o of top[t]) expect(['eligible', 'check']).toContain(eligibility(COURSES[o.code]).status);
  });
});
