// Fetching a posting's page instead of copy-pasting it. Browsers don't let Resume Studio read other
// sites, so the autofill extension, which may, does the fetch: this page posts a request, the
// extension's bridge (tools/autofill/extension/bridge.js) hands it to its background worker, and the
// page's HTML comes back the same way. Without the extension, pasting still works.

import type { Capture } from './capture';
import { linkedInJobId } from './linkedin';

/** acme.wd5.myworkdayjobs.com/en-US/Careers/job/Toronto/Intern_R-123 → tenant, site and job path. */
const WORKDAY = /^https?:\/\/([\w-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([\w-]+)\/(?:job|details)\/([^?#]+)/;

/**
 * Where to fetch a posting from. LinkedIn's job page wants a sign-in; its guest version doesn't.
 * Workday's page is an empty app shell; the description comes from the API the shell itself calls.
 */
export function pageUrlFor(url: string): string {
  const id = linkedInJobId(url);
  if (id) return `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`;
  const wd = WORKDAY.exec(url);
  if (wd) return `https://${wd[1]}.${wd[2]}.myworkdayjobs.com/wday/cxs/${wd[1]}/${wd[3]}/job/${wd[4].replace(/^job\//, '')}`;
  return url;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** What came back, as a page capturePosting reads: Workday's API answers JSON, with the description as HTML. */
export function asPage(body: string): string {
  if (!/^\s*\{/.test(body)) return body;
  try {
    const info = (JSON.parse(body) as { jobPostingInfo?: { title?: string; location?: string; jobDescription?: string } }).jobPostingInfo;
    if (!info?.jobDescription) return body;
    return (
      `<html><body><h1>${escapeHtml(info.title ?? '')}</h1>${info.location ? `<div>${escapeHtml(info.location)}</div>` : ''}` +
      `<div data-automation-id="jobPostingDescription">${info.jobDescription}</div></body></html>`
    );
  } catch {
    return body;
  }
}

/** Whether a fetched page held the posting, not just an app shell ("enable JavaScript") or a sign-in wall. */
export function holdsPosting(c: Capture | null): c is Capture {
  if (!c?.blocks.length) return false;
  const best = c.blocks[0];
  return best.method === 'json-ld' || best.method.startsWith('known:') || best.text.length >= 400;
}

/** The bridge marks the page when the extension is installed. */
export const canFetchPages = () => typeof document !== 'undefined' && !!document.documentElement.dataset.resumeStudioExtension;

interface Reply {
  source: 'resume-studio-extension';
  id: string;
  ok: boolean;
  status?: number;
  html?: string;
  error?: string;
}

/** The posting page's HTML, fetched by the extension. Rejects with a short reason. */
export function fetchPage(url: string, timeoutMs = 25_000): Promise<string> {
  if (!canFetchPages()) return Promise.reject(new Error('the Resume Studio Autofill extension isn’t installed'));
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      fn();
    };
    const onMessage = (e: MessageEvent) => {
      const r = e.data as Reply;
      if (e.source !== window || r?.source !== 'resume-studio-extension' || r.id !== id) return;
      if (r.ok && r.html) done(() => resolve(asPage(r.html!)));
      else done(() => reject(new Error(r.error || (r.status ? `the site answered ${r.status}` : 'the site sent nothing back'))));
    };
    const timer = setTimeout(() => done(() => reject(new Error('the site took too long to answer'))), timeoutMs);
    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'resume-studio', type: 'fetch-page', id, url: pageUrlFor(url) }, window.location.origin);
  });
}
