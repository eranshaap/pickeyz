// Day 14 run C — the gate (BRIEF §0.2, §0.3–§0.9, §3.1).
//
// One pure function: stored car row + previous raw snapshot + fresh raw -> accept (with zero or more
// flags, and the exact set of values to persist) or reject (with a reason). It does no I/O, reads no
// clock, and touches neither the database nor the cache. §0.2: only an accepted answer is written
// anywhere, and the script persists exactly what `writes` says — it decides nothing itself.
//
// Three outcomes, and only three (§0.12):
//   throw   a structural failure — the record does not parse, an owner-type value the mapping does not
//           know, a field the gate reads is gone, the plate returned is not the plate asked for.
//           A stop of the run, never a skip: a renamed field must not be skipped 250 times (§0.3).
//   reject  the answer is not about this car, or it contradicts what we hold. Nothing is written,
//           not even the timestamp. One report line, and the run continues.
//   accept  the fields of `writes`, and nothing else.
//
// The order of the checks decides which reason a bad answer is reported under, never whether it is
// rejected: identity (§0.5) -> the km/date pairing (§0.7) -> the moving fields (§0.6) ->
// the ownership cross-check (§0.7) -> colour (§0.8) -> the fields outside the database (§0.9).

import { interpret, type VehicleData } from "@/lib/mot/vehicle";
import { makeDegemCode } from "@/lib/mot/degem-code";
import {
  asRawRows, chassis, checkStructure, history1TestDate, intOrNull, isoDate, monthKey,
  outsideChanges, show, type RawRecord, type Snapshot,
} from "./raw";
import { NOTE_WORDS } from "./types";
import type {
  Accept, Change, CarWrites, EvaluateResult, Flag, OwnershipRow, Reading, Reason, StoredCar,
} from "./types";

/** One owner-type code, as the mapping produces them. */
type OwnershipCode = OwnershipRow["type"];

/** §11.1: the coded note, so a run can count it. Exported for the report and the dry pass. */
export const UNDECIDABLE = "baalut_undecidable";

function reject(reason: Reason, detail: string): EvaluateResult {
  return { outcome: "reject", reason, detail };
}

/** `field: old → new`, the shape every report line uses. */
function change(field: string, from: unknown, to: unknown): Change {
  return { field, from: show(from), to: show(to) };
}

/** The registry-shaped record of a snapshot: whichever of the two files carried one. */
function regRecord(snap: Snapshot): RawRecord | undefined {
  return snap.registry?.[0] ?? snap.inactive?.[0];
}

/** The chassis number a snapshot holds, from whichever of the three records carried one (§0.5). */
function snapshotChassis(snap: Snapshot): string | null {
  const rec = snap.registry?.[0] ?? snap.inactive?.[0] ?? snap.cancelled?.[0];
  return rec ? chassis(rec.misgeret) : null;
}

/** Did this snapshot carry a history-1 record with a first-registration date? (§0.5's refinement) */
function hasHistory1Date(snap: Snapshot): boolean {
  const rec = snap.history_km?.[0];
  return !!rec && isoDate(rec.rishum_rishon_dt, "history_km.rishum_rishon_dt") !== null;
}

const sameYearMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

export function evaluate(
  stored: StoredCar,
  previous: Snapshot,
  fresh: Snapshot,
  now: Date,
): EvaluateResult {
  const plate = stored.license_plate;

  // §0.3 — structural, before anything else. Throws.
  checkStructure(plate, fresh);
  // Reads the answer exactly as the import reads it, including the ownership mapping (which throws on
  // a value it does not know), the `hand` count with its truncation rule, and the first-registration
  // fallback. Nothing about that reading is re-implemented here (§1.2).
  const lookup = interpret(plate, asRawRows(fresh));

  if (lookup.status === "not_found") {
    return reject("not_found", `the plate is in none of the four registries (registry, cancellations, inactive)`);
  }
  if (lookup.status === "cancelled") {
    return cancelledAnswer(stored, previous, fresh, now);
  }
  return livingAnswer(stored, previous, fresh, lookup.data, lookup.status, now);
}

// ---------------------------------------------------------------------------
// §0.4 — a cancellation record is accepted AS A STATUS: the date, the timestamp, nothing else.
// The cancellation record carries no moving fields at all, so there are none to consider. §0.5 still
// applies to identity: a reassigned plate must not write a cancellation onto the wrong car.
// ---------------------------------------------------------------------------
function cancelledAnswer(stored: StoredCar, previous: Snapshot, fresh: Snapshot, now: Date): EvaluateResult {
  const rec = fresh.cancelled?.[0];
  if (!rec) throw new Error(`MoT ${stored.license_plate}: the answer resolved to cancelled with no cancellation record`);

  const degem = makeDegemCode(
    intOrNull(rec.tozeret_cd, "cancelled.tozeret_cd"),
    intOrNull(rec.degem_cd, "cancelled.degem_cd"),
  );
  if (degem !== stored.model.degem_code) {
    return reject("identity_model", `cancellation record degem_code ${show(degem)}, this car is ${show(stored.model.degem_code)} — a reassigned plate`);
  }
  const year = intOrNull(rec.shnat_yitzur, "cancelled.shnat_yitzur");
  if (year !== stored.year) {
    return reject("identity_year", `cancellation record shnat_yitzur ${show(year)}, this car is ${show(stored.year)} — a reassigned plate`);
  }
  const prevChassis = snapshotChassis(previous);
  const freshChassis = chassis(rec.misgeret);
  if (prevChassis !== null && freshChassis !== prevChassis) {
    return reject("identity_chassis", `misgeret ${show(prevChassis)} -> ${show(freshChassis)}`);
  }

  const bitul = isoDate(rec.bitul_dt, "cancelled.bitul_dt");
  if (bitul === null) {
    throw new Error(`MoT ${stored.license_plate}: a cancellation record with no bitul_dt does not parse as one`);
  }

  const car: CarWrites = {};
  const changes: Change[] = [];
  const flags: Flag[] = [];
  if (stored.cancelled_at === null) {
    car.cancelled_at = bitul;
    changes.push(change("cancelled_at", null, bitul));
  } else if (stored.cancelled_at !== bitul) {
    // §0.4: written once. A later different value is a flag, not an overwrite.
    flags.push("cancelled_date_changed");
  }

  return {
    outcome: "accept",
    status: "cancelled",
    flags,
    writes: { car, reading: null, registry_checked_at: now },
    changes,
    outside: outsideChanges(previous, fresh),
    colour: null, // §0.4: cancelled_at and the timestamp, nothing else — a cancellation never fills cars.color
    history_grew: false,
    notes: ["the live listings of this car should come down — a manual-pass item (§0.4)"],
  };
}

// ---------------------------------------------------------------------------
// active / inactive — the full gate.
// ---------------------------------------------------------------------------
function livingAnswer(
  stored: StoredCar,
  previous: Snapshot,
  fresh: Snapshot,
  v: VehicleData,
  status: "active" | "inactive",
  now: Date,
): EvaluateResult {
  const rec = regRecord(fresh);
  if (!rec) throw new Error(`MoT ${stored.license_plate}: the answer resolved to ${status} with no registry record`);
  const h1 = fresh.history_km?.[0];

  const car: CarWrites = {};
  const changes: Change[] = [];
  const flags: Flag[] = [];
  const notes: string[] = [];

  // ---- §0.5 identity: any change rejects the car ----
  if (v.degem_code !== stored.model.degem_code) {
    return reject("identity_model", `degem_code ${show(stored.model.degem_code)} -> ${show(v.degem_code)}`);
  }
  if (v.vehicle_class !== (stored.model.vehicle_class ?? "")) {
    return reject("identity_model", `sug_degem ${show(stored.model.vehicle_class)} -> ${show(v.vehicle_class)}`);
  }
  if (v.year !== stored.year) {
    return reject("identity_year", `shnat_yitzur ${show(stored.year)} -> ${show(v.year)}`);
  }

  const prevRec = regRecord(previous);
  const freshMonth = monthKey(rec.moed_aliya_lakvish, "registry.moed_aliya_lakvish");
  if (prevRec) {
    const prevMonth = monthKey(prevRec.moed_aliya_lakvish, "registry.moed_aliya_lakvish (previous)");
    if (prevMonth !== freshMonth) {
      return reject("identity_first_registration", `moed_aliya_lakvish ${show(prevMonth)} -> ${show(freshMonth)}`);
    }
  }

  const prevChassis = snapshotChassis(previous);
  const freshChassis = chassis(rec.misgeret);
  if (prevChassis !== null && freshChassis !== prevChassis) {
    return reject("identity_chassis", `misgeret ${show(prevChassis)} -> ${show(freshChassis)}`);
  }

  // first_registration: history 1's full date, or the registry month with day 01 as the fallback.
  // The one refinement (§0.5): a previous snapshot with NO history-1 record means the stored value came
  // from that fallback, so the full date is written when it falls in the same month. Anything else rejects.
  const freshFirstReg = isoDate(v.first_registration, "history_km.rishum_rishon_dt / registry.moed_aliya_lakvish");
  if (freshFirstReg === null) {
    if (stored.first_registration !== null) {
      return reject("identity_first_registration", `first_registration ${show(stored.first_registration)} -> null`);
    }
  } else if (stored.first_registration === null) {
    car.first_registration = freshFirstReg;
    changes.push(change("first_registration", null, freshFirstReg));
  } else if (freshFirstReg !== stored.first_registration) {
    const refinement = !hasHistory1Date(previous) && hasHistory1Date(fresh) && sameYearMonth(freshFirstReg, stored.first_registration);
    if (!refinement) {
      return reject("identity_first_registration", `first_registration ${show(stored.first_registration)} -> ${show(freshFirstReg)}`);
    }
    car.first_registration = freshFirstReg;
    changes.push(change("first_registration", stored.first_registration, freshFirstReg));
    notes.push(`first_registration was the registry month with day 01; history 1 now gives the full date in the same month (§0.5)`);
  }

  // ---- §0.7, second clause: the km/date pairing, before any reading is taken ----
  const freshTestDate = isoDate(rec.mivchan_acharon_dt, "registry.mivchan_acharon_dt");
  const h1TestDate = history1TestDate(h1);
  if (h1TestDate !== null && h1TestDate !== freshTestDate) {
    return reject("pairing_broken", `history 1 test date ${show(h1TestDate)} ≠ registry mivchan_acharon_dt ${show(freshTestDate)} — the km/date pairing is broken`);
  }

  // ---- §0.6 moving fields ----

  // tokef_dt -> test_expiry: always written; backward -> flag.
  const freshExpiry = isoDate(rec.tokef_dt, "registry.tokef_dt");
  if (freshExpiry === null && stored.test_expiry !== null) {
    return reject("null_over_value", `test_expiry ${show(stored.test_expiry)} -> null`);
  }
  if (freshExpiry !== null && freshExpiry !== stored.test_expiry) {
    car.test_expiry = freshExpiry;
    changes.push(change("test_expiry", stored.test_expiry, freshExpiry));
    if (stored.test_expiry !== null && freshExpiry < stored.test_expiry) flags.push("expiry_backward");
  }

  // mivchan_acharon_dt, and the km that is paired with it.
  const freshKm = intOrNull(h1?.kilometer_test_aharon, "history_km.kilometer_test_aharon");
  let reading: Reading | null = null;
  if (freshTestDate === null && stored.mivchan_acharon_dt !== null) {
    return reject("null_over_value", `mivchan_acharon_dt ${show(stored.mivchan_acharon_dt)} -> null`);
  }
  if (freshTestDate !== null && stored.mivchan_acharon_dt !== null && freshTestDate < stored.mivchan_acharon_dt) {
    return reject("test_date_earlier", `mivchan_acharon_dt ${show(stored.mivchan_acharon_dt)} -> ${show(freshTestDate)}`);
  }
  const newerTest = freshTestDate !== null && freshTestDate !== stored.mivchan_acharon_dt;
  if (newerTest) {
    if (freshKm === null) {
      return reject("km_null_over_value", `mivchan_acharon_dt ${show(stored.mivchan_acharon_dt)} -> ${show(freshTestDate)} with no km in history 1`);
    }
    car.mivchan_acharon_dt = freshTestDate;
    car.km_at_last_test = freshKm;
    reading = { test_date: freshTestDate, km: freshKm, observed_at: now };
    changes.push(change("mivchan_acharon_dt", stored.mivchan_acharon_dt, freshTestDate));
    changes.push(change("km_at_last_test", stored.km_at_last_test, freshKm));
    if (stored.km_at_last_test !== null && freshKm < stored.km_at_last_test) flags.push("km_decreased");
  } else {
    // The test date did not move, so a km paired with it that CONTRADICTS what we hold is a
    // contradiction and not an update: a reading is unique per (car, date).
    //
    // §10.9 amends §0.6 for the one case that is not a contradiction. `null` is not a value and cannot
    // contradict anything: when we hold no km for this date and the ministry now gives one, it is a
    // FILL — the km simply arrived later than its date. It is written, and it gets a reading row of its
    // own, because there is none for that date yet (the import skips a null km). Two neighbours are
    // unchanged: a stored value replaced by a different value still rejects, and a NEWER date with a
    // null km is still `km_null_over_value` (the branch above).
    if (freshKm === null && stored.km_at_last_test !== null) {
      return reject("km_null_over_value", `km_at_last_test ${show(stored.km_at_last_test)} -> null on the same test date ${show(freshTestDate)}`);
    }
    if (freshKm !== null && stored.km_at_last_test === null && freshTestDate !== null) {
      car.km_at_last_test = freshKm;
      reading = { test_date: freshTestDate, km: freshKm, observed_at: now };
      changes.push(change("km_at_last_test", null, freshKm));
      notes.push(`km_at_last_test filled in on the unchanged test date ${freshTestDate}: the ministry held no km for it at import and gives ${freshKm} now — a fill, with a reading row (§10.9)`);
    } else if (freshKm !== stored.km_at_last_test) {
      // Both values stay in the detail so the direction is visible: a km going UP on an unchanged date
      // may be the ministry's km leading its date, which the next run will tell; a km going DOWN on the
      // same date is a contradiction in every case.
      return reject("km_same_date_differs", `test date ${show(freshTestDate)} unchanged, km_at_last_test ${show(stored.km_at_last_test)} -> ${show(freshKm)}`);
    }
  }

  // history 2 -> ownership_history + hand. The stored rows must be a PREFIX of the fresh rows —
  // month by month, and order-insensitive inside one month (§0.6 as §10.10 amends it).
  const S = stored.ownership_history;
  const F = v.ownership_history;
  let history_grew = false;
  if (S === null && F !== null) {
    car.ownership_history = F;
    car.hand = v.hand;
    flags.push("history_appeared");
    changes.push(change("ownership_history", null, rowsText(F)));
    if (v.hand !== stored.hand) changes.push(change("hand", stored.hand, v.hand));
  } else if (S !== null && F === null) {
    return reject("history_vanished", `ownership_history ${rowsText(S)} -> null`);
  } else if (S !== null && F !== null) {
    const problem = prefixProblem(S, F);
    if (problem) return reject(problem.reason, problem.detail);

    // §10.17: a pure re-ordering inside a month is not a change, ANYWHERE. When the rows are equal as
    // multisets month by month and no row was added, the stored order stays: nothing is written to
    // `ownership_history`, nothing to `hand`, and no flag is raised. P4 already reads such a raw answer
    // as identical (it compares the data fields with `_id` excluded), so the cache does not move
    // either, and §0.1 — the two writers always move together — holds.
    //
    // Only a row being ADDED makes the fresh array the one to keep, and then it is written exactly as
    // it arrived (by `_id`, as the import writes it), with `hand` recomputed in the same operation.
    history_grew = F.length > S.length;
    if (history_grew) {
      car.ownership_history = F;
      car.hand = v.hand;
      changes.push(change("ownership_history", rowsText(S), rowsText(F)));
      if (v.hand !== stored.hand) changes.push(change("hand", stored.hand, v.hand));
    } else if (v.hand !== stored.hand) {
      // No row was added, so §0.6 gives no instruction to write `hand`: it is recomputed WITH the
      // history, in the same operation. A disagreement here is about a value written by an older run,
      // not about today's answer — reported, not written (§10.12).
      notes.push(`hand recomputes to ${show(v.hand)} but ${show(stored.hand)} is stored, on an ownership history that gained no row — not written`);
    }
  }

  // ---- §0.7, first clause, as §11.1 amends it: the cross-check runs only where it is decidable ----
  const cross = ownershipCrossCheck(F, v.ownership_current);
  if (cross.kind === "mismatch") {
    flags.push("baalut_mismatch");
    notes.push(
      cross.rows === 1
        ? `registry baalut is ${cross.registry}, the last history-2 row (${cross.month}) is ${cross.last} — the two files lag each other`
        : `registry baalut is ${cross.registry}, and the last month (${cross.month}) holds ${cross.rows} rows, none of them ${cross.registry} — the two files lag each other`,
    );
  } else if (cross.kind === "undecidable") {
    notes.push(`${UNDECIDABLE} — ${NOTE_WORDS.baalut_undecidable} (last month ${cross.month} holds ${cross.rows} rows; the registry's ${cross.registry} is among them)`);
  }

  // ---- §0.8 colour: fills an empty value, never overwrites ----
  const storedColour = (stored.color ?? "").trim() || null;
  const ministryColour = (v.color ?? "").trim() || null;
  let written = false;
  if (storedColour === null && ministryColour !== null) {
    car.color = ministryColour;
    changes.push(change("color", null, ministryColour));
    written = true;
  }

  const accept: Accept = {
    outcome: "accept",
    status,
    flags,
    writes: { car, reading, registry_checked_at: now },
    changes,
    outside: outsideChanges(previous, fresh),
    colour: { stored: storedColour, ministry: ministryColour, written },
    history_grew,
    notes,
  };
  return accept;
}

/** The ownership rows as one short string, for a report line. */
export function rowsText(rows: OwnershipRow[] | null): string {
  if (rows === null) return "null";
  return rows.map((r) => `${r.ym}:${r.type}`).join(" → ");
}

/**
 * §0.7's first clause as §11.1 amends it: the registry's `baalut` against the ownership record's last
 * month — but only where the file actually decides something.
 *
 * The order of two rows inside one month is not information (§10.10/§10.17): `history_hand` carries
 * only `_id` as a tie-break and the ministry re-orders it. So "the last row" is only a fact when the
 * last month holds ONE row. When it holds more:
 *   - the registry's type is not among them  -> a real mismatch: whichever row is last, it is not `t`.
 *   - the registry's type IS among them      -> undecidable: some ordering of that month agrees with
 *                                               the registry, so there is nothing to disagree with.
 * Undecidable is a NOTE, never a flag: flagging it would report a disagreement the file does not show.
 */
export type CrossCheck =
  | { kind: "no_rows" }
  | { kind: "match"; month: string; rows: number }
  | { kind: "mismatch"; month: string; rows: number; registry: OwnershipCode; last: OwnershipCode | null }
  | { kind: "undecidable"; month: string; rows: number; registry: OwnershipCode };

export function ownershipCrossCheck(rows: OwnershipRow[] | null, registry: OwnershipCode): CrossCheck {
  if (rows === null || rows.length === 0) return { kind: "no_rows" };
  const groups = monthGroups(rows);
  const last = groups[groups.length - 1];
  if (last.types.length === 1) {
    return last.types[0] === registry
      ? { kind: "match", month: last.ym, rows: 1 }
      : { kind: "mismatch", month: last.ym, rows: 1, registry, last: last.types[0] };
  }
  if (!last.types.includes(registry)) {
    return { kind: "mismatch", month: last.ym, rows: last.types.length, registry, last: null };
  }
  return { kind: "undecidable", month: last.ym, rows: last.types.length, registry };
}

/** The rows cut into consecutive months. Two rows of one month are one group. */
function monthGroups(rows: OwnershipRow[]): { ym: string; types: OwnershipRow["type"][] }[] {
  const groups: { ym: string; types: OwnershipRow["type"][] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.ym === r.ym) last.types.push(r.type);
    else groups.push({ ym: r.ym, types: [r.type] });
  }
  return groups;
}

/**
 * §0.6 as §10.10 amends it: are the stored rows a prefix of the fresh rows, month by month, where two
 * months are equal when they hold the same MULTISET of owner types?
 *
 * The order inside a month is not information the ministry gives: `history_hand` carries only `_id`,
 * `mispar_rechev`, `baalut_dt` and `baalut`, so `_id` is the only tie-break there is, and the ministry
 * re-orders it. What is still information, and still rejects: a month that lost a row, a month that is
 * not the month we hold, and a row appearing inside a month EARLIER than one we already hold (that is
 * history being rewritten behind our back, not history moving forward). Only the last stored month may
 * gain rows, and only after it may whole months be added.
 *
 * Returns the reason and the detail of the first problem, or null when the prefix holds.
 */
function prefixProblem(S: OwnershipRow[], F: OwnershipRow[]): { reason: Reason; detail: string } | null {
  const both = `${rowsText(S)} -> ${rowsText(F)}`;
  if (F.length < S.length) {
    return { reason: "history_shrunk", detail: `ownership_history ${S.length} rows -> ${F.length}: ${both}` };
  }
  const SG = monthGroups(S);
  const FG = monthGroups(F);
  for (const [i, g] of SG.entries()) {
    const f = FG[i];
    if (!f) {
      return { reason: "history_shrunk", detail: `ownership_history month ${i + 1} (${g.ym}) is not in the fresh answer: ${both}` };
    }
    if (f.ym !== g.ym) {
      return { reason: "history_changed", detail: `ownership_history month ${i + 1} ${g.ym} -> ${f.ym} (${both})` };
    }
    const left = new Map<string, number>();
    for (const t of f.types) left.set(t, (left.get(t) ?? 0) + 1);
    for (const t of g.types) {
      const n = left.get(t) ?? 0;
      if (n === 0) {
        return { reason: "history_changed", detail: `ownership_history ${g.ym}: the stored ${t} row is not in the fresh answer for that month (${both})` };
      }
      left.set(t, n - 1);
    }
    const isLastStoredMonth = i === SG.length - 1;
    if (!isLastStoredMonth && [...left.values()].some((n) => n > 0)) {
      return { reason: "history_changed", detail: `ownership_history ${g.ym} gained a row behind a later month we already hold (${both})` };
    }
  }
  return null;
}
