// Opening screen, F1 — the spelling key of a catalog model name (models.model).
// Trim, uppercase, collapse every run of whitespace to one space. Nothing else: the merge rules of
// F2 (spaces, letters, signs) are a later brief and do not belong here.
// Not nameKey (src/lib/mot/catalog.ts): that one removes every space ("MAZDA 3" -> "MAZDA3"),
// which is already a merge rule.

export function spellingKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}
