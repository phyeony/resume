// Runs on Resume Studio's own pages: lets the editor fetch a job posting through the extension, which
// may read other sites where the page itself may not. Only accepts requests from the page it runs in.

document.documentElement.dataset.resumeStudioExtension = chrome.runtime.getManifest().version;

window.addEventListener('message', (e) => {
  const m = e.data;
  if (e.source !== window || m?.source !== 'resume-studio' || m.type !== 'fetch-page') return;
  const reply = (r) => window.postMessage({ source: 'resume-studio-extension', id: m.id, ...r }, window.location.origin);
  chrome.runtime.sendMessage({ type: 'fetch-page', url: m.url }).then(reply, (err) => reply({ ok: false, error: String(err?.message ?? err) }));
});
