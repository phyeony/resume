// Turns a pasted job page into the posting itself, word for word.
//
// Pasted HTML (copied page or page source) or plain text → DOM (inert, nothing runs) →
//   1. schema.org JobPosting data, when the page source has it
//   2. a known site container (LinkedIn, Workday, Greenhouse, Lever, Indeed)
//   3. otherwise the block with the most non-link text
// → sanitized to plain formatting tags. Words are never changed, only which parts are kept.

export interface PastedInput {
  /** text/html from the clipboard. */
  html?: string;
  /** text/plain from the clipboard; may itself be page source. */
  text?: string;
}

export interface Block {
  html: string;
  text: string;
  /** "json-ld", "known:<site>", "scored", "wider" (the best block's parent), "page" or "text". */
  method: string;
  /** For the "choose another" menu. */
  label: string;
}

/** The posting's schema.org JobPosting data, flattened. */
export interface JobLd {
  title?: string;
  company?: string;
  location?: string;
  remote?: boolean;
  salary?: { currency?: string; min?: number; max?: number; unit?: string };
  datePosted?: string;
}

export interface Capture {
  /** Best guess first. */
  blocks: Block[];
  ld?: JobLd;
  /** <title>, only present when page source was pasted. */
  docTitle?: string;
  siteName?: string;
  /** First <h1> on the page, usually the job title. */
  firstHeading?: string;
  /** The short line right under that heading; often the location. */
  underHeading?: string;
}

// ---- parsing -----------------------------------------------------------------

const looksLikeHtml = (s: string) => /^\s*(<!doctype|<html|<head|<body|<div|<meta)/i.test(s) && /<\/\w+>/.test(s);

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BULLET = /^\s*[•·●▪◦*\-–]\s+/;

/** Plain text → paragraphs and lists, so it goes through the same pipeline. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((para) => {
      const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return '';
      const out: string[] = [];
      let items: string[] = [];
      const flush = () => {
        if (items.length) out.push(`<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`);
        items = [];
      };
      let plain: string[] = [];
      const flushPlain = () => {
        if (plain.length) out.push(`<p>${plain.map(escapeHtml).join('<br>')}</p>`);
        plain = [];
      };
      for (const l of lines) {
        if (BULLET.test(l)) {
          flushPlain();
          items.push(l.replace(BULLET, ''));
        } else {
          flush();
          plain.push(l);
        }
      }
      flush();
      flushPlain();
      return out.join('');
    })
    .join('');
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

// ---- JSON-LD -------------------------------------------------------------------

type Json = unknown;

function* walk(x: Json): Generator<Record<string, Json>> {
  if (Array.isArray(x)) for (const y of x) yield* walk(y);
  else if (x && typeof x === 'object') {
    const o = x as Record<string, Json>;
    yield o;
    if (o['@graph']) yield* walk(o['@graph']);
  }
}

const isJobPosting = (o: Record<string, Json>) => {
  const t = o['@type'];
  return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
};

const str = (x: Json): string | undefined => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
const num = (x: Json): number | undefined => {
  const n = typeof x === 'string' ? Number(x.replace(/,/g, '')) : x;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

function ldPlace(x: Json): string | undefined {
  const parts: string[] = [];
  for (const place of walk(x)) {
    const a = place.address;
    if (!a || typeof a !== 'object') continue;
    const addr = a as Record<string, Json>;
    const country = str(addr.addressCountry) ?? str((addr.addressCountry as Record<string, Json> | undefined)?.name);
    const p = [str(addr.addressLocality), str(addr.addressRegion), country].filter(Boolean).join(', ');
    if (p && !parts.includes(p)) parts.push(p);
  }
  return parts.join(' / ') || undefined;
}

function readJobLd(doc: Document): { ld: JobLd; descriptionHtml?: string } | undefined {
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: Json;
    try {
      data = JSON.parse(s.textContent ?? '');
    } catch {
      continue;
    }
    for (const o of walk(data)) {
      if (!isJobPosting(o)) continue;
      const org = o.hiringOrganization;
      const sal = o.baseSalary as Record<string, Json> | undefined;
      const val = (sal?.value ?? {}) as Record<string, Json>;
      const ld: JobLd = {
        title: str(o.title),
        company: str(org) ?? str((org as Record<string, Json> | undefined)?.name),
        location: ldPlace(o.jobLocation),
        remote: o.jobLocationType === 'TELECOMMUTE' || undefined,
        datePosted: str(o.datePosted),
      };
      if (sal) {
        const min = num(val.minValue) ?? num(val.value) ?? num(sal.value);
        if (min !== undefined) {
          ld.salary = { currency: str(sal.currency) ?? str(val.currency), min, max: num(val.maxValue), unit: str(val.unitText) };
        }
      }
      let desc = str(o.description);
      // Some sites store the description HTML entity-escaped ("&lt;p&gt;…"), or as text with entities ("J&amp;J").
      if (desc && !/<\w/.test(desc) && /&#?\w+;/.test(desc)) desc = parse(desc).body.textContent ?? desc;
      return { ld, descriptionHtml: desc && (/<\w/.test(desc) ? desc : textToHtml(desc)) };
    }
  }
  return undefined;
}

// ---- removing what isn't the posting ---------------------------------------------

const JUNK_TAGS =
  'script,style,noscript,template,svg,img,picture,video,audio,canvas,iframe,object,embed,nav,header,footer,aside,form,button,select,input,textarea,dialog,[hidden],[aria-hidden="true"],[role="navigation"],[role="banner"],[role="contentinfo"],[role="dialog"]';
const JUNK_NAMES =
  /cookie|consent|gdpr|share|social|similar|related|recommend|newsletter|subscribe|breadcrumb|sidebar|modal|popup|navbar|menu|footer|apply-button|toast/i;

function textLength(el: Element): number {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().length;
}

function stripJunk(root: Element): void {
  for (const el of [...root.querySelectorAll(JUNK_TAGS)]) el.remove();
  for (const el of [...root.querySelectorAll<HTMLElement>('[style]')]) {
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(el.getAttribute('style') ?? '')) el.remove();
  }
  // Class/id names are only a hint: never let one take out most of the page.
  const total = textLength(root) || 1;
  for (const el of [...root.querySelectorAll('[class],[id]')]) {
    if (!el.isConnected) continue;
    const names = `${el.getAttribute('class') ?? ''} ${el.id}`;
    if (JUNK_NAMES.test(names) && textLength(el) < total * 0.4) el.remove();
  }
}

// ---- finding the posting block ------------------------------------------------------

const KNOWN: { site: string; selector: string }[] = [
  { site: 'linkedin', selector: '.jobs-description__content, .jobs-box__html-content, .show-more-less-html__markup, #job-details' },
  { site: 'workday', selector: '[data-automation-id="jobPostingDescription"]' },
  { site: 'greenhouse', selector: '.job__description, #content .content-intro, .job-post-content, #gh_jid' },
  { site: 'lever', selector: '.posting-page .content, .posting .section-wrapper.page-full-width' },
  { site: 'ashby', selector: '[class*="_descriptionText"], [class*="ashby-job-posting-description"]' },
  { site: 'indeed', selector: '#jobDescriptionText' },
  { site: 'smartrecruiters', selector: '.job-sections, [itemprop="description"]' },
];

const BLOCK_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'TD', 'BODY', 'UL', 'OL', 'SPAN', 'LI']);

interface Scored {
  el: Element;
  score: number;
  text: number;
  depth: number;
}

/** One pass, bottom-up: text and link-text lengths for every element. */
function scoreAll(body: Element): Scored[] {
  const out: Scored[] = [];
  const visit = (el: Element, depth: number, inLink: boolean): { text: number; link: number } => {
    let text = 0;
    let link = 0;
    const isLink = inLink || el.tagName === 'A';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const len = (n.textContent ?? '').replace(/\s+/g, ' ').trim().length;
        text += len;
        if (isLink) link += len;
      } else if (n.nodeType === 1) {
        const r = visit(n as Element, depth + 1, isLink);
        text += r.text;
        link += r.link;
      }
    }
    if (BLOCK_TAGS.has(el.tagName)) out.push({ el, text, depth, score: text - 2 * link });
    return { text, link };
  };
  visit(body, 0, false);
  return out;
}

function labelFor(el: Element, words: number): string {
  const h = el.querySelector('h1,h2,h3,h4,strong,b');
  const lead = (h?.textContent || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${lead || '(no text)'} · ${words} words`;
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

function block(el: Element | string, method: string): Block {
  const html = sanitize(el);
  const text = htmlToText(html);
  const holder = typeof el === 'string' ? parse(html).body : el;
  return { html, text, method, label: labelFor(holder, wordCount(text)) };
}

// ---- entry point ---------------------------------------------------------------------

export function capturePosting(input: PastedInput): Capture | null {
  const raw = input.html?.trim() ? input.html : input.text && looksLikeHtml(input.text) ? input.text : undefined;
  if (!raw) {
    const text = input.text?.trim();
    if (!text) return null;
    const b = block(textToHtml(text), 'text');
    return { blocks: [b], firstHeading: text.split('\n')[0].trim().slice(0, 120) };
  }

  const doc = parse(raw);
  const capture: Capture = { blocks: [] };
  capture.docTitle = doc.title?.trim() || undefined;
  capture.siteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() || undefined;
  const h1 = doc.querySelector('h1');
  capture.firstHeading = h1?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
  const under = h1 && (h1.nextElementSibling ?? h1.parentElement?.nextElementSibling);
  const underText = under?.textContent?.replace(/\s+/g, ' ').trim();
  if (underText && underText.length <= 120) capture.underHeading = underText;

  const job = readJobLd(doc);
  if (job) capture.ld = job.ld;
  if (job?.descriptionHtml) capture.blocks.push(block(job.descriptionHtml, 'json-ld'));

  const body = doc.body;
  stripJunk(body);

  const seen = new Set<Element>();
  const add = (el: Element, method: string) => {
    if (seen.has(el)) return;
    seen.add(el);
    const b = block(el, method);
    if (b.text.length >= 40 && !capture.blocks.some((x) => x.text === b.text)) capture.blocks.push(b);
  };

  for (const k of KNOWN) {
    const el = body.querySelector(k.selector);
    if (el && textLength(el) >= 200) add(el, `known:${k.site}`);
  }

  const scored = scoreAll(body);
  const max = Math.max(0, ...scored.map((s) => s.score));
  if (max > 0) {
    // The deepest element that holds nearly all of the best block's content.
    const near = scored.filter((s) => s.score >= max * 0.9).sort((a, b) => b.depth - a.depth);
    const best = near[0];
    add(best.el, 'scored');
    if (best.el.parentElement && best.el.parentElement !== body) add(best.el.parentElement, 'wider');
    // Other strong blocks elsewhere on the page.
    const others = scored
      .filter((s) => s.score >= max * 0.15 && !s.el.contains(best.el) && !best.el.contains(s.el))
      .sort((a, b) => b.score - a.score);
    const picked: Element[] = [];
    for (const s of others) {
      if (picked.length >= 4) break;
      if (picked.some((p) => p.contains(s.el) || s.el.contains(p))) continue;
      picked.push(s.el);
      add(s.el, 'scored');
    }
  }
  add(body, 'page');
  // Some sites (Workday) put the description in their JobPosting data as one run of text with the
  // formatting stripped; the page's own block, when there is one, reads far better.
  const first = capture.blocks[0];
  const known = capture.blocks.findIndex((b) => b.method.startsWith('known:'));
  if (first?.method === 'json-ld' && known > 0 && isFlat(first)) capture.blocks.unshift(...capture.blocks.splice(known, 1));
  return capture.blocks.length ? capture : null;
}

/** A long posting with no headings, lists or paragraph breaks. */
function isFlat(b: Block): boolean {
  return b.text.length > 600 && !/<(h\d|li)\b/.test(b.html) && (b.html.match(/<p>|<br>/g) ?? []).length <= 1;
}

// ---- sanitizing ------------------------------------------------------------------------

const DROP = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IMG', 'PICTURE', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME',
  'OBJECT', 'EMBED', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'HEAD', 'TITLE', 'META', 'LINK',
]);
const BLOCKS = new Set(['P', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
const INLINE: Record<string, string> = { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em' };
/** Layout elements: kept as paragraphs when they hold only inline content, else unwrapped. */
const CONTAINERS = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FORM', 'TABLE', 'TBODY', 'THEAD',
  'TR', 'TD', 'TH', 'DL', 'DT', 'DD', 'FIGURE', 'FIGCAPTION', 'PRE', 'ADDRESS', 'BODY', 'CENTER', 'DETAILS', 'SUMMARY',
]);

interface Piece {
  html: string;
  block: boolean;
}

function joinAsBlocks(pieces: Piece[]): string {
  if (!pieces.some((p) => p.block)) return pieces.map((p) => p.html).join('');
  let out = '';
  let run = '';
  const flush = () => {
    if (run.replace(/<br>/g, '').trim()) out += `<p>${run.trim()}</p>`;
    run = '';
  };
  for (const p of pieces) {
    if (p.block) {
      flush();
      out += p.html;
    } else run += p.html;
  }
  flush();
  return out;
}

function clean(node: Node): Piece {
  if (node.nodeType === 3) return { html: escapeHtml((node.textContent ?? '').replace(/\s+/g, ' ')), block: false };
  if (node.nodeType !== 1) return { html: '', block: false };
  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  if (DROP.has(tag)) return { html: '', block: false };
  if (tag === 'BR') return { html: '<br>', block: false };
  const kids = [...el.childNodes].map(clean);

  if (BLOCKS.has(tag)) {
    const name = tag.toLowerCase();
    const inner = name === 'ul' || name === 'ol' ? kids.map((k) => k.html).join('') : joinAsBlocks(kids);
    const trimmed = inner.replace(/^(\s|<br>)+|(\s|<br>)+$/g, '');
    return { html: trimmed ? `<${name}>${trimmed}</${name}>` : '', block: true };
  }
  const inner = kids.map((k) => k.html).join('');
  if (INLINE[tag]) {
    return { html: inner.trim() ? `<${INLINE[tag]}>${inner}</${INLINE[tag]}>` : inner, block: false };
  }
  if (tag === 'A') {
    const href = el.getAttribute('href') ?? '';
    return {
      html: /^(https?:|mailto:)/i.test(href) && inner.trim() ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner,
      block: false,
    };
  }
  if (CONTAINERS.has(tag)) {
    if (kids.some((k) => k.block)) return { html: joinAsBlocks(kids), block: true };
    const trimmed = inner.replace(/^(\s|<br>)+|(\s|<br>)+$/g, '');
    return { html: trimmed ? `<p>${trimmed}</p>` : '', block: true };
  }
  // span, font, label, time…: keep the content only
  return { html: joinAsBlocks(kids), block: kids.some((k) => k.block) };
}

/** Allowlist-only copy: headings, paragraphs, lists, bold/italic, line breaks and http(s) links. */
export function sanitize(input: Element | string): string {
  const root = typeof input === 'string' ? parse(input).body : input;
  const pieces = [...root.childNodes].map(clean);
  if (pieces.some((p) => p.block)) return joinAsBlocks(pieces);
  const inline = pieces.map((p) => p.html).join('').replace(/^(\s|<br>)+|(\s|<br>)+$/g, '');
  return inline ? `<p>${inline}</p>` : '';
}

// ---- reading it back -------------------------------------------------------------------

export interface Line {
  text: string;
  kind: 'heading' | 'item' | 'para';
}

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** Sanitized posting → lines, with headings and list items marked. */
export function htmlToLines(html: string): Line[] {
  const lines: Line[] = [];
  const pushText = (raw: string, el: Element | null) => {
    for (const part of raw.split('\n')) {
      const text = part.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (BULLET.test(text)) lines.push({ text: text.replace(BULLET, ''), kind: 'item' });
      else if (text.length <= 70 && (/:$/.test(text) || (el && isWholeBold(el, text)))) {
        lines.push({ text: text.replace(/:$/, ''), kind: 'heading' });
      } else lines.push({ text, kind: 'para' });
    }
  };
  const visit = (el: Element) => {
    for (const n of el.childNodes) {
      if (n.nodeType !== 1) continue;
      const c = n as Element;
      if (HEADING_TAGS.has(c.tagName)) {
        const t = c.textContent?.replace(/\s+/g, ' ').trim();
        if (t) lines.push({ text: t.replace(/:$/, ''), kind: 'heading' });
      } else if (c.tagName === 'LI') {
        const t = c.textContent?.replace(/\s+/g, ' ').trim();
        if (t) lines.push({ text: t, kind: 'item' });
      } else if (c.tagName === 'P') {
        pushText(textWithBreaks(c), c);
      } else visit(c);
    }
  };
  const body = parse(html).body;
  // stray top-level text (shouldn't happen after sanitize, but be safe)
  if (!body.querySelector('p,li,h1,h2,h3,h4,h5,h6')) pushText(textWithBreaks(body), null);
  else visit(body);
  return lines;
}

function textWithBreaks(el: Element): string {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.textContent;
    else if (n.nodeType === 1) out += (n as Element).tagName === 'BR' ? '\n' : textWithBreaks(n as Element);
  }
  return out;
}

/** "Requirements" written as <p><strong>Requirements</strong></p> or a bold line between <br>s. */
function isWholeBold(p: Element, line: string): boolean {
  return [...p.querySelectorAll('strong')].some((s) => s.textContent?.replace(/\s+/g, ' ').trim().replace(/:$/, '') === line.replace(/:$/, ''));
}

export function htmlToText(html: string): string {
  return htmlToLines(html)
    .map((l) => (l.kind === 'item' ? `• ${l.text}` : l.kind === 'heading' ? `\n${l.text}` : l.text))
    .join('\n')
    .trim();
}
