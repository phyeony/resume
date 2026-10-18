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
  const which = kit.resume.versionId ? `resume "${kit.resume.versionName}"` : 'resume: custom file';
  $('kit').textContent = `${a.firstName} ${a.lastName} · ${which} · kit from ${new Date(kit.createdAt).toLocaleDateString()}`;
  $('resume').hidden = false;
  $('resumeName').textContent = `Resume: ${kit.resume.fileName} (${kbOf(kit.resume)} KB)`;
  $('resumeName').title = kit.resume.fileName;
  $('transcript').hidden = false;
  const t = kit.transcript;
  $('transcriptName').textContent = t ? `Transcript: ${t.fileName} (${kbOf(t)} KB)` : 'No transcript';
  $('transcriptName').title = t ? t.fileName : '';
  $('tdownload').hidden = !t;
  $('treplace').textContent = t ? 'Replace…' : 'Add…';
}

// base64 is 4 characters per 3 bytes
const kbOf = (pdf) => Math.round((pdf.pdfBase64.length * 3) / 4 / 1024);

// Extension storage holds 10 MB in all, and base64 makes the PDF a third bigger.
const MAX_PDF = 5 * 1024 * 1024;

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function downloadPdf(pdf) {
  const bytes = Uint8Array.from(atob(pdf.pdfBase64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = pdf.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Reads a picked PDF and stores what `place` makes of it in the kit. */
async function replacePdf(input, place) {
  $('error').textContent = '';
  const f = input.files[0];
  input.value = '';
  try {
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    // Every PDF starts with "%PDF"
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== '%PDF') throw new Error(`${f.name} isn't a PDF.`);
    if (bytes.length > MAX_PDF) throw new Error(`${f.name} is over 5 MB. Export a smaller PDF.`);
    const kit = await currentKit();
    place(kit, f.name, toBase64(bytes));
    await chrome.storage.local.set({ kit });
    await showKit();
  } catch (err) {
    $('error').textContent = err.message || String(err);
  }
}

$('download').onclick = async () => downloadPdf((await currentKit()).resume);
$('replace').onclick = () => $('pdf').click();
$('pdf').onchange = (e) =>
  replacePdf(e.target, (kit, name, pdfBase64) => {
    // No versionId: it no longer matches a Resume Studio version.
    kit.resume = { versionId: '', versionName: 'Custom file', fileName: name, pdfBase64 };
  });

$('tdownload').onclick = async () => downloadPdf((await currentKit()).transcript);
$('treplace').onclick = () => $('tpdf').click();
$('tpdf').onchange = (e) =>
  replacePdf(e.target, (kit, _name, pdfBase64) => {
    // Same standard name Resume Studio gives it, whatever the picked file is called.
    const who = `${kit.answers.firstName} ${kit.answers.lastName}`.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    kit.transcript = { fileName: who ? `${who}_Transcript.pdf` : 'Transcript.pdf', pdfBase64 };
  });

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
    out.append(el('div', `Resume: ${r.resume}${r.transcript !== 'no upload field' ? ` · Transcript: ${r.transcript}` : ''}${r.already ? ` · ${r.already} already filled` : ''}`, 'muted'));
  }
}

void showKit();
