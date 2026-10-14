// Locate a requirement's excerpt inside the raw page text (line breaks and spacing may differ).
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordsOf(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

export function locate(pageText: string, excerpt: string): [number, number] | null {
  const words = wordsOf(excerpt.replace(/[‐-]\s*$/, ''));
  if (words.length < 2) return null;
  const head = words.slice(0, Math.min(10, words.length)).map(esc).join('[\\s-]*\\s*');
  const startMatch = new RegExp(head).exec(pageText);
  if (!startMatch) return null;
  const start = startMatch.index;
  const tail = words.slice(-Math.min(5, words.length)).map(esc).join('[\\s-]*\\s*');
  const rest = pageText.slice(start);
  const endRx = new RegExp(tail);
  const endMatch = endRx.exec(rest);
  let end = endMatch ? start + endMatch.index + endMatch[0].length : start + startMatch[0].length;
  if (end - start > excerpt.length * 1.6 + 40) end = start + startMatch[0].length;
  return [start, end];
}

export interface Segment {
  text: string;
  ids?: string[];
}

export function segment(pageText: string, marks: { id: string; excerpt: string }[]): Segment[] {
  const spans: { s: number; e: number; id: string }[] = [];
  for (const m of marks) {
    const found = locate(pageText, m.excerpt);
    if (found) spans.push({ s: found[0], e: found[1], id: m.id });
  }
  spans.sort((a, b) => a.s - b.s || b.e - a.e);
  const out: Segment[] = [];
  let pos = 0;
  for (const sp of spans) {
    if (sp.s < pos) {
      // overlapping: attach to the previous highlight instead of nesting
      const last = out[out.length - 1];
      if (last && last.ids && !last.ids.includes(sp.id)) last.ids.push(sp.id);
      continue;
    }
    if (sp.s > pos) out.push({ text: pageText.slice(pos, sp.s) });
    out.push({ text: pageText.slice(sp.s, sp.e), ids: [sp.id] });
    pos = sp.e;
  }
  if (pos < pageText.length) out.push({ text: pageText.slice(pos) });
  return out;
}
