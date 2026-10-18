import { describe, expect, it } from 'vitest';
import { answersFromProfile, emptyAnswers, kitProblems, makeKit, MAX_TRANSCRIPT_BYTES, toBase64, transcriptFileName, transcriptProblem, withAnswerDefaults } from './applyKit';
import { appliedFromLead, currentStage } from './model';
import type { Lead, Profile, Version } from '../model/types';

const profile: Profile = {
  name: 'Ada Mary Lovelace',
  contacts: [
    { id: '1', kind: 'email', label: 'ada@example.com', href: 'mailto:ada@example.com', isDefault: true },
    { id: '2', kind: 'linkedin', label: 'ada', href: 'https://www.linkedin.com/in/ada', isDefault: true },
    { id: '3', kind: 'location', label: 'Vancouver, BC, Canada', isDefault: true },
    { id: '4', kind: 'phone', label: '555-0100', href: 'tel:+15550100', isDefault: false },
  ],
};

describe('answersFromProfile', () => {
  it('fills name, contacts and location', () => {
    const a = answersFromProfile(profile);
    expect([a.firstName, a.lastName]).toEqual(['Ada Mary', 'Lovelace']);
    expect(a.email).toBe('ada@example.com');
    expect(a.phone).toBe('+15550100');
    expect(a.linkedin).toBe('https://www.linkedin.com/in/ada');
    expect([a.city, a.region, a.country]).toEqual(['Vancouver', 'BC', 'Canada']);
  });

  it('reads "City, XX" as a province or state, "City, Country" as a country', () => {
    const at = (label: string) => answersFromProfile({ name: 'A B', contacts: [{ id: 'l', kind: 'location', label, isDefault: true }] });
    expect([at('Vancouver, BC').region, at('Vancouver, BC').country]).toEqual(['BC', '']);
    expect([at('Seoul, South Korea').region, at('Seoul, South Korea').country]).toEqual(['', 'South Korea']);
  });

  it('starts with a catch-all work authorization row', () => {
    expect(answersFromProfile(null).workAuth.map((w) => w.country)).toEqual(['*']);
  });
});

describe('withAnswerDefaults', () => {
  it('keeps stored answers and adds fields added later', () => {
    const a = withAnswerDefaults({ firstName: 'X', custom: [] }, profile);
    expect(a.firstName).toBe('X');
    expect(a.veteran).toBe(emptyAnswers().veteran);
  });
});

describe('kitProblems', () => {
  it('asks for name and email', () => {
    expect(kitProblems(emptyAnswers())).toHaveLength(2);
    expect(kitProblems(answersFromProfile(profile))).toEqual([]);
  });
});

describe('makeKit', () => {
  it('embeds the PDF and remembers the version', () => {
    const v = { id: 'v1', name: 'Backend', snapshot: { name: 'Ada Lovelace', contacts: [], sections: [] } } as unknown as Version;
    const kit = makeKit(answersFromProfile(profile), v, new Uint8Array([37, 80, 68, 70]), 5);
    expect(kit.resume).toEqual({ versionId: 'v1', versionName: 'Backend', fileName: 'Ada_Lovelace_Resume.pdf', pdfBase64: 'JVBERg==' });
    expect(kit.answers.kitVersionId).toBe('v1');
  });

  it('carries the transcript under a standard name, and leaves it out when there is none', () => {
    const v = { id: 'v1', name: 'Backend', snapshot: { name: 'Ada Lovelace', contacts: [], sections: [] } } as unknown as Version;
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const t = { fileName: 'SFU_unofficial(2).pdf', pdfBase64: 'JVBERi0=', uploadedAt: 1 };
    expect(makeKit(answersFromProfile(profile), v, pdf, 5, t).transcript).toEqual({ fileName: 'Ada_Mary_Lovelace_Transcript.pdf', pdfBase64: 'JVBERi0=' });
    expect('transcript' in makeKit(answersFromProfile(profile), v, pdf, 5, null)).toBe(false);
  });

  it('base64-encodes large files', () => {
    const big = new Uint8Array(100_000).fill(65);
    expect(atob(toBase64(big))).toHaveLength(100_000);
  });
});

describe('transcript', () => {
  it('accepts a PDF up to the limit only', () => {
    const pdf = (n: number) => Object.assign(new Uint8Array(n), { 0: 37, 1: 80, 2: 68, 3: 70 });
    expect(transcriptProblem(pdf(1000), 't.pdf')).toBeNull();
    expect(transcriptProblem(pdf(MAX_TRANSCRIPT_BYTES + 1), 't.pdf')).toMatch(/limit is 700 KB/);
    expect(transcriptProblem(new TextEncoder().encode('hello'), 't.docx')).toBe("t.docx isn't a PDF.");
  });

  it('names the file after the applicant', () => {
    expect(transcriptFileName({ firstName: 'Hyeonyoung', lastName: 'Park' })).toBe('Hyeonyoung_Park_Transcript.pdf');
    expect(transcriptFileName({ firstName: '', lastName: '' })).toBe('Transcript.pdf');
  });
});

describe('appliedFromLead', () => {
  it('creates an application at stage applied with the version sent', () => {
    const lead: Lead = { id: 'l1', company: 'Acme', role: 'Intern', url: 'https://x.test/j', source: 'Simplify', addedAt: 1, status: 'new' };
    const a = appliedFromLead('a1', lead, 'v1', 10);
    expect(currentStage(a)).toBe('applied');
    expect([a.company, a.role, a.url, a.source, a.versionId]).toEqual(['Acme', 'Intern', 'https://x.test/j', 'Simplify', 'v1']);
  });
});
