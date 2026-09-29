// THE JUSTIFICATION GENERATOR, version JUSTIFICATION_GENERATOR_VERSION (BRIEF Days 22–23, Run 2, §6–§8).
//
// One search in, one sentence and one recognition tag per car out, plus the runner-up's fact and the car page's
// two layers. Pure: no clock, no database, no network, no randomness — the same input gives the same output.
// It RECOMPUTES NO SCORE: every number is read off the invoice (facts.ts) or counted over the search's own cars
// (claims.ts), and every string comes from wordings.ts.
//
// Module split: types.ts (§1) · constants.ts (§2) · wordings.ts (§3) · facts.ts (§4) · claims.ts (§5) ·
// price.ts (§6.5, and §7's moved price expression) · index.ts (§6 the sentence, §6.6 the page, §6.7 the
// runner-up, §8 the self-check, and the barrel).
//
// §6 — per search car, in this order; the FIRST case that yields a result decides `kind`:
//   (1) a rule stopped the car        cancelled -> unverified_history -> condition_floor (and cheaper than the pick)
//   (2) a pick                        the reason of the first label in CATEGORY_PRIORITY order
//   (—) a thin cell                   an ownership tag, else the lowest km, else nothing. Never a price.
//   (3) everything else               the component that decided the score the most
//
// No Hebrew in this file — the language lives in wordings.ts (§3).

import { isCancelled } from "@/lib/scoring/types";
import { CATEGORY_PRIORITY, type Category } from "@/lib/selection";
import {
  JUSTIFICATION_GENERATOR_VERSION,
  JUSTIFICATION_MIN_EFFECT_PCT,
  PRICE_ABOUT_EQUAL_BAND_PCT,
  RUNNER_UP_FACT_MAX_CHARS,
  SENTENCE_MAX_CHARS,
  SENTENCE_REPEAT_MAX_SHARE_PCT,
  WHY_EXTRA_FACTS_MAX,
} from "./constants";
import {
  buildContext,
  cheaperThanCheapest,
  countOwnership,
  factsOf,
  form,
  holds,
  lowestKm,
  type OwnershipFact,
  type SearchContext,
} from "./claims";
import { COMPONENT_ORDER, largestComponent, type CarFacts, type ComponentName } from "./facts";
import { kmSentence, priceExpression, priceValueIls } from "./price";
import type { CarJustification, FactFamily, Finding, JustificationCar, JustificationOutput, JustificationSearch, SentenceKind, SentenceValues } from "./types";
import { FAVOURABLE_OWNERSHIP_ORDER, FORBIDDEN_WORDS, LOWEST_KM, OWNER_WORD, OWNERSHIP, RULE, TAG_CHEAPER_THAN_CHEAPEST, UNFAVOURABLE_TIE_ORDER } from "./wordings";

// --- the barrel (§ "Names decided in this brief") -------------------------------------------------------------

export * from "./constants";
export * from "./wordings";
export { fairAmount, fairLine, kmSentence, priceExpression } from "./price";
export { carFacts, largestComponent, type CarFacts, type ComponentName } from "./facts";
export { carsFromSelection, carsFromStoredRows, crownedOf, type StoredRow } from "./input";
export { buildContext, cheaperThanCheapest, countOwnership, form, holds, lowestKm, type Form, type OwnershipFact, type SearchContext } from "./claims";
export type {
  CarJustification,
  FactFamily,
  Finding,
  JustificationCar,
  JustificationOutput,
  JustificationSearch,
  SentenceKind,
  SentenceValues,
} from "./types";

// --- the sentence, as the generator carries it around ---------------------------------------------------------

type Written = { kind: SentenceKind; fact: FactFamily | null; sentence: string; values: SentenceValues };
const EMPTY: Written = { kind: "empty", fact: null, sentence: "", values: {} };
/** One fact, written: the string and the numbers inside it. */
type Fragment = { sentence: string; values: SentenceValues };

function ruleTriggered(car: JustificationCar, rule: string): boolean {
  // Absence = not triggered: the stored trace carries the records the car-page path kept, and a TRIGGERED record
  // is always among them.
  return car.trace.some((t) => t.rule === rule && t.triggered === true);
}

// --- §6.4 the ownership ladder --------------------------------------------------------------------------------

/** One fact of the ladder, written in the form the search's counts allow — or nothing at all. */
function writeOwnership(ctx: SearchContext, f: CarFacts, fact: OwnershipFact): Fragment | null {
  if (!holds(f, fact)) return null;
  const n = countOwnership(ctx, fact);
  const shape = form(n, ctx.x);
  if (shape === null) return null;
  const only = shape.kind === "only";
  const values: SentenceValues = { one_of: n, of: ctx.x };
  const scope = ctx.scope;
  switch (fact.kind) {
    case "hand1":
      return { sentence: only ? OWNERSHIP.only_hand1(scope) : OWNERSHIP.one_of_hand1(n, scope), values };
    case "all_private":
      return { sentence: only ? OWNERSHIP.only_all_private(scope) : OWNERSHIP.one_of_all_private(n, scope), values };
    case "was_type": {
      // A code with no word in the table yields no sentence — the ladder goes on to the next fact.
      const word = OWNER_WORD[fact.type];
      if (word === undefined) return null;
      return { sentence: only ? OWNERSHIP.only_was_type(scope, word) : OWNERSHIP.one_of_was_type(n, scope, word), values };
    }
    case "hand_up":
      return {
        sentence: only ? OWNERSHIP.only_hand_up(scope, fact.h) : OWNERSHIP.one_of_hand_up(n, scope, fact.h),
        values: { ...values, hand: fact.h },
      };
  }
}

/** §6.4 — the facts in the buyer's favour, in FAVOURABLE_OWNERSHIP_ORDER; the first writable one is the sentence. */
function favourableOwnership(ctx: SearchContext, f: CarFacts): Fragment | null {
  for (const kind of FAVOURABLE_OWNERSHIP_ORDER) {
    const fact: OwnershipFact | null = kind === "hand1" ? { kind: "hand1" } : kind === "all_private" ? { kind: "all_private" } : null;
    if (fact === null) continue;
    const written = writeOwnership(ctx, f, fact);
    if (written !== null) return written;
  }
  return null;
}

/**
 * §6.4 — the facts against, read off the invoice's own deductions: the entries for a deducted ownership type or
 * for the owner count, largest applied deduction first, ties in UNFAVOURABLE_TIE_ORDER. `zero_km_leasing` is
 * skipped ALWAYS — a zero-km deal is never a tag against a car. `owners:{n}` becomes the `hand_up` fact with the
 * car's own registry hand.
 */
function unfavourableOwnership(ctx: SearchContext, f: CarFacts): Fragment | null {
  const entries: { fact: OwnershipFact; applied: number; tie: number }[] = [];
  for (const d of f.deductions) {
    if (d.for === "zero_km_leasing") continue;
    // Only a deduction is a fact against the car; the owner-count entry is a BONUS when it is positive
    // (scoring/history.ts:139-145), and a bonus has no place in this ladder.
    if (d.applied >= 0) continue;
    if (d.for === "rental" || d.for === "leasing" || d.for === "company") {
      entries.push({ fact: { kind: "was_type", type: d.for }, applied: d.applied, tie: UNFAVOURABLE_TIE_ORDER.indexOf(d.for) });
    } else if (/^owners:\d+$/.test(d.for)) {
      if (f.hand === null) continue; // no registry hand, so no "hand h and up" fact to write
      entries.push({ fact: { kind: "hand_up", h: f.hand }, applied: d.applied, tie: UNFAVOURABLE_TIE_ORDER.indexOf("hand_up") });
    }
  }
  entries.sort((a, b) => Math.abs(b.applied) - Math.abs(a.applied) || a.tie - b.tie);
  for (const e of entries) {
    const written = writeOwnership(ctx, f, e.fact);
    if (written !== null) return written;
  }
  return null;
}

/** The ladder in the direction the sign asks for. */
function ownershipLadder(ctx: SearchContext, f: CarFacts, favourable: boolean): Fragment | null {
  return favourable ? favourableOwnership(ctx, f) : unfavourableOwnership(ctx, f);
}

// --- the other two writers ------------------------------------------------------------------------------------

function priceFragment(car: JustificationCar, f: CarFacts): Fragment | null {
  const sentence = priceExpression(f.deal_score, car.median_price);
  if (sentence === null || f.deal_score === null || car.median_price === null) return null;
  return { sentence, values: { ils: priceValueIls(f.deal_score, car.median_price) } };
}

function kmFragment(car: JustificationCar, f: CarFacts): Fragment | null {
  const written = kmSentence(f, car.listing_id);
  if (written === null) return null;
  return { sentence: written.sentence, values: { km: written.km } };
}

/** The component's own fact, written — the one place that maps a component name to a writer. */
function componentFragment(ctx: SearchContext, car: JustificationCar, f: CarFacts, name: ComponentName, favourable: boolean): Fragment | null {
  if (name === "price") return priceFragment(car, f);
  if (name === "km") return kmFragment(car, f);
  return ownershipLadder(ctx, f, favourable);
}

const FAMILY: Readonly<Record<ComponentName, FactFamily>> = { price: "price", ownership: "ownership", km: "km" };

// --- §6 the sentence ------------------------------------------------------------------------------------------

/** 'YYYY-MM-DD' -> the month without a leading zero, and the year. */
function cancelledMonthYear(iso: string, listing_id: number): { month: number; year: number } {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  if (!m) throw new Error(`justification: listing ${listing_id} — cancelled_at ${JSON.stringify(iso)} is not 'YYYY-MM-DD'`);
  return { month: Number(m[2]), year: Number(m[1]) };
}

/** §6 (1) — a rule stopped the car, or null when none did. */
function ruleSentence(ctx: SearchContext, car: JustificationCar, f: CarFacts): Written | null {
  const cancelledRule = ruleTriggered(car, "cancelled");
  if (cancelledRule !== isCancelled(car.invoice)) {
    throw new Error(
      `justification: listing ${car.listing_id} — the cancelled rule record says ${cancelledRule} but the invoice says ${isCancelled(car.invoice)}`,
    );
  }
  if (cancelledRule) {
    if (f.cancelled_at === null) throw new Error(`justification: listing ${car.listing_id} — a cancelled invoice with no cancelled_at`);
    const { month, year } = cancelledMonthYear(f.cancelled_at, car.listing_id);
    return { kind: "rule_cancelled", fact: "date", sentence: RULE.cancelled(month, year), values: {} };
  }
  // A rule applies to every car it applies to — a thin cell included.
  if (ruleTriggered(car, "unverified_history")) return { kind: "rule_no_history", fact: "ownership", sentence: RULE.no_history, values: {} };
  // The floor speaks only where it is worth saying something: a car the search kept BELOW the cheapest pick's
  // price. Anywhere else — and on an uncrowned screen — such a car falls through to case (3).
  if (ruleTriggered(car, "condition_floor") && cheaperThanCheapest(ctx, car)) {
    // What stopped it: the more negative of the two condition components, ties to ownership.
    const candidates: ComponentName[] = [];
    const own = f.ownership_effect;
    const kmE = f.km_effect;
    const ownFirst = own !== null && (kmE === null || own <= kmE);
    for (const name of ownFirst ? (["ownership", "km"] as const) : (["km", "ownership"] as const)) {
      const v = name === "ownership" ? own : kmE;
      if (v !== null && v < 0) candidates.push(name);
    }
    for (const name of candidates) {
      const written = componentFragment(ctx, car, f, name, false);
      if (written !== null) return { kind: "rule_floor", fact: FAMILY[name], sentence: written.sentence, values: written.values };
    }
    // Neither is writable: the tag is kept and the row says nothing more (the kind is still the floor's).
    return { kind: "rule_floor", fact: null, sentence: "", values: {} };
  }
  return null;
}

/**
 * §6 (2) — a pick's reason: the first label in CATEGORY_PRIORITY order, for a double or triple winner too. A
 * pick is exempt from JUSTIFICATION_MIN_EFFECT_PCT and never carries a sentence against it.
 */
function pickReason(ctx: SearchContext, car: JustificationCar, f: CarFacts): Written {
  const label = CATEGORY_PRIORITY.find((c: Category) => car.categories.includes(c));
  const favourable = (ownEffect: number | null): Written => {
    // The one that contributed more speaks first; if it has no writable form the other is tried. A component
    // that is not positive is never a reason.
    const cands: { name: ComponentName; v: number }[] = [];
    if (ownEffect !== null && ownEffect > 0) cands.push({ name: "ownership", v: ownEffect });
    if (f.km_effect !== null && f.km_effect > 0) cands.push({ name: "km", v: f.km_effect });
    cands.sort((a, b) => b.v - a.v || COMPONENT_ORDER.indexOf(a.name) - COMPONENT_ORDER.indexOf(b.name));
    for (const c of cands) {
      const written = componentFragment(ctx, car, f, c.name, true);
      if (written !== null) return { kind: "pick_reason", fact: FAMILY[c.name], sentence: written.sentence, values: written.values };
    }
    return EMPTY;
  };
  const price = (): Written | null => {
    const written = priceFragment(car, f);
    return written === null ? null : { kind: "pick_reason", fact: "price", sentence: written.sentence, values: written.values };
  };
  if (label === "best_value") return price() ?? EMPTY; // even when the amount rounds to 0 and it reads PRICE.at
  if (label === "peace_of_mind") return favourable(f.ownership_effect_reality); // the category ranks by condition_by_reality
  // cheapest: the price, but only when the price is in its favour; else the ladder, whose last step is open and
  // empty by decision.
  if (f.deal_score !== null && f.deal_score > PRICE_ABOUT_EQUAL_BAND_PCT) {
    const written = price();
    if (written !== null) return written;
  }
  return favourable(f.ownership_effect);
}

/** The thin cell: no price comparison, so never a price. An ownership tag, else the lowest km, else nothing. */
function thinCellSentence(ctx: SearchContext, car: JustificationCar, f: CarFacts): Written {
  const ownership = unfavourableOwnership(ctx, f) ?? favourableOwnership(ctx, f);
  if (ownership !== null) return { kind: "no_price_ownership", fact: "ownership", sentence: ownership.sentence, values: ownership.values };
  if (lowestKm(ctx, car)) return { kind: "no_price_km", fact: "km", sentence: LOWEST_KM(ctx.scope), values: {} };
  return EMPTY;
}

/** §6 (3) — the component that decided the score the most, in the direction its sign gives. */
function maxEffectSentence(ctx: SearchContext, car: JustificationCar, f: CarFacts): Written {
  const best = largestComponent({ price: f.price_advantage, ownership: f.ownership_effect, km: f.km_effect });
  if (best === null || Math.abs(best.value) < JUSTIFICATION_MIN_EFFECT_PCT) return EMPTY;
  const written = componentFragment(ctx, car, f, best.name, best.value > 0);
  if (written === null) return EMPTY;
  return { kind: "max_effect", fact: FAMILY[best.name], sentence: written.sentence, values: written.values };
}

function sentenceOf(ctx: SearchContext, car: JustificationCar, f: CarFacts): Written {
  const rule = ruleSentence(ctx, car, f);
  if (rule !== null) return rule;
  if (ctx.search.crowned && car.categories.length > 0) return pickReason(ctx, car, f);
  if (f.thin_cell) return thinCellSentence(ctx, car, f);
  return maxEffectSentence(ctx, car, f);
}

// --- §6.6 the car page ----------------------------------------------------------------------------------------

function whyLines(ctx: SearchContext, car: JustificationCar, f: CarFacts, written: Written): string[] {
  if (f.thin_cell) return []; // a car with no price comparison gets no section at all
  const lines: string[] = [];
  // The section NEVER repeats the number under the price, so a sentence whose fact is the price gives no first
  // line — a best_value pick, a cheapest pick whose reason is the price, and a ranked car whose list sentence is
  // the price expression all start with their extra facts. An empty sentence gives no first line either.
  if (written.sentence !== "" && written.fact !== "price") lines.push(written.sentence);
  if (f.cancelled) return lines; // no rows to read: no extra facts
  const extras: { name: ComponentName; v: number }[] = [];
  // Eran, 28/09 (section B): on a car whose labels include "peace_of_mind" the further facts are judged by the
  // reality reading, like the category and the first line (index.ts:245); every other car by the ordinary
  // reading. (BRIEF §1.1 writes this line's two names in Hebrew; Run 2 §3 lets no Hebrew letter into this file,
  // not even in a comment — wordings.test.ts:103-114 — so they stand here as the codes they are.)
  const own = car.categories.includes("peace_of_mind") ? f.ownership_effect_reality : f.ownership_effect;
  if (own !== null && f.verified) extras.push({ name: "ownership", v: own });
  if (f.km_effect !== null) extras.push({ name: "km", v: f.km_effect });
  const ordered = extras
    .filter((e) => Math.abs(e.v) >= JUSTIFICATION_MIN_EFFECT_PCT && FAMILY[e.name] !== written.fact)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v) || COMPONENT_ORDER.indexOf(a.name) - COMPONENT_ORDER.indexOf(b.name));
  for (const e of ordered) {
    if (lines.length >= (written.sentence !== "" && written.fact !== "price" ? 1 : 0) + WHY_EXTRA_FACTS_MAX) break;
    const fragment = componentFragment(ctx, car, f, e.name, e.v > 0);
    if (fragment !== null) lines.push(fragment.sentence);
  }
  return lines;
}

function pageOf(ctx: SearchContext, car: JustificationCar, f: CarFacts, written: Written): CarJustification["page"] {
  return {
    price_line: f.cancelled || f.thin_cell ? null : priceExpression(f.deal_score, car.median_price),
    why_lines: whyLines(ctx, car, f, written),
  };
}

// --- §6.7 the runner-up's fact --------------------------------------------------------------------------------

function runnerUpFact(ctx: SearchContext): string | null {
  if (!ctx.search.crowned || ctx.search.runner_up === null || ctx.cheapest === null) return null;
  const runnerUp = ctx.cars.find((c) => c.listing_id === ctx.search.runner_up);
  if (runnerUp === undefined) return null;
  const r = factsOf(ctx, runnerUp);
  const c = factsOf(ctx, ctx.cheapest);
  if (r.deal_score === null || c.deal_score === null) return null;
  const gap = r.deal_score - c.deal_score;
  const diff = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b);
  const parts: Readonly<Record<ComponentName, number | null>> = {
    price: diff(r.price_advantage, c.price_advantage),
    ownership: diff(r.ownership_effect, c.ownership_effect),
    km: diff(r.km_effect, c.km_effect),
  };
  let best: { name: ComponentName; v: number } | null = null;
  for (const name of COMPONENT_ORDER) {
    const v = parts[name];
    if (v === null || v <= 0) continue;
    if (best === null || v > best.v) best = { name, v };
  }
  // "The fact that explains most of the gap": more than half of it, or the bar shows the amount and the
  // identification alone, as today.
  if (best === null || best.v <= gap / 2) return null;
  const fragment = componentFragment(ctx, runnerUp, r, best.name, true);
  return fragment === null ? null : fragment.sentence;
}

// --- §6 justify() ---------------------------------------------------------------------------------------------

export function justify(search: JustificationSearch): JustificationOutput {
  const ctx = buildContext(search);
  const cars: CarJustification[] = ctx.cars.map((car) => {
    const f = factsOf(ctx, car);
    const written = sentenceOf(ctx, car, f);
    return {
      listing_id: car.listing_id,
      kind: written.kind,
      fact: written.fact,
      sentence: written.sentence,
      tag: cheaperThanCheapest(ctx, car) ? TAG_CHEAPER_THAN_CHEAPEST : "",
      values: written.values,
      page: pageOf(ctx, car, f, written),
    };
  });
  return { generator_version: JUSTIFICATION_GENERATOR_VERSION, cars, runner_up_fact: runnerUpFact(ctx) };
}

// --- §8 the self-check ----------------------------------------------------------------------------------------

/**
 * §8 — what the generator says about its own output. PURE: it returns findings and throws nothing, so a finding
 * never costs a search its sentences. Run 5 decides what the site does with one.
 *
 * Determinism is a test, not a check (§9): a check cannot see a second run.
 */
export function checkOutput(search: JustificationSearch, output: JustificationOutput): Finding[] {
  const findings: Finding[] = [];
  const isPick = new Map<number, boolean>();
  for (const car of search.cars) isPick.set(car.listing_id, car.categories.length > 0);

  // forbidden_word — anywhere a reader can see it
  for (const car of output.cars) {
    const texts: string[] = [car.sentence, car.tag, ...(car.page.price_line === null ? [] : [car.page.price_line]), ...car.page.why_lines];
    for (const word of FORBIDDEN_WORDS) {
      for (const text of texts) {
        if (text.includes(word)) findings.push({ check: "forbidden_word", listing_id: car.listing_id, detail: `${JSON.stringify(word)} in ${JSON.stringify(text)}` });
      }
    }
  }
  if (output.runner_up_fact !== null) {
    for (const word of FORBIDDEN_WORDS) {
      if (output.runner_up_fact.includes(word)) {
        findings.push({ check: "forbidden_word", listing_id: null, detail: `${JSON.stringify(word)} in the runner-up fact ${JSON.stringify(output.runner_up_fact)}` });
      }
    }
  }

  // too_long — the tag is not counted against the sentence; the bar's amount is not counted against the fact
  for (const car of output.cars) {
    if (car.sentence.length > SENTENCE_MAX_CHARS) {
      findings.push({ check: "too_long", listing_id: car.listing_id, detail: `${car.sentence.length} chars > ${SENTENCE_MAX_CHARS}: ${JSON.stringify(car.sentence)}` });
    }
  }
  if (output.runner_up_fact !== null && output.runner_up_fact.length > RUNNER_UP_FACT_MAX_CHARS) {
    findings.push({
      check: "too_long",
      listing_id: null,
      detail: `the runner-up fact is ${output.runner_up_fact.length} chars > ${RUNNER_UP_FACT_MAX_CHARS}: ${JSON.stringify(output.runner_up_fact)}`,
    });
  }

  // pick_against — a label is a promise: a pick says why it won, or says nothing, and never wears the tag
  for (const car of output.cars) {
    if (isPick.get(car.listing_id) !== true) continue;
    if (car.kind !== "pick_reason" && car.kind !== "empty") {
      findings.push({ check: "pick_against", listing_id: car.listing_id, detail: `a pick whose kind is ${car.kind}` });
    }
    if (car.tag !== "") findings.push({ check: "pick_against", listing_id: car.listing_id, detail: "a pick carrying the tag" });
  }

  // one_sentence
  for (const car of output.cars) {
    if (car.sentence.includes("\n")) findings.push({ check: "one_sentence", listing_id: car.listing_id, detail: `a newline in ${JSON.stringify(car.sentence)}` });
  }

  const spoken = output.cars.filter((c) => c.sentence !== "");

  // identical_for_all — a pool where every car that speaks says the same thing (a pre-2017 pool reading
  // RULE.no_history is such a case). The library does not suppress it: the finding IS the signal.
  if (spoken.length >= 2 && spoken.every((c) => c.sentence === spoken[0].sentence)) {
    findings.push({ check: "identical_for_all", listing_id: null, detail: `all ${spoken.length} sentences are ${JSON.stringify(spoken[0].sentence)}` });
  }

  // repeated_sentence — one sentence over its share of the cars that speak
  if (spoken.length >= 4) {
    const counts = new Map<string, number>();
    for (const c of spoken) counts.set(c.sentence, (counts.get(c.sentence) ?? 0) + 1);
    for (const [sentence, count] of counts) {
      if ((count / spoken.length) * 100 > SENTENCE_REPEAT_MAX_SHARE_PCT) {
        findings.push({
          check: "repeated_sentence",
          listing_id: null,
          detail: `${JSON.stringify(sentence)} on ${count} of ${spoken.length} cars with a sentence`,
        });
      }
    }
  }

  // tag_on_uncrowned — nothing was crowned, so nothing can be cheaper than the pick and there is no bar
  if (!search.crowned) {
    for (const car of output.cars) {
      if (car.tag !== "") findings.push({ check: "tag_on_uncrowned", listing_id: car.listing_id, detail: "a tag on an uncrowned search" });
    }
    if (output.runner_up_fact !== null) {
      findings.push({ check: "tag_on_uncrowned", listing_id: null, detail: "a runner-up fact on an uncrowned search" });
    }
  }

  return findings;
}
