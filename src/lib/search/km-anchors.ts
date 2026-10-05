// The km filter chips of the search screen (BRIEF Day 15 §1.2; moved here by S3 §1).
//
// They are quartiles (P25/P50/P75) of km_declared, nulls ignored, each rounded UP to the nearest 10,000 and
// then deduplicated, so two quartiles that round to the same number give fewer chips and never an invented
// value. Until S3 they were measured in scripts/compute-market-stats.ts and stored per catalog name in
// model_stats.km_filter_anchors; a model family with live listings under two catalog names had no single
// answer. S3 §1: they are computed when the filter rows are loaded (src/lib/search/counts.ts), over the
// family's live listings, all its catalog names together. The norms script imports the same code from here,
// unchanged, for the column it still writes.
//
// The quantile is the linear interpolation that agrees with the norms script's median() at p = 0.5, so the
// P50 chip and that file's medians are the same convention (the script checks it on every model).

// Day 15 (§1.2): the km filter chips are these quantiles of the model's live km_declared, each rounded UP to
// KM_ANCHOR_ROUNDING. Not constants of the engine - a chip is a UI number, and the pencil book holds no UI numbers.
export const KM_ANCHOR_QUANTILES = [0.25, 0.5, 0.75] as const;
export const KM_ANCHOR_ROUNDING = 10_000;

// Day 15 (§1.2): the quantile the norms script uses everywhere it needs one that is not the median - linear
// interpolation between the two neighbouring order statistics. It agrees with median() at p = 0.5 by
// construction (checked there), so the P50 chip and the script's medians are the same convention.
export function quantile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("quantile of an empty set");
  const s = [...values].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

// Day 15 (§1.2): the model's km filter chips. Quartiles of the km values given, each rounded UP to the
// nearest KM_ANCHOR_ROUNDING, then deduplicated - two quartiles that round to the same number leave fewer
// chips, never an invented one. Ascending. Empty when no live listing of the model states a km.
export function kmFilterAnchors(kms: number[]): number[] {
  if (kms.length === 0) return [];
  const rounded = KM_ANCHOR_QUANTILES.map((p) => Math.ceil(quantile(kms, p) / KM_ANCHOR_ROUNDING) * KM_ANCHOR_ROUNDING);
  return [...new Set(rounded)].sort((a, b) => a - b);
}
