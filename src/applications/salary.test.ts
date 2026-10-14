import { describe, expect, it } from 'vitest';
import { formatSalary, parseSalary } from './salary';

describe('parseSalary', () => {
  it('reads a yearly range with a currency code', () => {
    expect(parseSalary('The base salary range is $120,000 – $150,000 CAD.')).toEqual({
      text: '$120,000 – $150,000 CAD / year',
      min: 120000,
      max: 150000,
      currency: 'CAD',
      period: 'year',
    });
  });
  it('reads hourly ranges', () => {
    expect(parseSalary('Pay: $60–75/hr')).toMatchObject({ min: 60, max: 75, period: 'hour' });
    expect(parseSalary('$28.50 to $32 per hour')).toMatchObject({ min: 28.5, max: 32, period: 'hour' });
  });
  it('handles k and prefixed currencies', () => {
    expect(parseSalary('Compensation: CA$140K – CA$170K')).toMatchObject({ min: 140000, max: 170000, currency: 'CAD' });
    expect(parseSalary('Salary range 150k-190k USD')).toMatchObject({ min: 150000, max: 190000, currency: 'USD' });
    expect(parseSalary('£55,000 per annum')).toMatchObject({ min: 55000, currency: 'GBP', period: 'year' });
  });
  it('prefers the line that talks about pay', () => {
    const text = 'We raised $40,000,000 last year.\nThe salary for this role is $95,000 - $110,000.';
    expect(parseSalary(text)).toMatchObject({ min: 95000, max: 110000 });
  });
  it('ignores amounts that are not pay', () => {
    expect(parseSalary('3+ years of experience')).toBeUndefined();
    expect(parseSalary('A $500 learning budget')).toBeUndefined();
    expect(parseSalary('Competitive pay and a 401k match')).toBeUndefined();
  });
});

describe('formatSalary', () => {
  it('formats single values and ranges', () => {
    expect(formatSalary({ min: 90000, period: 'year' })).toBe('$90,000 / year');
    expect(formatSalary({ min: 50000, max: 60000, currency: 'EUR', period: 'year' })).toBe('€50,000 – €60,000 / year');
  });
});
