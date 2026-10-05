// Opening screen, S1 §2 — Hebrew typed while the keyboard is on English.
// Each character of the standard Israeli layout's Latin side becomes its Hebrew character; every other
// character stays as it is. Upper and lower case map the same. The table is the brief's: the old bar
// (src/components/search/ModelBar.tsx) had no such conversion to copy.

const LAYOUT: Record<string, string> = {
  q: "/", w: "'", e: "ק", r: "ר", t: "א", y: "ט", u: "ו", i: "ן", o: "ם", p: "פ",
  a: "ש", s: "ד", d: "ג", f: "כ", g: "ע", h: "י", j: "ח", k: "ל", l: "ך", ";": "ף",
  z: "ז", x: "ס", c: "ב", v: "ה", b: "נ", n: "מ", m: "צ", ",": "ת", ".": "ץ",
};

export function fromEnglishLayout(text: string): string {
  let out = "";
  for (const ch of text) out += LAYOUT[ch.toLowerCase()] ?? ch;
  return out;
}
