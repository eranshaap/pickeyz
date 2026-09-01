import { fetchRows } from "./fetch";
import { makeDegemCode } from "./degem-code";
import { ownershipCode, originCode, type OwnershipCode, type OriginCode } from "./translator";

// ---- the ministry's rows, with its field names (only what we read) ----
type RegistryRow = {
  sug_degem: string; tozeret_cd: number; degem_cd: number; tozeret_nm: string; degem_nm: string;
  ramat_gimur: string; shnat_yitzur: number; kinuy_mishari: string; sug_delek_nm: string;
  baalut: string; tzeva_rechev: string; mivchan_acharon_dt: string; tokef_dt: string;
  moed_aliya_lakvish: string;
};
type HistoryKmRow = { kilometer_test_aharon: number; rishum_rishon_dt: string; mkoriut_nm: string };
type HistoryHandRow = { _id: number; baalut_dt: number; baalut: string };
type CancelledRow = { bitul_dt: string };

// ---- what the rest of the code receives; names match the cars table where they map ----
export type VehicleData = {
  license_plate: string;
  vehicle_class: string;                                 // registry sug_degem: "P" | "M" — with degem_code and year, picks the models row
  degem_code: string | null;
  year: number;                                          // registry shnat_yitzur — the car's own year
  hand: number | null;                                   // null = history incomplete, not zero
  ownership_history: { ym: string; type: OwnershipCode }[]; // all rows, dealers included, oldest first
  ownership_current: OwnershipCode;                      // registry value now; not stored
  origin: OriginCode | null;                             // history 1; not stored
  test_expiry: string | null;
  mivchan_acharon_dt: string | null;
  km_at_last_test: number | null;
  first_registration: string | null;
  color: string | null;
  registry: { make: string; model_name: string; sub_model: string; degem_nm: string; fuel: string };
};

export type VehicleLookup =
  | { status: "active"; data: VehicleData }
  | { status: "cancelled"; bitul_dt: string }
  | { status: "not_found" };

export async function getVehicleData(rawPlate: string, refresh = false): Promise<VehicleLookup> {
  const plate = rawPlate.replace(/\D/g, "");
  if (plate.length < 6 || plate.length > 8) {
    throw new Error(`plate: expected 6-8 digits, got ${JSON.stringify(rawPlate)}`);
  }

  // Sequential on purpose — four quick requests in a row, not four at once.
  const registry = await fetchRows<RegistryRow>("registry", plate, refresh);
  const reg = registry[0];
  if (!reg) {
    const cancelled = await fetchRows<CancelledRow>("cancelled", plate, refresh);
    return cancelled[0] ? { status: "cancelled", bitul_dt: cancelled[0].bitul_dt } : { status: "not_found" };
  }
  const km = await fetchRows<HistoryKmRow>("history_km", plate, refresh);
  const hand = await fetchRows<HistoryHandRow>("history_hand", plate, refresh);

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
    ownership_history: history,
    ownership_current: ownershipCode(reg.baalut),
    origin: k ? originCode(k.mkoriut_nm) : null,
    test_expiry: reg.tokef_dt || null,
    mivchan_acharon_dt: reg.mivchan_acharon_dt || null,
    km_at_last_test: k?.kilometer_test_aharon ?? null,
    first_registration,
    color: reg.tzeva_rechev || null,
    registry: {
      make: reg.tozeret_nm,
      model_name: reg.kinuy_mishari,
      sub_model: reg.ramat_gimur,
      degem_nm: reg.degem_nm,
      fuel: reg.sug_delek_nm,
    },
  };
  return { status: "active", data };
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