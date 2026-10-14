import templateUrl from '../../render/template.docx?url';
import { recordExport } from './store';
import type { Version } from '../../model/types';

function fileBase(v: Version): string {
  const label = (v.company || v.name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `Hyeonyoung_Park_${label}_${date}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportVersion(v: Version, format: 'pdf' | 'docx'): Promise<void> {
  if (format === 'pdf') {
    const { buildPdf } = await import('../../render/pdf');
    download(await buildPdf(v.snapshot), `${fileBase(v)}.pdf`);
  } else {
    const [{ buildDocx }, template] = await Promise.all([
      import('../../render/docx'),
      fetch(templateUrl).then((r) => r.arrayBuffer()),
    ]);
    const bytes = await buildDocx(v.snapshot, template);
    download(
      new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      `${fileBase(v)}.docx`,
    );
  }
  await recordExport(v.id, format);
}
