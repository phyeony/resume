import { describe, expect, it } from 'vitest';
import { decodeBase64Url, toMailMessage } from './gmail';

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('toMailMessage', () => {
  it('reads headers and the plain-text part of a multipart email', () => {
    const m = toMailMessage({
      id: 'g1',
      internalDate: '1760000000000',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>' },
          { name: 'Subject', value: 'software engineer intern: Acme' },
        ],
        parts: [
          { mimeType: 'text/plain', body: { data: b64url('Software Engineer Intern\nAcme — Montréal') } },
          { mimeType: 'text/html', body: { data: b64url('<p>html</p>') } },
        ],
      },
    });
    expect(m).toEqual({
      id: 'g1',
      from: 'LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>',
      to: '',
      subject: 'software engineer intern: Acme',
      body: 'Software Engineer Intern\nAcme — Montréal',
      date: 1760000000000,
    });
  });

  it('leaves the body empty when there is no plain text', () => {
    expect(toMailMessage({ id: 'g2', internalDate: '0', payload: { mimeType: 'text/html', body: { data: b64url('<p>x</p>') } } }).body).toBe('');
  });
});

describe('decodeBase64Url', () => {
  it('decodes URL-safe base64 as UTF-8', () => {
    expect(decodeBase64Url(b64url('?>?> é ✓'))).toBe('?>?> é ✓');
  });
});
