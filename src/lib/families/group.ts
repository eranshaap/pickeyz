// Opening screen, F2 — the name group of a catalog model name (BRIEF §10.5; findCar-plan.md part (d), "the group").
// Pure. The input is stripMake's output; a group is (canonical make, groupKey).

// Step 1: a letters-only token followed by one space or hyphen and a digits-only token become one token.
// Tokens are delimited by whitespace and hyphens. Letters first only: "MX 5" -> "MX5", "500 X" stays.
const LETTERS_DIGITS = /(?<=^|[\s-])([A-Z]+)[ -](\d+)(?=$|[\s-])/g;
// Step 4: letters, then three digits or more, then letters at most -> the leading letters.
const LETTERS_NUMBER = /^([A-Z]+)\d{3,}[A-Z]*$/;
// Step 3: hyphens, dots, apostrophes (U+0027, U+2019 — the latter built from its code point) and slashes.
const INNER_SIGNS = new RegExp(`[-.'${String.fromCharCode(0x2019)}/]`, "g");

export function groupKey(strippedName: string): string {
  const joined = strippedName.trim().replace(LETTERS_DIGITS, "$1$2");
  const first = joined.split(/\s+/)[0];
  const token = first.replace(INNER_SIGNS, "");
  const m = LETTERS_NUMBER.exec(token);
  return m ? m[1] : token;
}
