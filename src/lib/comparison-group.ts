// Our concept, not the ministry's: which listings are "the same product" in the buyer's eyes.
// One key (schema, part D, models): class|make|model|body|fuel|cc|hp|gearbox|drive|trim. Year is NOT part of it.
// vehicle_class (P private | M commercial) is the FIRST component: a private and a commercial
// variant with the same nine spec fields are two products to the buyer, never one group.
// A thin (group × year) cell is never merged into a coarser group — it keeps its own row and its
// true sample_size; the scoring step treats a small sample as "no price comparison".
//
// Every version of the key is defined in GROUP_VERSIONS below, not in a comment. GROUP_VERSION
// changes only when the definition changes; then a new entry is added here, models.comparison_group
// and every market median are recomputed, and market_stats.group_version records which definition
// each row was computed under. Old versions stay in the registry so an old key can be re-derived.

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

export type GroupVersionDef = {
  fields: readonly (keyof GroupFields)[]; // ordered: joined with "|" in this order
  note: string; // one line: date and reason
};

// version → ordered field list. Append a new version; never edit an existing one.
export const GROUP_VERSIONS: Readonly<Record<number, GroupVersionDef>> = {
  1: {
    fields: ["make", "model", "body_type", "fuel_type", "engine_size", "horsepower", "transmission", "drive_type", "sub_model"],
    note: "31/08/2026 — initial key: the nine spec fields from the ministry catalog; year is not part of it.",
  },
  2: {
    fields: ["vehicle_class", "make", "model", "body_type", "fuel_type", "engine_size", "horsepower", "transmission", "drive_type", "sub_model"],
    note: "05/09/2026 — vehicle_class prepended: P (private) and M (commercial) registration is a different product for the buyer.",
  },
};

export const GROUP_VERSION = 2; // the current definition

// The ordered field list of the current version.
export const GROUP_FIELDS: readonly (keyof GroupFields)[] = GROUP_VERSIONS[GROUP_VERSION].fields;

export function groupKey(f: GroupFields, version: number = GROUP_VERSION): string {
  const def = GROUP_VERSIONS[version];
  if (!def) {
    throw new Error(`groupKey: unknown comparison-group version ${version} (known: ${Object.keys(GROUP_VERSIONS).join(", ")})`);
  }
  return def.fields.map((k) => String(f[k] ?? "")).join("|");
}
