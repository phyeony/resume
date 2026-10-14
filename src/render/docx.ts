// Snapshot -> .docx, written into a copy of my Word template (src/render/template.docx).
//
// The template keeps its own theme fonts, styles, bullet numbering, page margins and
// contact icons; only the body is generated. Paragraph/run properties below are copied
// from the original Hyeonyoung_park_resume.docx so the output matches it in Word.
// The template's body was stripped by tools/strip_template.py, leaving a {{BODY}} marker.

import JSZip from 'jszip';
import { parseRich } from '../model/richtext';
import { linkLabel } from '../model/snapshot';
import type { ContactKind, Snapshot, SnapshotEntry, SnapshotSection } from '../model/types';

const RFONTS =
  '<w:rFonts w:asciiTheme="minorHAnsi" w:eastAsia="Nunito" w:hAnsiTheme="minorHAnsi" w:cstheme="majorHAnsi"/>';
const LINE = '<w:spacing w:line="240" w:lineRule="auto"/>';
const IND = '<w:ind w:left="-270"/>';
const RIGHT_TAB = '<w:tabs><w:tab w:val="right" w:pos="11199"/></w:tabs>';
const BULLET_NUM_ID = 3;
const SKILL_NUM_ID = 4;

/** Image relationships that exist in the template, keyed by contact kind. */
const ICONS: Partial<Record<ContactKind, { rId: string; emu: number; dist: number }>> = {
  linkedin: { rId: 'rId8', emu: 91440, dist: 114300 },
  phone: { rId: 'rId10', emu: 91440, dist: 114300 },
  email: { rId: 'rId11', emu: 91440, dist: 114300 },
  github: { rId: 'rId12', emu: 104775, dist: 0 },
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface RunOpts {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  sz?: number;
  style?: string;
}

function rPr(o: RunOpts): string {
  return (
    '<w:rPr>' +
    (o.style ? `<w:rStyle w:val="${o.style}"/>` : '') +
    RFONTS +
    (o.bold ? '<w:b/><w:bCs/>' : '') +
    (o.italic ? '<w:i/><w:iCs/>' : '') +
    (o.color ? `<w:color w:val="${o.color}"/>` : '') +
    (o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '') +
    '</w:rPr>'
  );
}

function run(text: string, o: RunOpts = {}): string {
  return `<w:r>${rPr(o)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

const tab = (o: RunOpts = {}) => `<w:r>${rPr(o)}<w:tab/></w:r>`;

function para(pPr: string, body: string): string {
  return `<w:p><w:pPr>${pPr}</w:pPr>${body}</w:p>`;
}

function spacer(halfPoints: number): string {
  return para(`${LINE}${IND}<w:rPr>${RFONTS}<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/></w:rPr>`, '');
}

class Builder {
  private rels: { id: string; target: string }[] = [];
  private drawingId = 100;

  hyperlink(href: string, inner: string): string {
    const id = `rIdLink${this.rels.length + 1}`;
    this.rels.push({ id, target: href });
    return `<w:hyperlink r:id="${id}" w:history="1">${inner}</w:hyperlink>`;
  }

  relsXml(): string {
    return this.rels
      .map(
        (r) =>
          `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(r.target)}" TargetMode="External"/>`,
      )
      .join('');
  }

  icon(kind: ContactKind): string {
    const ic = ICONS[kind];
    if (!ic) return '';
    const id = this.drawingId++;
    const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
    return (
      `<w:r><w:rPr>${RFONTS}<w:noProof/></w:rPr><w:drawing>` +
      `<wp:inline distT="${ic.dist}" distB="${ic.dist}" distL="${ic.dist}" distR="${ic.dist}">` +
      `<wp:extent cx="${ic.emu}" cy="${ic.emu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="${id}" name="${kind} icon"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic xmlns:a="${A}"><a:graphicData uri="${PIC}"><pic:pic xmlns:pic="${PIC}">` +
      `<pic:nvPicPr><pic:cNvPr id="0" name="${kind}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${ic.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${ic.emu}" cy="${ic.emu}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    );
  }

  body(s: Snapshot): string {
    const out: string[] = [];
    out.push(
      para(`${LINE}<w:jc w:val="center"/>`, run(s.name, { bold: true, sz: 34 })),
      para(`<w:widowControl w:val="0"/>${LINE}<w:jc w:val="center"/>`, this.contacts(s)),
    );
    s.sections.forEach((section, i) => {
      if (i > 0) out.push(spacer(10));
      out.push(...this.section(section));
    });
    return out.join('');
  }

  private contacts(s: Snapshot): string {
    return s.contacts
      .map((c) => {
        const label = c.href
          ? this.hyperlink(c.href, run(c.label, { style: 'Hyperlink' }))
          : run(c.label, { color: '0F0F0F' });
        const icon = this.icon(c.kind);
        return (icon ? icon + run(' ') : '') + label;
      })
      .join(run('  |  ', { color: '0F0F0F' }));
  }

  private section(section: SnapshotSection): string[] {
    const out = [
      para(
        `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="auto"/></w:pBdr>${LINE}${IND}`,
        run(section.title, { bold: true, color: '1155CC', sz: 24 }),
      ),
      spacer(2),
    ];
    for (const sk of section.skills ?? []) {
      out.push(bullet(`**${sk.name}:** ${sk.items}`, SKILL_NUM_ID));
    }
    (section.entries ?? []).forEach((e, i) => {
      if (i > 0) out.push(spacer(10));
      out.push(...entry(e, section.key === 'work' ? 6 : 4, this));
    });
    return out;
  }
}

function bullet(text: string, numId = BULLET_NUM_ID): string {
  const runs = parseRich(text)
    .map((r) => run(r.text, { bold: r.bold, color: '0F0F0F' }))
    .join('');
  return para(
    `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>${LINE}<w:ind w:left="142" w:hanging="218"/>`,
    runs,
  );
}

function entry(e: SnapshotEntry, gapAfterHead: number, b: Builder): string[] {
  const head =
    run(e.title, { bold: true }) +
    (e.stack ? run(' | ', { bold: true }) + run(e.stack, { italic: true }) : '') +
    (e.url ? run(' | ', { bold: true }) + b.hyperlink(e.url, run(linkLabel(e.url), { style: 'Hyperlink' })) : '') +
    tab({ bold: true }) +
    run(e.dates, { bold: true });
  const out = [para(`${RIGHT_TAB}${LINE}${IND}`, head)];
  if (e.org) {
    const org = run(e.org, { italic: true }) + (e.orgRight ? tab() + run(e.orgRight) : '');
    out.push(para(`${RIGHT_TAB}${LINE}${IND}`, org));
  }
  if (e.bullets.length) {
    out.push(spacer(gapAfterHead));
    out.push(...e.bullets.map((b) => bullet(b)));
  }
  return out;
}

/** Build the .docx bytes. `template` is the bytes of src/render/template.docx. */
export async function buildDocx(snapshot: Snapshot, template: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(template);
  const b = new Builder();
  const body = b.body(snapshot);

  const docPath = 'word/document.xml';
  const doc = await zip.file(docPath)!.async('string');
  if (!doc.includes('{{BODY}}')) throw new Error('template.docx is missing the {{BODY}} marker');
  zip.file(docPath, doc.replace('{{BODY}}', body));

  const relsPath = 'word/_rels/document.xml.rels';
  const rels = await zip.file(relsPath)!.async('string');
  zip.file(relsPath, rels.replace('</Relationships>', b.relsXml() + '</Relationships>'));

  const corePath = 'docProps/core.xml';
  const core = await zip.file(corePath)?.async('string');
  if (core) {
    zip.file(corePath, core.replace('<dc:title></dc:title>', `<dc:title>${esc(snapshot.name)} — Resume</dc:title>`));
  }

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
