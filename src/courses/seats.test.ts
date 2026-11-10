import { describe, expect, it } from 'vitest';
import { courseSeats, coursysTableUrl, fetchSeats, parseSeats, seatLine, seatTone } from './seats';

const table = JSON.stringify({
  draw: 1,
  recordsTotal: 3,
  recordsFiltered: 3,
  data: [
    ['Spring 2027', '<a href="/browse/info/2027sp-cmpt-431-d1">CMPT 431 D100</a>', 'Distributed Systems', '58/60 (+4)', 'Vora, Keval', 'Burnaby'],
    ['Spring 2027', '<a href="/browse/info/2027sp-cmpt-376w-d2">CMPT 376W D200</a>', 'Professional Responsibility', '40/40', '', 'Surrey'],
    ['Spring 2027', '<a href="/browse/info/2027sp-cmpt-376w-e1">CMPT 376W E100</a> <i></i><br> X <a href="/x">CMPT 376W E101</a>', 'Professional Responsibility', '12/40<br> X  3/5', '', 'Burnaby'],
  ],
});

describe('CourSys seats', () => {
  it('reads each section’s seats and waitlist', () => {
    expect(parseSeats(table)).toEqual({
      'CMPT 431 D100': { taken: 58, cap: 60, waitlist: 4 },
      'CMPT 376W D200': { taken: 40, cap: 40, waitlist: 0 },
      'CMPT 376W E100': { taken: 12, cap: 40, waitlist: 0 },
    });
  });

  it('reads rows sent as objects', () => {
    const body = JSON.stringify({ data: [{ coursecode: 'MACM&nbsp;476&nbsp;D100', enrol: '7/45' }] });
    expect(parseSeats(body)).toEqual({ 'MACM 476 D100': { taken: 7, cap: 45, waitlist: 0 } });
  });

  it('copes with a page that isn’t the table', () => {
    expect(parseSeats('<html>Sign in</html>')).toEqual({});
  });

  it('adds up a course and colours it', () => {
    const seats = parseSeats(table);
    expect(courseSeats(seats, 'CMPT 376W')).toEqual({ taken: 52, cap: 80, waitlist: 0 });
    expect(courseSeats(seats, 'CMPT 37')).toBeNull();
    expect(seatTone(seats['CMPT 376W D200'])).toBe('full');
    expect(seatTone(seats['CMPT 431 D100'])).toBe('almost');
    expect(seatTone(seats['CMPT 376W E100'])).toBe('open');
    expect(seatLine(seats['CMPT 431 D100'])).toBe('58/60 seats taken · 4 waitlisted');
  });

  it('asks CourSys once per subject', async () => {
    const asked: string[] = [];
    const seats = await fetchSeats(async (url) => {
      asked.push(url);
      return url.includes('CMPT') ? table : JSON.stringify({ data: [] });
    });
    expect(asked).toHaveLength(4);
    expect(asked[0]).toBe(coursysTableUrl('CMPT'));
    expect(Object.keys(seats)).toHaveLength(3);
  });
});
