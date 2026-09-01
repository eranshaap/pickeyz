// Our concept, not the ministry's: which listings are "the same product" in the buyer's eyes.
// A ladder of keys — level 1 is the full key; each level drops one component (schema, part D, models).
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

export const GROUP_LEVELS: (keyof GroupFields)[][] = [
  ["make", "model", "body_type", "fuel_type", "engine_size", "horsepower", "transmission", "drive_type", "sub_model"],
  ["make", "model", "body_type", "fuel_type", "engine_size", "horsepower", "transmission", "drive_type"],
  ["make", "model", "fuel_type", "engine_size", "horsepower", "transmission", "drive_type"],
  ["make", "model", "fuel_type"],
];

export function groupKey(f: GroupFields, level = 1): string {
  const fields = GROUP_LEVELS[level - 1];
  if (!fields) throw new Error(`group level ${level} is not defined`);
  return fields.map((k) => String(f[k] ?? "")).join("|");
}