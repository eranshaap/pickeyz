// Stage A scoring engine — every table and threshold (BRIEF Day 11, §3).
// Every constant carries its source in a comment and must not be changed in code without changing the comment.

export const ENGINE_VERSION = 3;
// 1 — Day 11 — first engine
// 2 — Day 12 — no number changed; the invoice gained value_by_reality (history row) and condition_by_reality (sum)
// 3 — Day 14 — three norm levels, each keyed at its own level (cell / model / pool): the typical is the cell's median
//              history row (median_condition is gone), the km slope is the model's own and signed, and a thin cell's
//              price row is anchored on the listing's new-car price through the pool's depreciation curve.
export const MIN_SAMPLE = 5;              // source: Day 9 decision, guess; revisit with volume
export const ROUND_DECIMALS = 1;

// --- history --------------------------------------------------------------
// Percent of the car's value. Negative = deduction. All rows: Levi Yitzhak.
export const OWNER_TYPE_DEDUCTION: Readonly<Record<string, number>> = {
  private:    0,     // source: LY — the reference car
  company:  -21,     // source: LY ownership page — associations, cooperatives, companies
  leasing:  -21,     // source: LY ownership page — leasing without the 3-year-warranty conditions we cannot verify
  rental:   -22,     // source: LY ownership page — prior rental, company unknown
  // reserved, not in the demo:
  government: -27,   // source: LY ownership page, 23–30 midpoint
  military:   -30,   // source: LY ownership page, 25–35 midpoint
};
export const ZERO_KM_LEASING_DEDUCTION = -10;   // source: LY via Calcalist — "second hand that was originally zero-km from a leasing company"

export const OWNER_COUNT_ADJUSTMENT: Readonly<Record<number, number>> = {   // keyed by users (see history.ts)
  1:   0,   // source: LY price list via TheCar — no first-hand premium before age 6 (LY's own site examples give +1 to +5 for older cars). v1 has no age branch: the demo fleet is 3–5 years old. Age table = expansion item, see later.md
  2:  -4,   // source: LY price list via TheCar — 3–4, taking the upper
  3:  -9,   // source: LY price list via TheCar — 8–10, midpoint
  4: -12,   // source: LY price list via TheCar — 11–13, midpoint. 5+ = 4 (our extrapolation; LY stops at 4)
};
export const HISTORY_DEDUCTION_CAP = -40;   // source: LY — maximum cumulative history deductions

export const ZERO_KM_WINDOW_MONTHS = 12;    // source: our data — clusters at 0–3 vs 26–47 months; leasing contracts run 36–60 months
export const ZERO_KM_QUALIFYING_TYPES = ['leasing'] as const;   // source: mechanism — only leasing has a contract floor; rental does not
export const PRIVATE_PAIR_MAX_MONTHS = 1;   // source: guess from two cases (same month); measure later

// --- km ---------------------------------------------------------------------
export const KM_SLOPE_PCT_PER_1000_PER_YEAR = -0.6; // source: LY examples midpoint AND our measurement (−0.64, n=78, r=−0.52) — both per 1,000 km per YEAR OF AGE: LY's 15–20k band is annual, his examples were annualized by the car's age, our regression used km_dev / age. Symmetric by decision (Day 11); LY's under-band bonus is steeper (~1.2 per 1,000/yr) — see later.md "km slope asymmetry". Day 14 (§0.3): the SIGN CONVENTION CHANGED — the constant is now signed like the slopes stored in model_stats (more km → negative), and the engine multiplies it as is instead of negating it. The magnitude did not change.
export const KM_SLOPE_MIN_SAMPLE = 100;             // source: Day 14 decision (§0.3) — listings a model's own regression needs before its slope replaces the default. Below it the default is used; model_stats stores the measured slope either way.
export const KM_CAP_PCT = 11;                        // source: LY — largest km example
export const AGE_FLOOR_YEARS = 0.5;                  // source: mechanism — avoid dividing by a few days

// --- cross-checks -------------------------------------------------------------
export const KM_BELOW_THRESHOLD = 5000;              // source: our data — gap between −3,900 and −6,900
export const KM_IMPLAUSIBLE_PER_MONTH = 5000;        // source: our data — one case at 30,000/month, the rest ≤ 2,400

export const HAND_CHECK_KINDS = {                    // counts = enters the confidence count. source: Day 11 data pass, §7
  zero_km_undercount: { counts: true  },  // source: seller hides a registered leasing owner; no disclosure in the ad (verified on 4 live ads)
  fleet_undercount:   { counts: true  },  // source: seller hides a fleet owner
  private_pair:       { counts: false },  // source: two private rows within a month — cause unknown, tracked only
  other:              { counts: true  },  // source: unexplained
} as const;
export const KM_CHECK_KINDS = {                      // source: Day 11 data pass, §7
  km_below:               { counts: true  },  // source: a car cannot lose km
  km_implausible_growth:  { counts: false },  // source: almost certainly an official typo; tracked only
} as const;

// --- sold signal -------------------------------------------------------------
export const SOLD_SIGNAL_RECENT_MONTHS = 3;          // source: guess; measure later

// --- confidence ----------------------------------------------------------------
// items = missing-row reasons (each reason once, §18.17) + counted mismatches + unverified-source rows + possibly_sold (§18.8)
// 0 → high, 1 → medium, 2+ → low
