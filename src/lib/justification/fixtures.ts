// Test fixtures for src/lib/justification/*.test.ts (BRIEF Days 22–23, Run 2, §9).
//
// One JustificationCar is `cand(spec)` of src/lib/selection/fixtures.ts — its invoice, its price, its listing id
// — plus the four things that library's fixture does not build:
//
//   · the stored fields the generator reads beside the invoice: rank, categories, median_price, km
//   · the rule records (`fired` / `untriggered`), kept CONSISTENT with the invoice by default: the generator
//     throws when the cancelled record and the invoice disagree, and it should
//   · the history row's raw — owners, paper_hand, zero_km_deal, deductions. selection's invoice() builds
//     `raw: {}` there (§0.4), so every one of them is written here
//   · the km row's raw — km_declared, median_km. `raw: {}` there too
//
// Nothing here is used by the library itself.

import { cand, type Spec } from "@/lib/selection/fixtures";
import { isCancelled, type Deduction, type OwnershipRow } from "@/lib/scoring/types";
import { hasVerifiedHistory } from "@/lib/selection";
import type { Category, RuleName, RuleTrace } from "@/lib/selection";
import { RULE_TYPE } from "@/lib/selection";
import type { JustificationCar, JustificationSearch } from "./types";

/** A triggered rule record of the right shape (§9). */
export function fired(rule: RuleName, value: number | string | null = null): RuleTrace {
  return { rule, type: RULE_TYPE[rule], value, threshold: null, triggered: true, effect: "ineligible", context: { evaluated: true } };
}

/** The same record, not triggered — what the trace carries for a rule that did not act. */
export function untriggered(rule: RuleName): RuleTrace {
  return { rule, type: RULE_TYPE[rule], value: null, threshold: null, triggered: false, effect: "none", context: { evaluated: true } };
}

// A plain two-private-owner record: hand 2, every owner private, nothing the ledger deducts a type for.
const DEFAULT_OWNERS: OwnershipRow[] = [
  { ym: "2019-03", type: "private" },
  { ym: "2022-06", type: "private" },
];
const DEFAULT_MEDIAN_KM = 60_000;

export type CarSpec = Spec & {
  rank?: number | null; // default: the id — every fixture car is shown unless it says otherwise
  categories?: Category[];
  median_price?: number | null; // default: what cand() carries
  km_snapshot?: number | null; // JustificationCar.km; default: km_declared
  /** Rules that TRIGGERED on this car, beside the two the invoice decides (cancelled, unverified_history). */
  fires?: RuleName[];
  /** The whole trace, for the one test that needs a broken one. */
  trace?: RuleTrace[];
  // the history row's raw
  owners?: OwnershipRow[];
  paper_hand?: number | null;
  zero_km?: boolean;
  deductions?: Deduction[];
  // the km row's raw
  km_declared?: number;
  median_km?: number;
};

export function car(s: CarSpec): JustificationCar {
  const listing = cand(s);
  const invoice = listing.breakdown;
  if (!isCancelled(invoice)) {
    const history = invoice.rows.find((r) => r.row === "history");
    if (history !== undefined && history.status === "scored" && history.source === "mot") {
      history.raw = {
        owners: s.owners ?? DEFAULT_OWNERS,
        paper_hand: s.paper_hand === undefined ? (s.owners ?? DEFAULT_OWNERS).filter((o) => o.type !== "dealer").length : s.paper_hand,
        zero_km_deal: s.zero_km ?? false,
        deductions: s.deductions ?? [],
      };
    }
    const km = invoice.rows.find((r) => r.row === "km");
    if (km !== undefined && km.status === "scored") {
      km.raw = { km_declared: s.km_declared ?? DEFAULT_MEDIAN_KM, median_km: s.median_km ?? DEFAULT_MEDIAN_KM };
    }
  }
  const fires = s.fires ?? [];
  const trace = s.trace ?? defaultTrace(listing, fires);
  return {
    listing_id: listing.listing_id,
    rank: s.rank === undefined ? s.id : s.rank,
    categories: s.categories ?? [],
    price: listing.price,
    km: s.km_snapshot === undefined ? (s.km_declared ?? DEFAULT_MEDIAN_KM) : s.km_snapshot,
    invoice,
    trace,
    median_price: s.median_price === undefined ? listing.median_price : s.median_price,
  };
}

function defaultTrace(listing: ReturnType<typeof cand>, fires: readonly RuleName[]): RuleTrace[] {
  const invoice = listing.breakdown;
  const cancelled = isCancelled(invoice);
  const unverified = cancelled ? false : !hasVerifiedHistory(listing);
  return [
    isCancelled(invoice) ? fired("cancelled", invoice.cancelled_at) : untriggered("cancelled"),
    unverified || fires.includes("unverified_history") ? fired("unverified_history") : untriggered("unverified_history"),
    fires.includes("condition_floor") ? fired("condition_floor") : untriggered("condition_floor"),
  ];
}

/** A crowned search with no price ceiling and no runner-up, unless the override says otherwise. */
export function search(cars: JustificationCar[], over: Partial<JustificationSearch> = {}): JustificationSearch {
  return { crowned: true, runner_up: null, has_price_ceiling: false, cars, ...over };
}

/** `n` plain cars, ids from `from` — the pool a "אחד מ-…" count is measured against. */
export function fillers(n: number, from = 900, over: Partial<CarSpec> = {}): JustificationCar[] {
  return Array.from({ length: n }, (_, i) => car({ id: from + i, ...over }));
}
