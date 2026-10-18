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
  fill(kit: ApplyKit, opts?: { keepExperience?: boolean }): Promise<Report>;
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
    expect(r.left).toEqual([{ question: 'Current company', required: false, why: 'no answer saved for currentCompany' }]);
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

describe('Workday work experience', () => {
  const jobs: NonNullable<ApplyKit['experience']> = [
    { title: 'Software Developer', company: 'Korea Air Force', location: 'Daejeon, Korea', startMonth: 11, startYear: 2024, current: true, description: '• Cut latency by 90%' },
    { title: 'DevOps Intern', company: 'Scotiabank', location: 'ON', startMonth: 9, startYear: 2021, endMonth: 6, endYear: 2022, current: false, description: '• Built CI/CD' },
  ];

  // A stand-in for Workday's My Experience page, with the ids and roles seen on a live tenant.
  let next = 5;
  function panelHtml(n: number, title = '', company = '') {
    const id = `workExperience-${next++}`;
    return `<div role="group" aria-labelledby="Work-Experience-${n}-panel"><h4 id="Work-Experience-${n}-panel">Work Experience ${n}</h4>
      <button type="button" class="del">Delete</button>
      <div data-automation-id="formField-jobTitle"><label for="${id}--jobTitle">Job Title*</label><input id="${id}--jobTitle" value="${title}"></div>
      <div data-automation-id="formField-companyName"><label for="${id}--companyName">Company*</label><input id="${id}--companyName" value="${company}"></div>
      <div data-automation-id="formField-location"><label for="${id}--location">Location</label><input id="${id}--location"></div>
      <div data-automation-id="formField-currentlyWorkHere"><label for="${id}--currentlyWorkHere">I currently work here</label><input type="checkbox" id="${id}--currentlyWorkHere"></div>
      <div data-automation-id="formField-startDate"><input id="${id}--startDate-dateSectionMonth-input" role="spinbutton" aria-label="Month"><input id="${id}--startDate-dateSectionYear-input" role="spinbutton" aria-label="Year"></div>
      <div data-automation-id="formField-endDate"><input id="${id}--endDate-dateSectionMonth-input" role="spinbutton" aria-label="Month"><input id="${id}--endDate-dateSectionYear-input" role="spinbutton" aria-label="Year"></div>
      <div data-automation-id="formField-roleDescription"><label for="${id}--roleDescription">Role Description</label><textarea id="${id}--roleDescription"></textarea></div>
    </div>`;
  }

  function workday(parsed: [string, string][]) {
    document.body.innerHTML = `<div data-automation-id="applyFlowMyExpPage">
      <div role="group" aria-labelledby="Work-Experience-section"><h3 id="Work-Experience-section">Work Experience</h3>
        <div class="panels">${parsed.map(([t, c], i) => panelHtml(i + 1, t, c)).join('')}</div>
        <button type="button" data-automation-id="add-button">Add Another</button></div>
      <div role="group" aria-labelledby="Education-section"><h3 id="Education-section">Education</h3>
        <label for="school">School or University</label><input id="school"></div>
    </div>`;
    const panels = document.querySelector('.panels')!;
    document.querySelector('[data-automation-id="add-button"]')!.addEventListener('click', () =>
      setTimeout(() => panels.insertAdjacentHTML('beforeend', panelHtml(panels.children.length + 1)), 50),
    );
    panels.addEventListener('click', (e) => {
      const b = e.target as HTMLElement;
      if (b.classList.contains('del')) setTimeout(() => b.parentElement!.remove(), 50);
    });
    // Ticking "I currently work here" removes the To date, like Workday.
    panels.addEventListener('change', (e) => {
      const c = e.target as HTMLInputElement;
      if (c.id.endsWith('--currentlyWorkHere') && c.checked) c.closest('[role="group"]')!.querySelector('[data-automation-id="formField-endDate"]')!.remove();
    });
  }

  const entries = () =>
    [...document.querySelectorAll('[aria-labelledby$="-panel"]')].map((p) => {
      const f = (n: string) => (p.querySelector(`[id$="--${n}"]`) as HTMLInputElement | null)?.value ?? null;
      const cur = (p.querySelector('[id$="--currentlyWorkHere"]') as HTMLInputElement).checked;
      return [f('jobTitle'), f('companyName'), f('location'), cur, f('startDate-dateSectionMonth-input'), f('startDate-dateSectionYear-input'), f('endDate-dateSectionMonth-input'), f('endDate-dateSectionYear-input'), f('roleDescription')];
    });

  it("replaces Workday's parsed entries with the kit's jobs", async () => {
    workday([
      ['Developer Korea', 'Air Force Daejeon'],
      ['Intern', ''],
      ['', 'Scotiabank, ON'],
    ]);
    const r = await filler().fill({ ...kit(), experience: jobs });
    expect(entries()).toEqual([
      ['Software Developer', 'Korea Air Force', 'Daejeon, Korea', true, '11', '2024', null, null, '• Cut latency by 90%'],
      ['DevOps Intern', 'Scotiabank', 'ON', false, '9', '2021', '6', '2022', '• Built CI/CD'],
    ]);
    expect((r as Report & { experience: string }).experience).toBe(
      'replaced 3 Workday entries (Developer Korea at Air Force Daejeon; Intern; Scotiabank, ON) with your 2 jobs',
    );
    // The rest of the page still gets the usual filling.
    expect(val('#school')).toBe('University of Example');
    expect(r.left.filter((x) => x.question.includes('Job Title'))).toEqual([]);
  });

  it('adds the jobs when Workday has none, and leaves a matching page alone on a second run', async () => {
    workday([]);
    await filler().fill({ ...kit(), experience: jobs });
    expect(entries().map((e) => e[0])).toEqual(['Software Developer', 'DevOps Intern']);
    const r = await filler().fill({ ...kit(), experience: jobs });
    expect((r as Report & { experience: string }).experience).toBe('already matches your resume');
    expect(entries()).toHaveLength(2);
  });

  it('keeps the entries when asked, and with an old kit says to download a new one', async () => {
    workday([['Intern', 'Acme']]);
    const kept = await filler().fill({ ...kit(), experience: jobs }, { keepExperience: true });
    expect((kept as Report & { experience: string }).experience).toBe("kept Workday's entries");
    const old = await filler().fill(kit());
    expect(old.left).toContainEqual({ question: 'Work experience', required: true, why: 'no work experience in the kit: download a new kit from Profile' });
    expect(entries().map((e) => e[0])).toEqual(['Intern']);
  });

  it('leaves dates the kit lacks for you', async () => {
    workday([]);
    const r = await filler().fill({ ...kit(), experience: [{ title: 'Intern', company: 'Acme', location: '', current: false, description: '' }] });
    expect(entries()).toEqual([['Intern', 'Acme', '', false, '', '', '', '', '']]);
    expect(r.left.map((x) => x.question)).toEqual(['Intern at Acme: From', 'Intern at Acme: To']);
  });
});

describe('work experience on other sites', () => {
  const jobs: NonNullable<ApplyKit['experience']> = [
    { title: 'Software Developer', company: 'Korea Air Force', location: 'Daejeon, Korea', startMonth: 11, startYear: 2024, endMonth: 8, endYear: 2026, current: false, description: '• Cut latency by 90%' },
    { title: 'Application Developer', company: 'Cambian', location: 'BC', startMonth: 11, startYear: 2022, endMonth: 7, endYear: 2024, current: false, description: '• Built Lambdas' },
    { title: 'DevOps Intern', company: 'Scotiabank', location: 'ON', startMonth: 9, startYear: 2021, endMonth: 6, endYear: 2022, current: false, description: '• Built CI/CD' },
  ];
  const withJobs = () => ({ ...kit(), experience: jobs });

  // iCIMS/SuccessFactors-style: labelled fields per entry, month/year selects, and an "Add" that appends one.
  function jobHtml(i: number) {
    const months = ['Month', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      .map((m, k) => `<option value="${k || ''}">${m}</option>`).join('');
    const years = ['Year', ...Array.from({ length: 10 }, (_, k) => String(2018 + k))].map((y) => `<option value="${y === 'Year' ? '' : y}">${y}</option>`).join('');
    return `<div class="job">
      <label for="t${i}">Job Title</label><input id="t${i}" name="experience[${i}][title]">
      <label for="c${i}">Employer</label><input id="c${i}" name="experience[${i}][company]">
      <label for="l${i}">City</label><input id="l${i}">
      <label for="sm${i}">Start Month</label><select id="sm${i}">${months}</select>
      <label for="sy${i}">Start Year</label><select id="sy${i}">${years}</select>
      <label for="em${i}">End Month</label><select id="em${i}">${months}</select>
      <label for="ey${i}">End Year</label><select id="ey${i}">${years}</select>
      <label for="d${i}">Responsibilities</label><textarea id="d${i}"></textarea>
    </div>`;
  }

  function form(entries: number, opts: { add?: boolean; firstTitle?: string; firstCompany?: string } = {}) {
    document.body.innerHTML = `<form>
      <label for="fn">First name</label><input id="fn">
      <section id="exp"><h3>Work History</h3>${Array.from({ length: entries }, (_, i) => jobHtml(i)).join('')}
        ${opts.add ? '<button type="button" id="add">+ Add another</button>' : ''}</section>
      <label for="avail">Available start date</label><input id="avail">
    </form>`;
    if (opts.firstTitle) (document.querySelector('#t0') as HTMLInputElement).value = opts.firstTitle;
    if (opts.firstCompany) (document.querySelector('#c0') as HTMLInputElement).value = opts.firstCompany;
    const exp = document.querySelector('#exp')!;
    document.querySelector('#add')?.addEventListener('click', () =>
      setTimeout(() => document.querySelector('#add')!.insertAdjacentHTML('beforebegin', jobHtml(exp.querySelectorAll('.job').length)), 30),
    );
  }

  const job = (i: number) => ['t', 'c', 'l', 'sm', 'sy', 'em', 'ey', 'd'].map((k) => val(`#${k}${i}`));

  it('fills the blank entry, clicks Add for the rest, and leaves other questions to the usual rules', async () => {
    form(1, { add: true });
    const r = await filler().fill(withJobs());
    expect([job(0), job(1), job(2)]).toEqual([
      ['Software Developer', 'Korea Air Force', 'Daejeon, Korea', '11', '2024', '8', '2026', '• Cut latency by 90%'],
      ['Application Developer', 'Cambian', 'BC', '11', '2022', '7', '2024', '• Built Lambdas'],
      ['DevOps Intern', 'Scotiabank', 'ON', '9', '2021', '6', '2022', '• Built CI/CD'],
    ]);
    expect((r as Report & { experience: string }).experience).toBe('filled 3 jobs into the form');
    expect(val('#fn')).toBe('Ada');
    // The job start dates aren't mistaken for "available start date", and vice versa.
    expect(val('#avail')).toBe('');
  });

  it("skips a job that's already there and says when it runs out of entries", async () => {
    form(2, { firstTitle: 'Software Developer', firstCompany: 'Korea Air Force' });
    const r = await filler().fill(withJobs());
    expect(val('#t0')).toBe('Software Developer');
    expect(val('#sy0')).toBe('');
    expect(job(1).slice(0, 2)).toEqual(['Application Developer', 'Cambian']);
    expect(r.left).toContainEqual({ question: 'Work experience', required: false, why: 'filled 1 of 2 jobs; add the rest yourself' });
  });

  it('writes single date fields in the format they ask for', async () => {
    document.body.innerHTML = `<div class="job">
      <label for="t">Position</label><input id="t"><label for="c">Company name</label><input id="c">
      <label for="s">From</label><input id="s" type="month"><label for="e">To</label><input id="e" placeholder="MM/YYYY">
      <label><input type="checkbox" id="cur"> I currently work here</label></div>`;
    await filler().fill({ ...kit(), experience: [jobs[1]] });
    expect([val('#t'), val('#c'), val('#s'), val('#e')]).toEqual(['Application Developer', 'Cambian', '2022-11', '07/2024']);
    expect((document.querySelector('#cur') as HTMLInputElement).checked).toBe(false);
  });

  it("leaves a references entry and a form's single job questions out of it", async () => {
    document.body.innerHTML = `<form>
      <div class="ref"><label for="rn">Reference name</label><input id="rn"><label for="rt">Title</label><input id="rt">
        <label for="rc">Company</label><input id="rc"><label for="re">Email</label><input id="re"></div>
      <label for="em">Email</label><input id="em"><label for="pt">Position title</label><input id="pt">
      <label for="co">Company</label><input id="co"><label for="cl">Cover letter</label><textarea id="cl"></textarea></form>`;
    const r = await filler().fill(withJobs());
    expect([val('#rt'), val('#rc'), val('#pt'), val('#co'), val('#cl')]).toEqual(['', '', '', '', '']);
    expect((r as Report & { experience?: string }).experience).toBeUndefined();
  });

  it('answers "current company" and "current title" from the latest job', async () => {
    document.body.innerHTML = `<label for="cc">Current company</label><input id="cc"><label for="ct">Current job title</label><input id="ct">`;
    await filler().fill(withJobs());
    expect([val('#cc'), val('#ct')]).toEqual(['Korea Air Force', 'Software Developer']);
  });
});
