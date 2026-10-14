// Bullet text uses **bold** for emphasis. Every renderer splits it the same way.

export interface Run {
  text: string;
  bold: boolean;
}

export function parseRich(text: string): Run[] {
  const runs: Run[] = [];
  const parts = text.split('**');
  // An odd number of "**" leaves the trailing marker literal rather than bolding to the end.
  const balanced = parts.length % 2 === 1;
  parts.forEach((part, i) => {
    const bold = i % 2 === 1;
    if (!balanced && i === parts.length - 1 && bold) {
      runs.push({ text: '**' + part, bold: false });
      return;
    }
    if (part) runs.push({ text: part, bold });
  });
  return mergeAdjacent(runs);
}

function mergeAdjacent(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.bold === r.bold) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

export function plain(text: string): string {
  return parseRich(text).map((r) => r.text).join('');
}
