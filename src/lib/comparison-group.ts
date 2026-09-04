// Our concept, not the ministry's: which listings are "the same product" in the buyer's eyes.
// One key (schema, part D, models): make|model|body|fuel|cc|hp|gearbox|drive|trim. Year is NOT part of it.
// A thin (group × year) cell is never merged into a coarser group — it keeps its own row and its
// true sample_size; the scoring step treats a small sample as "no price comparison".
// GROUP_VERSION changes only when this definition changes; then models.comparison_group and
// every market median are recomputed.

export const GROUP_VERSION = 1;

export type GroupFields = {
  make: string | null;
  model: string | null;
  body_type: string | null;
  fuel_type: string | null;
  engine_size: number | null;
  horsepower: number | null;
  transmission: string | null;
  drive_type: string | null;
  sub_model: string | null;
};

export const GROUP_FIELDS: (keyof GroupFields)[] = [
  "make", "model", "body_type", "fuel_type", "engine_size", "horsepower", "transmission", "drive_type", "sub_model",
];

export function groupKey(f: GroupFields): string {
  return GROUP_FIELDS.map((k) => String(f[k] ?? "")).join("|");
}
