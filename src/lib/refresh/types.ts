// Day 14 run C — what the acceptance function takes and what it returns (BRIEF §0.2, §3.1, P6).
//
// Dates cross this boundary as ISO day strings ("2026-04-27"), not Date objects: every date the
// ministry gives is a day, every `cars` column that holds one is @db.Date, and a string compares
// and prints without a timezone in the way. The script converts on both sides.

import type { OwnershipCode } from "@/lib/mot/translator";

export type OwnershipRow = { ym: string; type: OwnershipCode };

/** The car as the database holds it — the columns the refresh reads, plus the models row's identity. */
export type StoredCar = {
  id: number;
  license_plate: string;
  model_id: number;
  year: number | null;
  hand: number | null;
  ownership_history: OwnershipRow[] | null;
  color: string | null;
  test_expiry: string | null;
  mivchan_acharon_dt: string | null;
  km_at_last_test: number | null;
  first_registration: string | null;
  registry_checked_at: string | null;
  cancelled_at: string | null;
  // sug_degem and the degem codes are not columns on `cars`; they live on the models row it points
  // at, and that is what §0.5 compares the fresh answer against.
  model: { vehicle_class: string | null; degem_code: string | null };
};

export type RegistryStatus = "active" | "inactive" | "cancelled";

/** P6: flags are codes; the report maps them to words. */
export type Flag =
  | "expiry_backward"
  | "km_decreased"
  | "history_appeared"
  | "baalut_mismatch"
  | "cancelled_date_changed";

export const FLAG_WORDS: Record<Flag, string> = {
  expiry_backward: "test expiry moved backwards",
  km_decreased: "km lower than the previous reading, on a newer test date",
  history_appeared: "ownership history appeared where there was none",
  baalut_mismatch: "registry ownership type ≠ the last history-2 row",
  cancelled_date_changed: "a cancellation date is already stored and the ministry now gives another",
};

/**
 * P6's note vocabulary (§11.1). A note is not a flag: it is something the gate SAW and deliberately did
 * not act on. A coded note can be counted across a run; the free-text notes beside it cannot.
 */
export type NoteCode = "baalut_undecidable";

export const NOTE_WORDS: Record<NoteCode, string> = {
  baalut_undecidable:
    "the last month holds more than one row and the registry's own ownership type is among them — " +
    "which of those rows is the last one is not knowable from the file, so there is nothing to agree or disagree with",
};

/** P6: reject reasons are codes too. `write_failed` is the script's, not the gate's (P2). */
export type Reason =
  | "identity_model"
  | "identity_year"
  | "identity_chassis"
  | "identity_first_registration"
  | "test_date_earlier"
  | "km_same_date_differs"
  | "km_null_over_value"
  | "null_over_value"
  | "history_shrunk"
  | "history_changed"
  | "history_vanished"
  | "pairing_broken"
  | "not_found"
  | "write_failed";

export const REASON_WORDS: Record<Reason, string> = {
  identity_model: "the model codes are not this car's",
  identity_year: "the production year is not this car's",
  identity_chassis: "the chassis number changed",
  identity_first_registration: "the first registration is not this car's",
  test_date_earlier: "the last test date moved backwards",
  km_same_date_differs: "the same test date carries a different km",
  km_null_over_value: "a test date with no km",
  null_over_value: "the ministry now has nothing where we hold a value",
  history_shrunk: "the ownership history lost rows",
  history_changed: "a row of the stored ownership history changed",
  history_vanished: "the ownership history is gone",
  pairing_broken: "history 1's own test date ≠ the registry's",
  not_found: "the plate is in none of the four registries",
  write_failed: "accepted, but the database write failed (nothing was written)",
};

/** A reading: `cars` keeps the latest, car_test_readings keeps every (car, date) pair (§21). */
export type Reading = { test_date: string; km: number; observed_at: Date };

/** Exactly the `cars` fields to persist. A key that is absent is left alone. */
export type CarWrites = {
  hand?: number | null;
  ownership_history?: OwnershipRow[] | null;
  color?: string;
  test_expiry?: string | null;
  mivchan_acharon_dt?: string | null;
  km_at_last_test?: number | null;
  first_registration?: string | null;
  cancelled_at?: string;
};

/** §3.1: the exact set of values to persist. The script persists this and decides nothing itself. */
export type Writes = {
  car: CarWrites;
  reading: Reading | null;
  registry_checked_at: Date;
};

/** One report line: `plate · field: old → new`. */
export type Change = { field: string; from: string; to: string };

export type Accept = {
  outcome: "accept";
  status: RegistryStatus;
  flags: Flag[];
  writes: Writes;
  /** The `cars` fields that actually move — the report's "changed cars" section. */
  changes: Change[];
  /** §0.9: fields outside the database that moved since the previous snapshot. */
  outside: Change[];
  /** §0.8: what the ministry says about the colour and whether it was taken. */
  colour: { stored: string | null; ministry: string | null; written: boolean } | null;
  /** §0.6: the ownership history grew — the sold candidate. */
  history_grew: boolean;
  /** Seen and deliberately not written. Report lines, never a reject and never a flag. */
  notes: string[];
};

export type Reject = { outcome: "reject"; reason: Reason; detail: string };

export type EvaluateResult = Accept | Reject;
