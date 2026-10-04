// Opening screen, F2 — the automatic merge of catalog model names (BRIEF §10.4; findCar-plan.md part (d),
// "the automatic merge"). Pure. Two names of the same canonical make with the same mergeKey are one name.

// Uppercase and trim; a name equal to a prefix stays; else the longest prefix followed by one space or one
// hyphen is dropped with that separator, once. A prefix glued to the name ("JAECOO7 PRO") is not stripped.
export function stripMake(name: string, prefixes: readonly string[]): string {
  const upper = name.trim().toUpperCase();
  if (prefixes.includes(upper)) return upper;
  const longestFirst = [...prefixes].sort((a, b) => b.length - a.length);
  for (const p of longestFirst) {
    if (upper.startsWith(`${p} `) || upper.startsWith(`${p}-`)) return upper.slice(p.length + 1);
  }
  return upper;
}

// Spaces, hyphens, dots, apostrophes (U+0027, U+2019 — the latter built from its code point) and slashes.
const SIGNS = new RegExp(`[\\s\\-.'${String.fromCharCode(0x2019)}/]`, "g");

// stripMake, then every space, hyphen, dot, apostrophe and slash removed.
export function mergeKey(name: string, prefixes: readonly string[]): string {
  return stripMake(name, prefixes).replace(SIGNS, "");
}
