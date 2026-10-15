// The answer bank and the apply kit: what the autofill tools (tools/autofill/) fill application forms with.

import type { ApplicationAnswers, ApplyKit, Contact, Profile, Version } from '../model/types';

const DECLINE = 'Decline to self-identify';

export function emptyAnswers(): ApplicationAnswers {
  return {
    firstName: '',
    lastName: '',
    preferredName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    region: '',
    country: '',
    postalCode: '',
    linkedin: '',
    github: '',
    website: '',
    school: '',
    degree: '',
    major: '',
    graduation: '',
    startDate: '',
    salary: '',
    pronouns: '',
    gender: DECLINE,
    race: DECLINE,
    hispanic: DECLINE,
    veteran: DECLINE,
    disability: DECLINE,
    workAuth: [{ id: 'wa-any', country: '*', authorized: '', sponsorship: '' }],
    custom: [],
  };
}

/** Link target, or the shown text when there's none; mailto:/tel: stripped. */
function contactValue(c: Contact | undefined): string {
  if (!c) return '';
  const v = (c.href || c.label).trim();
  return v.replace(/^(mailto|tel):/i, '');
}

/** A first answer bank, filled from what the profile already knows. */
export function answersFromProfile(p: Profile | null): ApplicationAnswers {
  const a = emptyAnswers();
  if (!p) return a;
  const parts = p.name.trim().split(/\s+/);
  a.firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '';
  a.lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  const of = (k: Contact['kind']) => p.contacts.find((c) => c.kind === k);
  a.email = contactValue(of('email'));
  a.phone = contactValue(of('phone'));
  a.linkedin = contactValue(of('linkedin'));
  a.github = contactValue(of('github'));
  a.website = contactValue(of('url'));
  const loc = of('location')?.label.split(',').map((s) => s.trim()) ?? [];
  a.city = loc[0] ?? '';
  // "Vancouver, BC": a two-letter code is a province or state; "Seoul, South Korea": a country.
  const second = loc.length === 2 && /^[A-Z]{2}$/.test(loc[1]);
  a.region = loc.length > 2 ? loc[1] : second ? loc[1] : '';
  a.country = loc.length > 2 || (loc.length === 2 && !second) ? loc[loc.length - 1] : '';
  return a;
}

/** Answers saved before a field existed get its default. */
export function withAnswerDefaults(stored: Partial<ApplicationAnswers> | null, p: Profile | null): ApplicationAnswers {
  if (!stored) return answersFromProfile(p);
  return { ...emptyAnswers(), ...stored };
}

/** Problems that would make the kit fill forms wrongly. Empty when it's fine to download. */
export function kitProblems(a: ApplicationAnswers): string[] {
  const out: string[] = [];
  if (!a.firstName.trim() || !a.lastName.trim()) out.push('Add your first and last name.');
  if (!a.email.trim()) out.push('Add your email.');
  if (!a.workAuth.some((w) => w.country.trim() === '*')) out.push('Keep the "Any other country" work authorization row.');
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function kitFileBase(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Resume';
}

export function makeKit(answers: ApplicationAnswers, v: Version, pdf: Uint8Array, now = Date.now()): ApplyKit {
  return {
    kind: 'resume-studio-apply-kit',
    format: 1,
    createdAt: now,
    answers: { ...answers, kitVersionId: v.id },
    resume: {
      versionId: v.id,
      versionName: v.name,
      // Recruiters see this name; keep it plain.
      fileName: `${kitFileBase(v.snapshot.name)}_Resume.pdf`,
      pdfBase64: toBase64(pdf),
    },
  };
}
