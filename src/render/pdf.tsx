// Snapshot -> PDF with @react-pdf/renderer.
//
// Measurements follow the Word template (US Letter, 0.43in left / 0.28in right margin,
// headings pulled 270 twips left, 17pt name, 12pt #1155CC headings, 11pt body).
// The template's theme body font is Cambria; Caladea is its metric-compatible open
// equivalent, so line breaks land where Word puts them.

import { Document, Font, Link, Page, Path, StyleSheet, Svg, Text, View, pdf } from '@react-pdf/renderer';
import regular from '@fontsource/caladea/files/caladea-latin-400-normal.woff?url';
import italic from '@fontsource/caladea/files/caladea-latin-400-italic.woff?url';
import bold from '@fontsource/caladea/files/caladea-latin-700-normal.woff?url';
import boldItalic from '@fontsource/caladea/files/caladea-latin-700-italic.woff?url';
import math from '@fontsource/noto-sans-math/files/noto-sans-math-math-400-normal.woff?url';
import { parseRich } from '../model/richtext';
import type { ContactKind, Snapshot, SnapshotEntry } from '../model/types';
import { ICON_PATHS } from './ContactIcon';

Font.register({
  family: 'Caladea',
  fonts: [
    { src: regular },
    { src: italic, fontStyle: 'italic' },
    { src: bold, fontWeight: 'bold' },
    { src: boldItalic, fontWeight: 'bold', fontStyle: 'italic' },
  ],
});
// Caladea has no arrows (→); fall back to Noto Sans Math for those glyphs.
Font.register({
  family: 'NotoMath',
  fonts: [
    { src: math },
    { src: math, fontWeight: 'bold' },
    { src: math, fontStyle: 'italic' },
    { src: math, fontWeight: 'bold', fontStyle: 'italic' },
  ],
});
// Never hyphenate words like "multi-column" mid-token beyond what Word does.
Font.registerHyphenationCallback((word) => [word]);

const tw = (twips: number) => twips / 20; // twips -> pt
const LEFT = tw(624) - tw(270); // headings and entry lines sit 270 twips left of the margin
const BULLET_INDENT = tw(270) - tw(76); // bullet glyph position relative to LEFT
const TEXT_INDENT = tw(270) + tw(142); // bullet text position relative to LEFT
const INK = '#0F0F0F';
const LINE = 1.17;

const s = StyleSheet.create({
  page: {
    fontFamily: 'Caladea',
    fontSize: 11,
    lineHeight: LINE,
    color: INK,
    paddingTop: 30,
    paddingBottom: 24,
    paddingLeft: LEFT,
    paddingRight: tw(397),
  },
  name: { fontSize: 17, lineHeight: LINE, fontWeight: 'bold', textAlign: 'center' },
  contacts: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  contact: { flexDirection: 'row', alignItems: 'center' },
  link: { color: '#0000FF', textDecoration: 'underline' },
  heading: {
    fontSize: 12,
    lineHeight: LINE,
    fontWeight: 'bold',
    color: '#1155CC',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 1,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  bold: { fontWeight: 'bold' },
  fallback: { fontFamily: 'NotoMath', fontSize: 9 },
  italic: { fontStyle: 'italic' },
  bullet: { flexDirection: 'row' },
  bulletGlyph: { position: 'absolute', left: BULLET_INDENT, fontSize: 8, lineHeight: LINE, top: 2 },
  bulletText: { marginLeft: TEXT_INDENT, flex: 1 },
});

const gap = (halfPoints: number) => <View style={{ height: (halfPoints / 2) * LINE }} />;

/** Same set of icons the Word template carries (location has none there). */
const PDF_ICONS: ContactKind[] = ['linkedin', 'phone', 'email', 'github'];

function Icon({ kind }: { kind: ContactKind }) {
  const p = ICON_PATHS[kind];
  return (
    <Svg viewBox="0 0 24 24" style={{ width: 7.5, height: 7.5, marginRight: 3 }}>
      <Path d={p.d} fill={p.fill} />
    </Svg>
  );
}

/** Splits out glyphs Caladea lacks so the tall fallback font can't stretch the line. */
function splitFallback(text: string): { text: string; fallback: boolean }[] {
  return text.split(/([\u2190-\u21ff]+)/).filter(Boolean).map((t) => ({ text: t, fallback: /^[\u2190-\u21ff]/.test(t) }));
}

function RichText({ text }: { text: string }) {
  return (
    <Text>
      {parseRich(text).flatMap((r, i) =>
        splitFallback(r.text).map((seg, j) => (
          <Text key={`${i}-${j}`} style={[r.bold ? s.bold : {}, seg.fallback ? s.fallback : {}]}>
            {seg.text}
          </Text>
        )),
      )}
    </Text>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={s.bullet} wrap={false}>
      <Text style={s.bulletGlyph}>•</Text>
      <View style={s.bulletText}>
        <RichText text={text} />
      </View>
    </View>
  );
}

function EntryBlock({ e, headGap }: { e: SnapshotEntry; headGap: number }) {
  return (
    <View>
      <View style={s.row} wrap={false} minPresenceAhead={40}>
        <Text style={s.bold}>
          {e.title}
          {e.stack && (
            <>
              {' | '}
              <Text style={[s.italic, { fontWeight: 'normal' }]}>{e.stack}</Text>
            </>
          )}
        </Text>
        <Text style={s.bold}>{e.dates}</Text>
      </View>
      {e.org && (
        <View style={s.row}>
          <Text style={s.italic}>{e.org}</Text>
          {e.orgRight && <Text>{e.orgRight}</Text>}
        </View>
      )}
      {e.bullets.length > 0 && gap(headGap)}
      {e.bullets.map((b, i) => (
        <Bullet key={i} text={b} />
      ))}
    </View>
  );
}

export function ResumePdf({ snapshot }: { snapshot: Snapshot }) {
  return (
    <Document title={`${snapshot.name} — Resume`} author={snapshot.name}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.name}>{snapshot.name}</Text>
        <View style={s.contacts}>
          {snapshot.contacts.map((c, i) => (
            <View key={c.id} style={s.contact}>
              {i > 0 && <Text>{'\u00a0\u00a0|\u00a0\u00a0'}</Text>}
              {PDF_ICONS.includes(c.kind) && <Icon kind={c.kind} />}
              {c.href ? (
                <Link src={c.href} style={s.link}>
                  {c.label}
                </Link>
              ) : (
                <Text>{c.label}</Text>
              )}
            </View>
          ))}
        </View>

        {snapshot.sections.map((section, si) => (
          <View key={section.key}>
            {si > 0 && gap(10)}
            <Text style={s.heading} minPresenceAhead={40}>
              {section.title}
            </Text>
            {gap(2)}
            {section.skills?.map((sk) => <Bullet key={sk.name} text={`**${sk.name}:** ${sk.items}`} />)}
            {section.entries?.map((e, i) => (
              <View key={i}>
                {i > 0 && gap(10)}
                <EntryBlock e={e} headGap={section.key === 'work' ? 6 : 4} />
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export function buildPdf(snapshot: Snapshot): Promise<Blob> {
  return pdf(<ResumePdf snapshot={snapshot} />).toBlob();
}
