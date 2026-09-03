// Name normalization for our own dedup: the same business is typed differently
// in every ad, so punctuation and spacing must not decide identity.
export function normalizeName(s: string): string {
  return s.replace(/["'.\-–״׳]/g, " ").replace(/\s+/g, " ").trim();
}
