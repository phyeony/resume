import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it, vi } from 'vitest';
import { seedLibrary, seedProfile } from '../data/seed';
import { buildSnapshot, defaultLayout, defaultSelection } from '../model/snapshot';

// In the browser Vite turns `?url` imports into asset URLs; in Node hand react-pdf file paths.
const font = (f: string) => createRequire(import.meta.url).resolve(`@fontsource/caladea/files/${f}`);
vi.mock('@fontsource/caladea/files/caladea-latin-400-normal.woff?url', () => ({ default: font('caladea-latin-400-normal.woff') }));
vi.mock('@fontsource/caladea/files/caladea-latin-400-italic.woff?url', () => ({ default: font('caladea-latin-400-italic.woff') }));
vi.mock('@fontsource/caladea/files/caladea-latin-700-normal.woff?url', () => ({ default: font('caladea-latin-700-normal.woff') }));
vi.mock('@fontsource/caladea/files/caladea-latin-700-italic.woff?url', () => ({ default: font('caladea-latin-700-italic.woff') }));

vi.mock('@fontsource/noto-sans-math/files/noto-sans-math-math-400-normal.woff?url', () => ({
  default: createRequire(import.meta.url).resolve('@fontsource/noto-sans-math/files/noto-sans-math-math-400-normal.woff'),
}));

describe('ResumePdf', () => {
  it('renders the default resume to a single page', async () => {
    const { ResumePdf } = await import('./pdf');
    const snap = buildSnapshot(seedProfile, seedLibrary, defaultSelection(seedLibrary), {}, defaultLayout(seedProfile));
    const buf = await renderToBuffer(<ResumePdf snapshot={snap} />);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, buf);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(1);
  }, 30000);
});
