// Day 19ב §4 — one version from the ministry's ONLINE catalog, by its identity.
// The file (data/raw/catalog.csv) is a snapshot we re-download by hand; this is the same table
// live (resource CATALOG_RESOURCE_ID, updated daily), asked one version at a time. It is the way a
// version that is missing from our snapshot can still be placed in `models`: the record goes
// through the very same translateCatalogRow as a file row (catalogRowFromApi, §2.5).
// It writes nothing to disk — there is no cache here, by design: the caller asks for one version
// when it needs it, and the answer belongs in the database, not in data/raw.
// Three answers: one record → found (the row); no records → absent (the version is not in the catalog);
// more than one record → ambiguous, with how many came back (F3f) — the caller keeps that car out, as it
// does a broken catalog row. A ministry that does not answer is MotUnavailableError, which passes through.

import { catalogRowFromApi, type CatalogRow } from "./catalog";
import { motGet, type MotDeps } from "./fetch";
import { CATALOG_RESOURCE_ID, MOT_API } from "./resources";

// The four identity fields of the catalog. The three numbers may be given with their leading zeros
// ("00588") or without ("588"): the datastore's fields are numeric and match either spelling.
export type CatalogVersionKey = {
  vehicleClass: string; // sug_degem: "P" private | "M" commercial
  tozeretCd: string | number;
  degemCd: string | number;
  year: string | number;
};

export type CatalogVersionAnswer =
  | { kind: "found"; row: CatalogRow }
  | { kind: "absent" }
  | { kind: "ambiguous"; rows: number };

export async function fetchCatalogVersion(
  key: CatalogVersionKey,
  deps?: MotDeps,
): Promise<CatalogVersionAnswer> {
  const filters = {
    sug_degem: String(key.vehicleClass),
    tozeret_cd: String(key.tozeretCd),
    degem_cd: String(key.degemCd),
    shnat_yitzur: String(key.year),
  };
  const url = `${MOT_API}?resource_id=${CATALOG_RESOURCE_ID}&filters=${encodeURIComponent(JSON.stringify(filters))}`;

  // A ministry that does not answer twice raises MotUnavailableError, which passes through: a lookup
  // that could not be made is not the same fact as a version that does not exist.
  const { body } = await motGet<Record<string, unknown>>(url, deps);
  const records = body.result?.records ?? [];

  if (records.length === 0) return { kind: "absent" }; // success: true, 0 records — this version is not in the catalog
  // F3f: more than one record for one identity — not a stop; the caller keeps the car out.
  if (records.length > 1) return { kind: "ambiguous", rows: records.length };
  return { kind: "found", row: catalogRowFromApi(records[0]) };
}
