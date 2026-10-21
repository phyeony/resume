// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableJavaScriptEvaluation":true}}
import { describe, expect, it } from 'vitest';
import { capturePosting } from './capture';
import { asPage, holdsPosting, pageUrlFor } from './pageFetch';

describe('pageUrlFor', () => {
  it('sends LinkedIn jobs to the guest page', () => {
    expect(pageUrlFor('https://www.linkedin.com/jobs/view/4012345678/')).toBe('https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4012345678');
    expect(pageUrlFor('https://www.linkedin.com/jobs/search/?currentJobId=4012345678')).toBe(
      'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4012345678',
    );
  });
  it('leaves other sites alone', () => {
    expect(pageUrlFor('https://job-boards.greenhouse.io/acme/jobs/123')).toBe('https://job-boards.greenhouse.io/acme/jobs/123');
  });
});

describe('holdsPosting', () => {
  const long = 'Build and run payment services used by thousands of merchants across Canada. '.repeat(8);
  it('accepts LinkedIn’s guest page', () => {
    const html = `<section class="description"><div class="show-more-less-html__markup"><p>${long}</p><ul><li>Go</li></ul></div></section>`;
    expect(holdsPosting(capturePosting({ html }))).toBe(true);
  });
  it('accepts a page with JobPosting data', () => {
    const ld = { '@type': 'JobPosting', title: 'Intern', description: '<p>Short but real.</p>' };
    const html = `<html><body><div id="root"></div><script type="application/ld+json">${JSON.stringify(ld)}</script></body></html>`;
    expect(holdsPosting(capturePosting({ html }))).toBe(true);
  });
  it('rejects an app shell', () => {
    const html = '<html><body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"><p>Loading…</p></div></body></html>';
    expect(holdsPosting(capturePosting({ html }))).toBe(false);
  });
});

describe('Workday', () => {
  const page = 'https://jj.wd5.myworkdayjobs.com/en-US/JJ/job/Cincinnati-Ohio-United-States-of-America/Digital-Solutions-Co-op_R-012345';
  it('fetches from the API the page calls', () => {
    expect(pageUrlFor(page)).toBe('https://jj.wd5.myworkdayjobs.com/wday/cxs/jj/JJ/job/Cincinnati-Ohio-United-States-of-America/Digital-Solutions-Co-op_R-012345');
    expect(pageUrlFor('https://acme.wd1.myworkdayjobs.com/Careers/job/Toronto/Intern_R-9')).toBe('https://acme.wd1.myworkdayjobs.com/wday/cxs/acme/Careers/job/Toronto/Intern_R-9');
  });
  it('keeps the description’s formatting', () => {
    const json = JSON.stringify({
      jobPostingInfo: { title: 'Digital Solutions Co-op', jobDescription: '<p><b>Qualifications</b></p><ul><li>GPA of 3.0 or above</li><li>Python</li></ul><p>' + 'Johnson &amp; Johnson is an equal opportunity employer. '.repeat(10) + '</p>' },
    });
    const c = capturePosting({ html: asPage(json) });
    expect(holdsPosting(c)).toBe(true);
    expect(c!.blocks[0].method).toBe('known:workday');
    expect(c!.blocks[0].html).toContain('<li>GPA of 3.0 or above</li>');
    expect(c!.firstHeading).toBe('Digital Solutions Co-op');
  });
});

describe('flat JobPosting data', () => {
  it('loses to the page’s own block, and its entities are read once', () => {
    const text = 'At Johnson &amp; Johnson, we believe health is everything. '.repeat(15);
    const ld = { '@type': 'JobPosting', title: 'Co-op', description: text };
    const html = `<html><body><script type="application/ld+json">${JSON.stringify(ld)}</script><div data-automation-id="jobPostingDescription"><h2>About</h2><p>${'We build things. '.repeat(20)}</p><ul><li>Python</li></ul></div></body></html>`;
    const c = capturePosting({ html })!;
    expect(c.blocks[0].method).toBe('known:workday');
    const fromLd = c.blocks.find((b) => b.method === 'json-ld')!;
    expect(fromLd.text).toContain('Johnson & Johnson');
    expect(fromLd.text).not.toContain('&amp;');
  });
});
