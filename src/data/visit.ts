// What a visit to a company link records about the visitor. No personal data: a random id
// kept in their browser (to count distinct visitors) and whether the visit looked automated.

const VISITOR_KEY = 'resume-studio:visitor';

export function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return ''; // storage blocked: still counted, just not de-duplicated
  }
}

/**
 * Email security scanners (Outlook Safe Links, Mimecast, Proofpoint…), chat unfurlers and
 * crawlers open links before a person does. Most don't run JavaScript and are never logged;
 * these patterns catch the ones that do.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|preview|headless|phantom|puppeteer|playwright|lighthouse|facebookexternalhit|embedly|whatsapp|skypeuripreview|bingpreview|google-inspectiontool|proofpoint|mimecast|barracuda|safelinks|scanner|python-requests|curl|wget/i;

export function looksAutomated(userAgent: string, webdriver: boolean): boolean {
  return webdriver || BOT_UA.test(userAgent);
}
