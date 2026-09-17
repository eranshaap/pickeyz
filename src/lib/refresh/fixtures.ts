// Test fixtures for src/lib/refresh/*.test.ts (BRIEF §3.2): a stored car, a previous raw snapshot and
// a fresh raw, each overridable per test. The default three agree with each other — the identical
// answer of §3.3 (a) — so a test names only the one thing it is about.
//
// The values are a real IONIQ HYBRID as the ministry gives it (plate 62357502, cached 09/09), with the
// full field list of every resource: a test that drops a field must see the gate stop, and a test about
// "a field outside the database changed" needs those fields to be there in the first place.

import type { RawRecord, Snapshot } from "./raw";
import type { StoredCar } from "./types";

export const NOW = new Date("2026-09-12T09:00:00.000Z");
export const PLATE = "62357502";

/** The car as `cars` holds it — all 21 columns the refresh can see, plus its models row's identity. */
export function storedCar(over: Partial<StoredCar> = {}): StoredCar {
  return {
    id: 143,
    license_plate: PLATE,
    model_id: 40522,
    year: 2021,
    hand: 2,
    ownership_history: [
      { ym: "2021-08", type: "private" },
      { ym: "2023-05", type: "private" },
    ],
    color: "שחור",
    test_expiry: "2027-08-28",
    mivchan_acharon_dt: "2026-09-03",
    km_at_last_test: 90195,
    first_registration: "2021-08-29",
    registry_checked_at: "2026-09-09",
    cancelled_at: null,
    // Day 18 (§7): what the default snapshot gives — so the identical answer still writes nothing
    current_owner_type: "private",
    registry_color: "שחור מטלי",
    color_changed: false,
    model: { vehicle_class: "P", degem_code: "481-247" },
    ...over,
  };
}

/** The active-registry record, all 24 fields (src/lib/mot/vehicle.ts REGISTRY_FIELDS). */
export function registryRecord(over: Partial<RawRecord> = {}): RawRecord {
  return {
    _id: 258679,
    mispar_rechev: 62357502,
    tozeret_cd: 481,
    sug_degem: "P",
    tozeret_nm: "יונדאי קוריאה",
    degem_cd: 247,
    degem_nm: "C851C",
    ramat_gimur: "SUPREME FL",
    ramat_eivzur_betihuty: 2,
    kvutzat_zihum: 3,
    shnat_yitzur: 2021,
    degem_manoa: "G4LE",
    mivchan_acharon_dt: "2026-09-03",
    tokef_dt: "2027-08-28",
    baalut: "פרטי",
    misgeret: "KMHC851CGNU265177",
    tzeva_cd: 11,
    tzeva_rechev: "שחור מטלי",
    zmig_kidmi: "225/45R17",
    zmig_ahori: "225/45R17",
    sug_delek_nm: "בנזין",
    horaat_rishum: 200015,
    moed_aliya_lakvish: "2021-8",
    kinuy_mishari: "IONIQ HYBRID",
    ...over,
  };
}

/** The final-cancellation record, all 26 fields. Note: no sug_degem, and moed_aliya_lakvish is numeric. */
export function cancelledRecord(over: Partial<RawRecord> = {}): RawRecord {
  return {
    _id: 91001,
    mispar_rechev: 62357502,
    tozeret_cd: 481,
    tozeret_nm: "יונדאי קוריאה",
    degem_cd: 247,
    degem_nm: "C851C",
    sug_rechev_cd: 1,
    sug_rechev_nm: "פרטי נוסעים",
    moed_aliya_lakvish: 202108,
    bitul_dt: "2026-09-10",
    misgeret: "KMHC851CGNU265177",
    tozar_manoa: "HYUNDAI",
    degem_manoa: "G4LE",
    mispar_manoa: "G4LEMU141990",
    mishkal_kolel: 1910,
    ramat_gimur: "SUPREME FL",
    ramat_eivzur_betihuty: 2,
    kvutzat_zihum: 3,
    shnat_yitzur: 2021,
    baalut: "פרטי",
    tzeva_rechev: "שחור מטלי",
    zmig_kidmi: "225/45R17",
    zmig_ahori: "225/45R17",
    sug_delek_nm: "בנזין",
    horaat_rishum: 200015,
    kinuy_mishari: "IONIQ HYBRID",
    ...over,
  };
}

/** History 1 — km at last test, first registration, origin, the four change indicators. 10 fields. */
export function history1(over: Partial<RawRecord> = {}): RawRecord {
  return {
    _id: 2345194,
    mispar_rechev: 62357502,
    mispar_manoa: "G4LEMU141990",
    kilometer_test_aharon: 90195,
    shinui_mivne_ind: 0,
    gapam_ind: 0,
    shnui_zeva_ind: 0,
    shinui_zmig_ind: 0,
    rishum_rishon_dt: "2021-08-29",
    mkoriut_nm: "",
    ...over,
  };
}

/** History 2 — one row per ownership period. `_id` is the tie-break that orders two rows of one month. */
export function history2Row(baalut_dt: number, baalut: string, _id: number): RawRecord {
  return { _id, mispar_rechev: 62357502, baalut_dt, baalut };
}

/** The default history-2 answer: private from 2021-08, private again from 2023-05 — `hand` = 2. */
export function history2(): RawRecord[] {
  return [history2Row(202108, "פרטי", 3922703), history2Row(202305, "פרטי", 3922704)];
}

/**
 * One plate's five resource answers. The default is an ACTIVE car, so `cancelled` and `inactive` are
 * absent — the chain never asked for them, which is not the same as their having answered nothing.
 */
export function snapshot(over: Snapshot = {}): Snapshot {
  return {
    registry: [registryRecord()],
    history_km: [history1()],
    history_hand: history2(),
    ...over,
  };
}

/** The two history files as the two inactive cars answer them: present, and empty. */
export const EMPTY_HISTORY: Snapshot = { history_km: [], history_hand: [] };
