# scripts/measure — measurement queries (BRIEF Day 11, §20 and §21)

Each constant in `src/lib/scoring/constants.ts` that came from our data, or that our data can check,
has a query here. They are run **by hand in the Supabase SQL editor**; nothing imports or wires them.

The literals `group_version = 2` and `sample_size >= 5` inside the queries are snapshots of
`GROUP_VERSION` (`src/lib/comparison-group.ts`) and `MIN_SAMPLE` (`src/lib/scoring/constants.ts`)
at the time of writing. If either changes, update the queries by hand.

| File | Constant measured |
|---|---|
| `zero_km_window.sql` | `ZERO_KM_WINDOW_MONTHS` |
| `hand_gaps.sql` | `HAND_CHECK_KINDS` |
| `km_check.sql` | `KM_BELOW_THRESHOLD`, `KM_IMPLAUSIBLE_PER_MONTH` |
| `km_slope.sql` | `KM_SLOPE_PCT_PER_1000_PER_YEAR` |
| `history_class_price_gap.sql` | `OWNER_TYPE_DEDUCTION`, `ZERO_KM_LEASING_DEDUCTION` |
| `confidence_distribution.sql` | the confidence thresholds (§8, reasons counted once per §18.17) |
| `km_per_year.sql` | official km per year from `car_test_readings` (§21) — not a constant yet; empty until a car has two readings |
