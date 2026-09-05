// Our concept, not the ministry's: which listings are "the same product" in the buyer's eyes.
// One key (schema, part D, models): class|make|model|body|fuel|cc|hp|gearbox|drive|trim. Year is NOT part of it.
// vehicle_class (P private | M commercial) is the FIRST component: a private and a commercial
// variant with the same nine spec fields are two products to the buyer, never one group.
// A thin (group × year) cell is never merged into a coarser group — it keeps its own row and its
// true sample_size; the scoring step treats a small sample as "no price comparison".
// GROUP_VERSION changes only when this definition changes; then models.comparison_group and
// every market median are recomputed.
//   version 1: make|model|body|fuel|cc|hp|gearbox|drive|trim
//   version 2: vehicle_class prepended (Day 10a)

export const GROUP_VERSION = 2;

export type GroupFields = {
  vehicle_class: string | null;
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
  "vehicle_class", "make", "model", "body_type", "fuel_type", "engine_size", "horsepower", "transmission", "drive_type", "sub_model",
];

export function groupKey(f: GroupFields): string {
  return GROUP_FIELDS.map((k) => String(f[k] ?? "")).join("|");
}
