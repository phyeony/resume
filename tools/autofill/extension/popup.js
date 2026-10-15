// Popup: keep the imported apply kit in extension storage, and fill the current tab with it on request.

const $ = (id) => document.getElementById(id);

function el(tag, text, cls) {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

async function currentKit() {
  return (await chrome.storage.local.get('kit')).kit;
}

async function showKit() {
  const kit = await currentKit();
  $('fill').disabled = !kit;
  if (!kit) return;
  const a = kit.answers;
  $('kit').textContent = `${a.firstName} ${a.lastName} · resume "${kit.resume.versionName}" · kit from ${new Date(kit.createdAt).toLocaleDateString()}`;
}

$('import').onclick = () => $('file').click();

$('file').onchange = async (e) => {
  $('error').textContent = '';
  try {
    const kit = JSON.parse(await e.target.files[0].text());
    if (kit.kind !== 'resume-studio-apply-kit') throw new Error("That isn't an apply kit. Download one from Profile in Resume Studio.");
    await chrome.storage.local.set({ kit });
    await showKit();
  } catch (err) {
    $('error').textContent = err.message || String(err);
  }
};

$('fill').onclick = async () => {
  $('error').textContent = '';
  $('report').textContent = 'Filling…';
  $('fill').disabled = true;
  try {
    const kit = await currentKit();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Every frame: some company sites embed the application form (e.g. Greenhouse) in an iframe.
    const target = { tabId: tab.id, allFrames: true };
    await chrome.scripting.executeScript({ target, files: ['fill.js'] });
    const results = await chrome.scripting.executeScript({ target, func: (k) => window.__resumeStudio.fill(k), args: [kit] });
    render(results.map((r) => r.result).filter((r) => r && (r.filled.length || r.left.length || r.already)));
  } catch (err) {
    $('report').textContent = '';
    $('error').textContent = err.message || String(err);
  } finally {
    $('fill').disabled = false;
  }
};

function render(reports) {
  const out = $('report');
  out.textContent = '';
  if (!reports.length) {
    out.append(el('p', 'No form fields found on this page. If there is an "Apply" button, click it first, then fill again.', 'left'));
    return;
  }
  for (const r of reports) {
    if (reports.length > 1) out.append(el('div', new URL(r.url).host, 'muted'));
    out.append(el('h2', `Filled ${r.filled.length}`, 'ok'));
    const ok = el('ul', '');
    r.filled.forEach((f) => ok.append(el('li', `${f.question} → ${f.answer}`)));
    out.append(ok);
    out.append(el('h2', `Left for you ${r.left.length}`, 'left'));
    const left = el('ul', '');
    r.left.forEach((f) => left.append(el('li', `${f.required ? '* ' : ''}${f.question || '(unlabelled)'} (${f.why})`)));
    out.append(left);
    out.append(el('div', `Resume: ${r.resume}${r.already ? ` · ${r.already} already filled` : ''}`, 'muted'));
  }
}

void showKit();
