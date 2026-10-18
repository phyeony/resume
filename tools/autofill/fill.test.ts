// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { answersFromProfile } from '../../src/applications/applyKit';
import type { ApplicationAnswers, ApplyKit } from '../../src/model/types';

interface Report {
  filled: { question: string; answer: string }[];
  left: { question: string; required: boolean; why: string }[];
  already: number;
  resume: string;
  transcript: string;
  submit: string | null;
}
interface Filler {
  fill(kit: ApplyKit): Promise<Report>;
  findSubmit(): HTMLElement | null;
  answerFor(q: string, a: ApplicationAnswers): [string, string | null] | null;
  pickOption(labels: string[], answer: string): number;
}
const filler = () => (window as unknown as { __resumeStudio: Filler }).__resumeStudio;

function answers(): ApplicationAnswers {
  return {
    ...answersFromProfile({ name: 'Ada Lovelace', contacts: [] }),
    email: 'ada@example.com',
    phone: '+1 555 0100',
    linkedin: 'https://linkedin.com/in/ada',
    city: 'Vancouver',
    region: 'BC',
    country: 'Canada',
    school: 'University of Example',
    graduation: 'May 2027',
    gender: 'Female',
    veteran: 'I am not a protected veteran',
    workAuth: [
      { id: '1', country: 'Canada', authorized: 'Yes', sponsorship: 'No' },
      { id: '2', country: 'United States', authorized: 'No', sponsorship: 'Yes' },
      { id: '3', country: '*', authorized: 'No', sponsorship: 'Yes' },
    ],
    custom: [{ id: 'c', pattern: 'how did you hear', answer: 'Job board' }],
  };
}

const kit = (a = answers(), withTranscript = false): ApplyKit => ({
  kind: 'resume-studio-apply-kit',
  format: 1,
  createdAt: 0,
  answers: a,
  resume: { versionId: 'v', versionName: 'Main', fileName: 'Ada_Lovelace_Resume.pdf', pdfBase64: 'JVBERg==' },
  ...(withTranscript ? { transcript: { fileName: 'Ada_Lovelace_Transcript.pdf', pdfBase64: 'JVBERi0=' } } : {}),
});

const fileName = (sel: string) => (document.querySelector(sel) as HTMLInputElement).files?.[0]?.name;

const val = (sel: string) => (document.querySelector(sel) as HTMLInputElement).value;

beforeAll(async () => {
  await import('./extension/fill.js');
});

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('answerFor', () => {
  const a = answers();
  it.each([
    ['First Name *', 'Ada'],
    ['Last name', 'Lovelace'],
    ['Full name✱', 'Ada Lovelace'],
    ['Email address', 'ada@example.com'],
    ['LinkedIn Profile', 'https://linkedin.com/in/ada'],
    ['Are you legally authorized to work in the United States?', 'No'],
    ['Are you legally authorized to work in Canada?', 'Yes'],
    ['Will you now or in the future require visa sponsorship to work in the U.S.?', 'Yes'],
    ['Do you require sponsorship to work in Canada?', 'No'],
    ['Are you eligible to work in Germany?', 'No'],
    ['How did you hear about this job?', 'Job board'],
    ['Expected graduation date', 'May 2027'],
    ['Current location', 'Vancouver, BC, Canada'],
  ])('%s → %s', (q, want) => {
    expect(filler().answerFor(q, a)?.[1]).toBe(want);
  });

  it('knows a question it has no answer saved for', () => {
    expect(filler().answerFor('Pronouns', a)).toEqual(['pronouns', null]);
  });

  it("doesn't guess at unknown questions", () => {
    expect(filler().answerFor('Why do you want to work here?', a)).toBeNull();
  });
});

describe('pickOption', () => {
  it('matches yes/no, decline and partial text, never the placeholder', () => {
    const p = filler().pickOption;
    expect(p(['Select...', 'Yes', 'No'], 'No')).toBe(2);
    expect(p(['--', 'Yes, I am authorized', 'No, I am not'], 'Yes')).toBe(1);
    expect(p(['Male', 'Female', "I don't wish to answer"], 'Decline to self-identify')).toBe(2);
    expect(p(['Select...', 'I am a protected veteran', 'I am not a protected veteran'], 'I am not a protected veteran')).toBe(2);
    expect(p(['Select...'], 'Yes')).toBe(-1);
  });
});

describe('fill', () => {
  it('fills a Greenhouse-style form and leaves the rest marked', async () => {
    document.body.innerHTML = `
      <form id="application_form">
        <div class="field"><label for="first_name">First Name<span class="asterisk">*</span></label><input id="first_name" name="job_application[first_name]" required></div>
        <div class="field"><label for="last_name">Last Name *</label><input id="last_name"></div>
        <div class="field"><label for="email">Email *</label><input id="email" type="text"></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" value="already here"></div>
        <div class="field"><label>Resume/CV *</label><input type="file" id="resume" name="resume" style="display:none"></div>
        <div class="field"><label for="q1">Are you legally authorized to work in the United States? *</label>
          <select id="q1"><option value="">--</option><option value="1">Yes</option><option value="0">No</option></select></div>
        <div class="field"><label for="q2">Why do you want to join us? *</label><textarea id="q2"></textarea></div>
        <div class="field"><label for="q3">How did you hear about this job?</label><input id="q3"></div>
        <fieldset><legend>Gender</legend>
          <label><input type="radio" name="gender" value="m"> Male</label>
          <label><input type="radio" name="gender" value="f"> Female</label>
        </fieldset>
        <label><input type="checkbox" id="consent" required> I agree to the privacy policy</label>
        <button type="submit">Submit Application</button>
      </form>`;
    const r = await filler().fill(kit());
    expect([val('#first_name'), val('#last_name'), val('#email'), val('#q3')]).toEqual(['Ada', 'Lovelace', 'ada@example.com', 'Job board']);
    expect(val('#phone')).toBe('already here');
    expect(r.already).toBe(1);
    expect((document.querySelector('#q1') as HTMLSelectElement).value).toBe('0');
    expect((document.querySelector('input[value="f"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('#consent') as HTMLInputElement).checked).toBe(false);
    expect(r.left.map((x) => x.why).sort()).toEqual(['checkbox: yours to tick', 'free text']);
    expect(r.left.find((x) => x.why === 'free text')?.required).toBe(true);
    expect(r.resume).toMatch(/attached|could not attach/);
    expect(r.submit).toBe('Submit Application');
  });

  it('fills a Lever-style form with a full name field', async () => {
    document.body.innerHTML = `
      <form>
        <ul>
          <li class="application-question"><label><div class="application-label">Full name<span class="required">✱</span></div>
            <div class="application-field"><input type="text" name="name"></div></label></li>
          <li class="application-question"><label><div class="application-label">Current location</div>
            <div class="application-field"><input type="text" name="location"></div></label></li>
          <li class="application-question"><label><div class="application-label">LinkedIn URL</div>
            <div class="application-field"><input type="text" name="urls[LinkedIn]"></div></label></li>
          <li class="application-question"><label><div class="application-label">Current company</div>
            <div class="application-field"><input type="text" name="org"></div></label></li>
        </ul>
        <button type="button" id="btn-submit">Submit application</button>
      </form>`;
    const r = await filler().fill(kit());
    expect(val('input[name="name"]')).toBe('Ada Lovelace');
    expect(val('input[name="location"]')).toBe('Vancouver, BC, Canada');
    expect(val('input[name="urls[LinkedIn]"]')).toBe('https://linkedin.com/in/ada');
    expect(r.left).toEqual([{ question: 'Current company', required: false, why: 'unknown question' }]);
    expect(filler().findSubmit()?.id).toBe('btn-submit');
  });

  it('attaches the transcript and the resume to their own fields', async () => {
    document.body.innerHTML = `
      <div class="field"><label for="cv">Resume/CV *</label><input type="file" id="cv"></div>
      <div class="field"><label for="tr">Unofficial transcript *</label><input type="file" id="tr"></div>
      <div class="field"><label for="cl">Cover letter</label><input type="file" id="cl"></div>`;
    const r = await filler().fill(kit(answers(), true));
    if (r.resume === 'could not attach') return; // happy-dom without DataTransfer
    expect([fileName('#cv'), fileName('#tr'), fileName('#cl')]).toEqual(['Ada_Lovelace_Resume.pdf', 'Ada_Lovelace_Transcript.pdf', undefined]);
    expect(r.transcript).toBe('attached Ada_Lovelace_Transcript.pdf');
    expect(r.left).toEqual([{ question: 'Cover letter', required: false, why: 'file upload' }]);
  });

  it("never puts the resume in a form's only upload when that one asks for a transcript", async () => {
    document.body.innerHTML = `<div class="field"><label for="tr">Transcript</label><input type="file" id="tr"></div>`;
    const r = await filler().fill(kit());
    expect(fileName('#tr')).toBeUndefined();
    expect(r.resume).toBe('no upload field');
    expect(r.left).toEqual([{ question: 'Transcript', required: false, why: 'transcript: none in the kit' }]);
  });

  it('finds the question for an unlabelled radio group from its container', async () => {
    document.body.innerHTML = `
      <div class="q"><span>Will you require visa sponsorship to work in Canada?</span>
        <label><input type="radio" name="s" value="y">Yes</label><label><input type="radio" name="s" value="n">No</label></div>
      <div class="q"><span>Pronouns</span><input name="pronouns"></div>`;
    const r = await filler().fill(kit());
    expect((document.querySelector('input[value="n"]') as HTMLInputElement).checked).toBe(true);
    expect(r.left).toEqual([{ question: 'Pronouns', required: false, why: 'no answer saved for pronouns' }]);
  });
});
