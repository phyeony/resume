// Finds a pay range in posting text: "$120,000 – $150,000 CAD", "$60–75/hr", "CA$140K", "150k-190k USD".

import type { Salary, SalaryPeriod } from '../model/types';

const CUR = '(?:US|CA|C|AU|A|NZ)?\\$|£|€|USD|CAD|EUR|GBP|AUD';
const NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
const AMOUNT = `(${CUR})?\\s?(${NUM})\\s?([kK])?(?![\\w%])`;
const CODE_AFTER = '(?:\\s?(USD|CAD|EUR|GBP|AUD))?';
// groups: 1 currency, 2 number, 3 k, 4 currency, 5 number, 6 k, 7 trailing code
const RANGE = new RegExp(`(?<![\\w.,])${AMOUNT}(?:\\s?(?:-|–|—|to)\\s?${AMOUNT})?${CODE_AFTER}`, 'g');

const PERIOD_AFTER =
  /^\s*(?:(?:\/|per|an|a)\s*(hour|hr|h|day|week|wk|month|mo|year|yr|annum)\b|(hourly|daily|weekly|monthly|annually|annual|yearly))/i;
const KEYWORDS = /salary|compensation|pay\b|base|range|wage|rate|\bote\b/i;

const PERIODS: Record<string, SalaryPeriod> = {
  hour: 'hour', hr: 'hour', h: 'hour', hourly: 'hour',
  day: 'day', daily: 'day',
  week: 'week', wk: 'week', weekly: 'week',
  month: 'month', mo: 'month', monthly: 'month',
  year: 'year', yr: 'year', annum: 'year', annually: 'year', annual: 'year', yearly: 'year',
};

const CODES: Record<string, string> = {
  US$: 'USD', CA$: 'CAD', C$: 'CAD', AU$: 'AUD', A$: 'AUD', NZ$: 'NZD', '£': 'GBP', '€': 'EUR',
};

function toNumber(num: string, k: boolean): number {
  const n = Number(num.replace(/,/g, ''));
  return k ? n * 1000 : n;
}

interface Candidate {
  salary: Salary;
  score: number;
}

function candidatesIn(line: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of line.matchAll(RANGE)) {
    const [, cur1, num1, k1, cur2, num2, k2, codeAfter] = m;
    const hasK = !!(k1 || k2);
    const marker = cur1 || cur2 || codeAfter;
    if (!marker && !(hasK && KEYWORDS.test(line))) continue;
    if (num1 === '401' && k1 && !num2) continue; // the retirement plan
    // "150-190k": one k covers both ends
    const min = toNumber(num1, !!k1 || (!!k2 && Number(num1) < 1000));
    const max = num2 ? toNumber(num2, !!k2 || (!!k1 && Number(num2) < 1000)) : undefined;
    if (max !== undefined && max < min) continue;

    const after = line.slice(m.index! + m[0].length);
    const p = PERIOD_AFTER.exec(after) ?? /\b(hourly|annually|yearly|monthly)\b/i.exec(line);
    let period: SalaryPeriod | undefined = p ? PERIODS[(p[1] ?? p[2] ?? p[0]).toLowerCase()] : undefined;
    const top = max ?? min;
    if (!period) {
      if (top >= 15000) period = 'year';
      else if (top <= 300 && top >= 10) period = 'hour';
      else continue; // "$500 learning budget", "$5 per…"
    }
    if (period === 'year' && top < 15000) continue;
    if (period === 'hour' && (top < 10 || top > 1000)) continue;

    const symbol = [cur1, cur2].find(Boolean);
    const currency = codeAfter || (symbol && (CODES[symbol] ?? (/^[A-Z]{3}$/.test(symbol) ? symbol : undefined)));
    const salary: Salary = { text: '', min, ...(max !== undefined && max !== min ? { max } : {}), period };
    if (currency) salary.currency = currency;
    salary.text = formatSalary(salary);
    out.push({ salary, score: (KEYWORDS.test(line) ? 2 : 0) + (max !== undefined ? 1 : 0) });
  }
  return out;
}

/** The most salary-looking range in the text, or undefined. */
export function parseSalary(text: string): Salary | undefined {
  let best: Candidate | undefined;
  for (const line of text.split(/\n+/)) {
    for (const c of candidatesIn(line)) if (!best || c.score > best.score) best = c;
  }
  return best?.salary;
}

const PERIOD_LABEL: Record<SalaryPeriod, string> = { hour: 'hour', day: 'day', week: 'week', month: 'month', year: 'year' };

/** "$120,000 – $150,000 CAD / year" */
export function formatSalary(s: Omit<Salary, 'text'>): string {
  if (s.min === undefined) return '';
  const sym = s.currency === 'GBP' ? '£' : s.currency === 'EUR' ? '€' : '$';
  const fmt = (n: number) => sym + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const code = s.currency && !['GBP', 'EUR'].includes(s.currency) ? ` ${s.currency}` : '';
  const range = s.max !== undefined ? `${fmt(s.min)} – ${fmt(s.max)}` : fmt(s.min);
  return `${range}${code}${s.period ? ` / ${PERIOD_LABEL[s.period]}` : ''}`;
}
