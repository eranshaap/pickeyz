import { fetchRows } from "./fetch";
import { makeDegemCode } from "./degem-code";
import { ownershipCode, originCode, type OwnershipCode, type OriginCode } from "./translator";

// ---- the ministry's rows, with its field names (only what we read) ----
export type RegistryRow = {
  sug_degem: string; tozeret_cd: number; degem_cd: number; tozeret_nm: string; degem_nm: string;
  ramat_gimur: string; shnat_yitzur: number; kinuy_mishari: string; sug_delek_nm: string;
  baalut: string; tzeva_rechev: string; mivchan_acharon_dt: string; tokef_dt: string;
  moed_aliya_lakvish: string;
};
export type HistoryKmRow = { kilometer_test_aharon: number; rishum_rishon_dt: string; mkoriut_nm: string; shnui_zeva_ind: number };
export type HistoryHandRow = { _id: number; baalut_dt: number; baalut: string };
export type CancelledRow = { bitul_dt: string };

// One plate's answers, per resource. `undefined` = the resource was not asked; `[]` = it answered
// nothing, which is an answer (§0.3). getVehicleData asks in the chain's order and stops early, so
// the resources it never reaches are absent here; the refresh fills in what it asked for.
export type RawRows = {
  registry?: RegistryRow[];
  cancelled?: CancelledRow[];
  inactive?: RegistryRow[];
  history_km?: HistoryKmRow[];
  history_hand?: HistoryHandRow[];
};

// ---- what the rest of the code receives; names match the cars table where they map ----
export type VehicleData = {
  license_plate: string;
  vehicle_class: string;                                 // registry sug_degem: "P" | "M" — with degem_code and year, picks the models row
  degem_code: string | null;
  year: number;                                          // registry shnat_yitzur — the car's own year
  hand: number | null;                                   // null = history incomplete, not zero
  ownership_history: { ym: string; type: OwnershipCode }[] | null; // all rows, dealers included, oldest first; null = unknown, never []
  ownership_current: OwnershipCode;                      // registry baalut now -> cars.current_owner_type (Day 18)
  origin: OriginCode | null;                             // history 1; not stored
  test_expiry: string | null;
  mivchan_acharon_dt: string | null;
  km_at_last_test: number | null;
  first_registration: string | null;
  color: string | null;                                  // registry tzeva_rechev as given -> cars.registry_color (Day 18); also the cars.color fallback
  color_changed: boolean | null;                         // history 1 shnui_zeva_ind -> cars.color_changed (Day 18); null = no history-1 record
  registry: { make: string; model_name: string; sub_model: string; degem_nm: string; fuel: string };
};

export type VehicleLookup =
  | { status: "active"; data: VehicleData }
  | { status: "inactive"; data: VehicleData }   // found only in the inactive-vehicles dataset
  | { status: "cancelled"; bitul_dt: string }
  | { status: "not_found" };

// The active registry record's field names, verified 02/09. The inactive dataset is documented as
// carrying the same fields; per our rule we do not take that on trust — the first inactive record
// of a run prints its keys and is compared against this list, and any difference stops the run.
export const REGISTRY_FIELDS = [
  "_id", "mispar_rechev", "tozeret_cd", "sug_degem", "tozeret_nm", "degem_cd", "degem_nm",
  "ramat_gimur", "ramat_eivzur_betihuty", "kvutzat_zihum", "shnat_yitzur", "degem_manoa",
  "mivchan_acharon_dt", "tokef_dt", "baalut", "misgeret", "tzeva_cd", "tzeva_rechev",
  "zmig_kidmi", "zmig_ahori", "sug_delek_nm", "horaat_rishum", "moed_aliya_lakvish",
  "kinuy_mishari",
] as const;

let inactiveFieldsPrinted = false;

// Stops the run if the inactive record does not carry exactly the active record's fields.
function checkInactiveFields(plate: string, row: object): void {
  const keys = Object.keys(row);
  if (!inactiveFieldsPrinted) {
    inactiveFieldsPrinted = true;
    console.log(`mot inactive ${plate}: keys = ${keys.join(", ")}`);
  }
  const missing = REGISTRY_FIELDS.filter((f) => !keys.includes(f));
  const extra = keys.filter((k) => !(REGISTRY_FIELDS as readonly string[]).includes(k));
  if (missing.length || extra.length) {
    throw new Error(
      `MoT inactive ${plate}: fields differ from the active registry record — ` +
        `missing: [${missing.join(", ")}], unexpected: [${extra.join(", ")}]. ` +
        `Re-check the mapping before importing anything from this dataset.`,
    );
  }
}

export function normalizePlate(rawPlate: string): string {
  const plate = rawPlate.replace(/\D/g, "");
  if (plate.length < 6 || plate.length > 8) {
    throw new Error(`plate: expected 6-8 digits, got ${JSON.stringify(rawPlate)}`);
  }
  return plate;
}

export async function getVehicleData(rawPlate: string, refresh = false): Promise<VehicleLookup> {
  const plate = normalizePlate(rawPlate);

  // Sequential on purpose — a few quick requests in a row, not all at once.
  // active -> cancelled -> inactive: a finally-cancelled car may also sit in the inactive
  // file, and cancelled is the stronger fact, so it is asked first.
  const rows: RawRows = {};
  rows.registry = await fetchRows<RegistryRow>("registry", plate, refresh);
  if (!rows.registry[0]) {
    rows.cancelled = await fetchRows<CancelledRow>("cancelled", plate, refresh);
    if (!rows.cancelled[0]) {
      rows.inactive = await fetchRows<RegistryRow>("inactive", plate, refresh);
      if (!rows.inactive[0]) return interpret(plate, rows); // not_found
    }
  }
  // A cancellation record carries no moving fields, so the two history files are not asked for.
  if (rows.cancelled?.[0]) return interpret(plate, rows);
  rows.history_km = await fetchRows<HistoryKmRow>("history_km", plate, refresh);
  rows.history_hand = await fetchRows<HistoryHandRow>("history_hand", plate, refresh);
  return interpret(plate, rows);
}

// The mapping from the ministry's rows to VehicleData, with no I/O in it — the same reading of the
// same answers whether they came off the network or off the cache. Day 14 run C (§0.6, §1.1): the
// refresh drives its own fetch (fresh, nothing written) and then reads the answers through here, so
// `hand`, the ownership rows, the truncation rule and the first_registration fallback stay in one place.
export function interpret(plate: string, rows: RawRows): VehicleLookup {
  let reg = rows.registry?.[0];
  let status: "active" | "inactive" = "active";
  if (!reg) {
    if (rows.cancelled?.[0]) return { status: "cancelled", bitul_dt: rows.cancelled[0].bitul_dt };
    if (!rows.inactive?.[0]) return { status: "not_found" };
    checkInactiveFields(plate, rows.inactive[0]);
    reg = rows.inactive[0];
    status = "inactive";
  }
  if (!rows.history_km || !rows.history_hand) {
    throw new Error(`MoT ${plate}: the ${status} record resolved but a history file was not asked for`);
  }
  const km = rows.history_km;
  const hand = rows.history_hand;

  const history = [...hand]
    .sort((a, b) => a.baalut_dt - b.baalut_dt || a._id - b._id)
    .map((r) => ({ ym: yyyymmToYm(r.baalut_dt), type: ownershipCode(r.baalut) }));

  const k = km[0];
  const first_registration = k?.rishum_rishon_dt || monthToFirstDay(reg.moed_aliya_lakvish);

  // History that starts after the first registration is truncated (pre-2017 car, or a
  // previous plate number). A count from a truncated history is not a hand — it's a guess.
  const firstYm = first_registration?.slice(0, 7);
  const truncated = history.length > 0 && !!firstYm && ymIndex(history[0].ym) > ymIndex(firstYm) + 1;

  const data: VehicleData = {
    license_plate: plate,
    vehicle_class: (reg.sug_degem ?? "").trim(),
    degem_code: makeDegemCode(reg.tozeret_cd, reg.degem_cd),
    year: reg.shnat_yitzur,
    hand: history.length > 0 && !truncated ? history.filter((h) => h.type !== "dealer").length : null,
    ownership_history: history.length > 0 ? history : null,
    ownership_current: ownershipCode(reg.baalut),
    origin: k ? originCode(k.mkoriut_nm) : null,
    test_expiry: reg.tokef_dt || null,
    mivchan_acharon_dt: reg.mivchan_acharon_dt || null,
    km_at_last_test: k?.kilometer_test_aharon ?? null,
    first_registration,
    color: reg.tzeva_rechev || null,
    color_changed: k ? colorChangedInd(plate, k.shnui_zeva_ind) : null,
    registry: {
      make: reg.tozeret_nm,
      model_name: reg.kinuy_mishari,
      sub_model: reg.ramat_gimur,
      degem_nm: reg.degem_nm,
      fuel: reg.sug_delek_nm,
    },
  };
  return { status, data };
}

// Day 18 (§7): history 1's shnui_zeva_ind, 0 / 1. Anything else — absent included — is a value we do not
// know how to read, and a structural failure, never a null (null means "no history-1 record" and nothing else).
function colorChangedInd(plate: string, v: unknown): boolean {
  if (v === 0 || v === "0") return false;
  if (v === 1 || v === "1") return true;
  throw new Error(`MoT ${plate} history_km: shnui_zeva_ind is ${JSON.stringify(v)} — expected 0 or 1`);
}

// 201809 -> "2018-09"
function yyyymmToYm(n: number): string {
  const s = String(n);
  if (!/^\d{6}$/.test(s)) throw new Error(`baalut_dt: unexpected format ${JSON.stringify(n)}`);
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// "2018-9" -> "2018-09-01" (the registry only knows the month; the day is a placeholder)
function monthToFirstDay(s: string): string | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec((s ?? "").trim());
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-01` : null;
}

function ymIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + m;
}