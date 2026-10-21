// Fetches job posting pages for Resume Studio (see bridge.js). Without cookies: the page you'd see
// signed out, which is where postings are public.

const MAX = 3_000_000;

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'fetch-page' || sender.id !== chrome.runtime.id) return;
  fetchPage(msg.url).then(reply, (e) => reply({ ok: false, error: String(e?.message ?? e) }));
  return true; // answers asynchronously
});

async function fetchPage(url) {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'not a web address' };
  const res = await fetch(url, { credentials: 'omit', redirect: 'follow', headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' } });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, status: res.status, html: (await res.text()).slice(0, MAX) };
}
