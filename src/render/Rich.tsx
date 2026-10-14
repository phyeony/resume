import { parseRich } from '../model/richtext';

export function Rich({ text }: { text: string }) {
  return (
    <>
      {parseRich(text).map((r, i) => (r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>))}
    </>
  );
}
