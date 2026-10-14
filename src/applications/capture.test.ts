// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableJavaScriptEvaluation":true}}
import { describe, expect, it } from 'vitest';
import { capturePosting, htmlToLines, sanitize, textToHtml } from './capture';
import { companyFromUrl, extractSections, fromTitle, placeFromLine, summarizeWithRules, workModeOf } from './summarize';

const COMPANY_PAGE = `
<html><head><title>Backend Engineer - Acme | Careers</title></head><body>
<header class="site-header"><a href="/">Acme</a><nav><a href="/about">About</a><a href="/jobs">Jobs</a></nav></header>
<div class="cookie-banner">We use cookies to improve your experience. <button>Accept</button></div>
<main>
  <div class="layout">
    <h1>Backend Engineer</h1>
    <div class="meta">Toronto, ON · Posted 3 days ago</div>
    <div class="job-body" style="color:red">
      <p>Acme builds payment infrastructure for small businesses across Canada and we are growing quickly.</p>
      <h2>What you'll do</h2>
      <ul><li>Design and build <b>payment APIs</b> used by thousands of merchants</li><li>Own services end to end, from design to on-call</li></ul>
      <h2>Requirements</h2>
      <ul><li>3+ years building backend services in Go, Java or Python</li><li>Experience with PostgreSQL</li></ul>
      <h2>Nice to have</h2>
      <ul><li>Payments or fintech experience</li></ul>
      <p><strong>Location:</strong> Toronto, ON (hybrid, 3 days in office)</p>
      <p>The salary range for this role is $120,000 – $150,000 CAD.</p>
      <script>alert('x')</script>
    </div>
  </div>
  <aside class="similar-jobs"><h3>Similar jobs</h3><a href="/j/1">Frontend Engineer</a><a href="/j/2">Data Engineer</a></aside>
</main>
<footer>© Acme. <a href="/privacy">Privacy</a> <a href="/terms">Terms</a></footer>
</body></html>`;

describe('capturePosting', () => {
  it('finds the posting block and drops page chrome', () => {
    const c = capturePosting({ html: COMPANY_PAGE })!;
    const best = c.blocks[0];
    expect(best.method).toBe('scored');
    expect(best.text).toContain("What you'll do");
    expect(best.text).toContain('Design and build payment APIs used by thousands of merchants');
    expect(best.text).not.toMatch(/cookies|Similar jobs|Privacy|Posted 3 days/);
    expect(best.html).not.toMatch(/script|style=|class=|alert/);
    expect(c.docTitle).toBe('Backend Engineer - Acme | Careers');
    expect(c.firstHeading).toBe('Backend Engineer');
  });

  it('offers the wider page as another choice', () => {
    const c = capturePosting({ html: COMPANY_PAGE })!;
    expect(c.blocks.length).toBeGreaterThan(1);
    expect(c.blocks.some((b) => b.text.includes('Posted 3 days ago'))).toBe(true);
  });

  it('prefers JSON-LD JobPosting data from page source', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Software Engineer, Payments',
      description: '&lt;p&gt;Join us.&lt;/p&gt;&lt;h3&gt;Responsibilities&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Ship things&lt;/li&gt;&lt;/ul&gt;',
      hiringOrganization: { '@type': 'Organization', name: 'Stripe' },
      jobLocation: { '@type': 'Place', address: { addressLocality: 'Toronto', addressRegion: 'ON', addressCountry: 'CA' } },
      baseSalary: { '@type': 'MonetaryAmount', currency: 'CAD', value: { '@type': 'QuantitativeValue', minValue: 140000, maxValue: 180000, unitText: 'YEAR' } },
    };
    const src = `<!doctype html><html><head><title>Stripe</title><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><div>${'filler '.repeat(50)}</div></body></html>`;
    const c = capturePosting({ text: src })!;
    expect(c.blocks[0].method).toBe('json-ld');
    expect(c.blocks[0].html).toBe('<p>Join us.</p><h3>Responsibilities</h3><ul><li>Ship things</li></ul>');
    const d = summarizeWithRules({ capture: c, block: c.blocks[0] });
    expect(d.company).toBe('Stripe');
    expect(d.role).toBe('Software Engineer, Payments');
    expect(d.summary.location).toBe('Toronto, ON, CA');
    expect(d.summary.salary).toMatchObject({ min: 140000, max: 180000, currency: 'CAD', period: 'year' });
    expect(d.summary.responsibilities).toEqual(['Ship things']);
  });

  it('uses a known site container', () => {
    const html = `<div class="top-card"><h1>Data Analyst</h1><a href="/c">Some Co</a></div>
      <div class="jobs-description__content"><span><strong>About the job</strong><br><br>${'We analyze data every day. '.repeat(10)}<br><br><strong>Qualifications</strong><br>• SQL<br>• Python</span></div>
      <div class="people-also-viewed">${'<a href="/x">Another job title here</a>'.repeat(30)}</div>`;
    const c = capturePosting({ html })!;
    expect(c.blocks[0].method).toBe('known:linkedin');
    const lines = htmlToLines(c.blocks[0].html);
    expect(lines).toContainEqual({ text: 'Qualifications', kind: 'heading' });
    expect(extractSections(lines).requirements).toEqual(['SQL', 'Python']);
  });

  it('accepts plain text', () => {
    const c = capturePosting({ text: 'Role X\n\nResponsibilities:\n- Build\n- Test' })!;
    expect(c.blocks[0].method).toBe('text');
    expect(extractSections(htmlToLines(c.blocks[0].html)).responsibilities).toEqual(['Build', 'Test']);
  });

  it('returns null for an empty paste', () => {
    expect(capturePosting({ html: '', text: '  ' })).toBeNull();
  });
});

describe('sanitize', () => {
  it('keeps only basic formatting and safe links', () => {
    expect(
      sanitize('<div class="x" onclick="evil()"><span style="color:red">Hi <b>there</b></span><a href="javascript:alert(1)">bad</a> <a href="https://ok.com" target="_blank">ok</a><img src=x onerror=alert(1)></div>'),
    ).toBe('<p>Hi <strong>there</strong>bad <a href="https://ok.com">ok</a></p>');
  });
  it('wraps loose text next to lists in paragraphs', () => {
    expect(sanitize('<div>Intro<ul><li>a</li></ul>Outro</div>')).toBe('<p>Intro</p><ul><li>a</li></ul><p>Outro</p>');
  });
  it('keeps divs that hold text as paragraphs', () => {
    expect(sanitize('<div>Line one</div><div>Line two</div>')).toBe('<p>Line one</p><p>Line two</p>');
  });
});

describe('textToHtml', () => {
  it('turns bullets into lists', () => {
    expect(textToHtml('Intro\n• one\n• two\n\nEnd')).toBe('<p>Intro</p><ul><li>one</li><li>two</li></ul><p>End</p>');
  });
});

describe('summary rules', () => {
  it('fills the company page draft', () => {
    const c = capturePosting({ html: COMPANY_PAGE })!;
    const d = summarizeWithRules({ capture: c, block: c.blocks[0], url: 'https://careers.acme.com/jobs/123' });
    expect(d.company).toBe('Acme');
    expect(d.role).toBe('Backend Engineer');
    expect(d.summary.responsibilities).toHaveLength(2);
    expect(d.summary.requirements).toEqual(['3+ years building backend services in Go, Java or Python', 'Experience with PostgreSQL']);
    expect(d.summary.niceToHave).toEqual(['Payments or fintech experience']);
    expect(d.summary.location).toBe('Toronto, ON (hybrid, 3 days in office)');
    expect(d.summary.workMode).toBe('hybrid');
    expect(d.summary.salary).toMatchObject({ min: 120000, max: 150000, currency: 'CAD' });
    expect(d.summary.filledBy).toBe('rules');
  });

  it('reads companies from job board addresses', () => {
    expect(companyFromUrl('https://boards.greenhouse.io/stripe/jobs/123')).toBe('Stripe');
    expect(companyFromUrl('https://jobs.lever.co/plaid/abc')).toBe('Plaid');
    expect(companyFromUrl('https://jobs.ashbyhq.com/ramp/xyz')).toBe('Ramp');
    expect(companyFromUrl('https://rbc.wd3.myworkdayjobs.com/en-US/RBC/job/1')).toBe('Rbc');
    expect(companyFromUrl('https://www.linkedin.com/jobs/view/1')).toBeUndefined();
    expect(companyFromUrl('not a url')).toBeUndefined();
  });

  it('splits page titles', () => {
    expect(fromTitle('Shopify hiring Senior Developer in Toronto, ON | LinkedIn')).toEqual({ company: 'Shopify', role: 'Senior Developer' });
    expect(fromTitle('Job Application for Software Engineer at Wealthsimple')).toEqual({ role: 'Software Engineer', company: 'Wealthsimple' });
    expect(fromTitle('Plaid - Software Engineer', 'Plaid')).toEqual({ role: 'Software Engineer', company: 'Plaid' });
  });

  it('reads a place from the line under the title', () => {
    expect(placeFromLine('Toronto, ON · Posted 3 days ago')).toBe('Toronto, ON');
    expect(placeFromLine('New York City, NY; San Francisco, CA | New York City, NY')).toBe('New York City, NY; San Francisco, CA · New York City, NY');
    expect(placeFromLine('Full-time · 200 applicants')).toBeUndefined();
  });

  it('detects work mode', () => {
    expect(workModeOf('This is a remote role')).toBe('remote');
    expect(workModeOf('Hybrid, remote Fridays')).toBe('hybrid');
    expect(workModeOf('This is not remote; on-site in Vancouver')).toBe('onsite');
    expect(workModeOf('Vancouver')).toBeUndefined();
  });
});
