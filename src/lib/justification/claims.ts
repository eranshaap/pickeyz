// The justification generator — every relative claim, checked literally (BRIEF Days 22–23, Run 2, §5).
//
// "the only one" and "one of n" are promises about a set, so they are counted over that set and over nothing
// else. THE SEARCH'S CARS are the input cars with rank !== null — the picks and both groups, exactly the screen's `x`
// (src/lib/search/list.ts:132): a hidden car (merged or excluded) is not counted and gets no output row.
//
// A car without a registry reading has an unknown hand and unknown owners: it is counted on NEITHER side of an
// ownership predicate. The share test still divides by the whole `x` — the claim is about the search, not about
// the part of it we happen to have a record for.
//
// No Hebrew in this file — the language lives in wordings.ts (§3).

import type { OwnershipCode } from "@/lib/mot/translator";
import { ONE_OF_MAX_COUNT, ONE_OF_MAX_SHARE_PCT } from "./constants";
import { carFacts, type CarFacts } from "./facts";
import type { JustificationCar, JustificationSearch } from "./types";
import { SCOPE } from "./wordings";

/**
 * The search, read once: its cars, their facts, the count every claim divides by, the scope word and the
 * `cheapest` pick the tag is measured against. Built once per justify() call — pure, and the only reason the
 * library reads each invoice a single time.
 */
export type SearchContext = {
  search: JustificationSearch;
  /** rank !== null, in input order. */
  cars: readonly JustificationCar[];
  facts: ReadonlyMap<number, CarFacts>;
  /** `x` — how many cars the search shows. */
  x: number;
  scope: string;
  /** The car whose categories include "cheapest"; null when the category is empty. */
  cheapest: JustificationCar | null;
};

export function buildContext(search: JustificationSearch): SearchContext {
  const cars = search.cars.filter((c) => c.rank !== null);
  const facts = new Map<number, CarFacts>();
  for (const car of cars) facts.set(car.listing_id, carFacts(car));
  return {
    search,
    cars,
    facts,
    x: cars.length,
    scope: search.has_price_ceiling ? SCOPE.budget : SCOPE.search,
    cheapest: cars.find((c) => c.categories.includes("cheapest")) ?? null,
  };
}

export function factsOf(ctx: SearchContext, car: JustificationCar): CarFacts {
  const f = ctx.facts.get(car.listing_id);
  if (f === undefined) throw new Error(`justification: listing ${car.listing_id} is not one of the search's cars`);
  return f;
}

// --- the form: "the only one", "one of n", or nothing at all -------------------------------------------------

export type Form = { kind: "only" } | { kind: "one_of"; n: number } | null;

/**
 * §5 — the form a predicate that `n` of the search's `x` cars satisfy (the car itself counted) may be written
 * in. The "one of n" form is a claim that only means something while n is small both absolutely and as a share:
 * in a 32-car search it is written up to n = 3, and under 10 cars only the "only one" form can be written.
 */
export function form(n: number, x: number): Form {
  if (n === 1) return { kind: "only" };
  if (n >= 2 && n <= ONE_OF_MAX_COUNT && n <= Math.floor((x * ONE_OF_MAX_SHARE_PCT) / 100)) return { kind: "one_of", n };
  return null;
}

// --- the ownership predicates --------------------------------------------------------------------------------

export type OwnershipFact =
  | { kind: "hand1" }
  | { kind: "all_private" }
  | { kind: "was_type"; type: OwnershipCode }
  | { kind: "hand_up"; h: number };

/** Whether one car satisfies the predicate. A car without a registry reading satisfies none of them. */
export function holds(f: CarFacts, fact: OwnershipFact): boolean {
  if (!f.verified) return false;
  switch (fact.kind) {
    case "hand1":
      return f.hand === 1;
    case "all_private":
      return f.all_private === true;
    case "was_type":
      return f.was_types.includes(fact.type);
    case "hand_up":
      return f.hand !== null && f.hand >= fact.h;
  }
}

/** How many of the search's cars satisfy the predicate — over the cars with a registry reading (§5). */
export function countOwnership(ctx: SearchContext, fact: OwnershipFact): number {
  let n = 0;
  for (const car of ctx.cars) if (holds(factsOf(ctx, car), fact)) n += 1;
  return n;
}

// --- the km and price claims ---------------------------------------------------------------------------------

/** §5 — strictly the lowest: a tie is not "the lowest", and a car with no km is on neither side. */
export function lowestKm(ctx: SearchContext, car: JustificationCar): boolean {
  if (car.km === null) return false;
  for (const other of ctx.cars) {
    if (other.listing_id === car.listing_id) continue;
    if (other.km !== null && other.km <= car.km) return false;
  }
  return true;
}

/**
 * §5 — the tag's claim: cheaper than the car the search crowned `cheapest`. Only on a crowned search, never
 * on a pick, and with no such pick nothing is cheaper than it.
 */
export function cheaperThanCheapest(ctx: SearchContext, car: JustificationCar): boolean {
  if (!ctx.search.crowned) return false;
  if (car.categories.length > 0) return false;
  if (ctx.cheapest === null) return false;
  return car.price < ctx.cheapest.price;
}
