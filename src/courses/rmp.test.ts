import { describe, expect, it } from 'vitest';
import { clip, lookup, parseProfile, parseTeachers, pickTeacher, ratingLine, rmpSearchUrl, type RmpTeacher } from './rmp';

const teacher = (o: Partial<RmpTeacher> & { legacyId: number }) => ({
  __typename: 'Teacher',
  id: `VGVhY2hlci0${o.legacyId}`,
  firstName: 'Brian',
  lastName: 'Fraser',
  department: 'Computer Science',
  avgRating: 4.6,
  avgDifficulty: 3.2,
  numRatings: 120,
  wouldTakeAgainPercent: 95.5,
  ...o,
});

const relayPage = (store: object) => `<html><script>
window.__RELAY_STORE__ = ${JSON.stringify(store)};
window.process = {};
</script></html>`;

const search = relayPage({
  'client:root': { __id: 'client:root' },
  a: teacher({ legacyId: 1442290 }),
  b: teacher({ legacyId: 99, firstName: 'Brian', lastName: 'Fraser', department: 'History', numRatings: 300 }),
  c: teacher({ legacyId: 7, firstName: 'Simon', lastName: 'Fraser', numRatings: 3 }),
});

const profile = relayPage({
  a: teacher({ legacyId: 1442290 }),
  t1: { __typename: 'TeacherRatingTags', tagName: 'Amazing lectures', tagCount: 30 },
  t2: { __typename: 'TeacherRatingTags', tagName: 'Lots of homework', tagCount: 40 },
  t3: { __typename: 'TeacherRatingTags', tagName: 'Caring', tagCount: 5 },
  r1: { __typename: 'Rating', class: 'CMPT433', date: '2025-04-20 01:00:00 +0000 UTC', clarityRating: 5, helpfulRating: 5, difficultyRating: 4, comment: 'Great  projects,\n hard labs.' },
  r2: { __typename: 'Rating', class: 'CMPT213', date: '2024-01-02 01:00:00 +0000 UTC', clarityRating: 4, helpfulRating: 4, difficultyRating: 3, comment: 'Clear.' },
});

describe('RateMyProfessors', () => {
  it('reads teachers from the Relay store', () => {
    expect(parseTeachers(search).map((t) => t.id)).toEqual([1442290, 99, 7]);
  });

  it('reads Next.js page data too', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { teacher: teacher({ legacyId: 5 }) } } })}</script>`;
    expect(parseTeachers(html)[0]).toMatchObject({ id: 5, avgRating: 4.6 });
  });

  it('copes with a page that has no data', () => {
    expect(parseTeachers('<html>Just a moment…</html>')).toEqual([]);
    expect(parseTeachers('<script>window.__RELAY_STORE__ = {broken\n</script>')).toEqual([]);
  });

  it('picks the computing professor with that name', () => {
    expect(pickTeacher('Brian Fraser', parseTeachers(search))?.id).toBe(1442290);
    expect(pickTeacher('Ada Lovelace', parseTeachers(search))).toBeNull();
    // Initials and accents.
    const ts = [{ ...parseTeachers(search)[0], firstName: 'B.', lastName: 'Fraser' }];
    expect(pickTeacher('Brian Fraser', ts)?.id).toBe(1442290);
    const ks = [{ ...ts[0], firstName: 'Évgenia', lastName: 'Ternovska' }];
    expect(pickTeacher('Evgenia Ternovska', ks)).not.toBeNull();
    // A different first name only when one computing professor has the last name.
    const noSimon = parseTeachers(search).filter((t) => t.id !== 7);
    expect(pickTeacher('William Fraser', noSimon)?.id).toBe(1442290);
    // Brian and Simon both teach computing: no guess.
    expect(pickTeacher('William Fraser', parseTeachers(search))).toBeNull();
  });

  it('summarizes a profile: tags by count, newest reviews first', () => {
    const s = parseProfile(profile, 1442290, 1)!;
    expect(s.tags).toEqual(['Lots of homework', 'Amazing lectures', 'Caring']);
    expect(s.reviews.map((r) => r.course)).toEqual(['CMPT433', 'CMPT213']);
    expect(s.reviews[0]).toMatchObject({ comment: 'Great projects, hard labs.', quality: 5, difficulty: 4 });
    expect(ratingLine(s)).toBe('4.6/5 · difficulty 3.2 · 96% would take again · 120 ratings');
    expect(ratingLine({ ...s, wouldTakeAgainPercent: -1, numRatings: 1 })).toBe('4.6/5 · difficulty 3.2 · 1 rating');
    expect(ratingLine({ ...s, numRatings: 0 })).toBe('No ratings yet');
  });

  it('looks up Burnaby, then Surrey, then the profile', async () => {
    const asked: string[] = [];
    const fetchHtml = async (url: string) => {
      asked.push(url);
      if (url.includes('/1482?')) return relayPage({});
      if (url.includes('/4267?')) return search;
      return profile;
    };
    const s = await lookup('Brian Fraser', fetchHtml, 1);
    expect(s?.tags).toHaveLength(3);
    expect(asked).toEqual([rmpSearchUrl('Brian Fraser'), rmpSearchUrl('Brian Fraser', 4267), 'https://www.ratemyprofessors.com/professor/1442290']);
    expect(await lookup('Nobody Here', async () => relayPage({}))).toBeNull();
  });

  it('keeps the search numbers when the profile fails', async () => {
    const s = await lookup('Brian Fraser', async (url) => {
      if (url.includes('/professor/')) throw new Error('blocked');
      return search;
    });
    expect(s).toMatchObject({ id: 1442290, avgRating: 4.6, tags: [] });
  });

  it('clips long comments at a word', () => {
    expect(clip('short')).toBe('short');
    expect(clip('one two three four five', 12)).toBe('one two…');
  });
});
