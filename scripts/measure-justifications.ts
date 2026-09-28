// scripts/measure-justifications.ts
// THE MEASURING TOOL of the justification generator (BRIEF Days 22–23, Run 3, §3–§4).
//
// READ-ONLY BY CONSTRUCTION: there is no --write flag, no Prisma mutation is imported, no transaction is
// opened. It reads the LIVE POOL only (liveModels(), assemblePool()) — no `searches`, no `search_results` — and
// writes one text file.
//
// One command, no arguments: `npx tsx scripts/measure-justifications.ts`.
//
// WHAT IT IS FOR (Eran, 28/09): the sentences themselves are judged on the site, after the wiring. So this tool
// PRINTS NO SCREENS. It measures, over many searches it runs by itself, what no single screen can show — how
// often each sentence kind fires, how often a sentence repeats, how long the longest one is — and it points at
// WHERE TO LOOK on the site: the model, the displayed place and the plate of the cars worth opening.
//
// THE SWEEP (§3.1): per live model, one search per DISTINCT price in its pool, ascending — each price is a
// ceiling that changes the cut, and the price field is free input (FilterPanel.tsx:263-285), so no other list of
// ceilings exists — plus one search with no filter at all.
//
// NOTHING IS RESTATED. Every number comes from an exported function of the module that owns it: the pipeline is
// the replay's sequence (scripts/replay-questions.ts:133-160), the places are src/lib/search/places.ts's, the
// facts are the generator's, and the invoice is read the library's own way. The only judgement this file makes
// is which of those numbers to count.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { ENGINE_VERSION, HAND_CHECK_KINDS } from "@/lib/scoring/constants";
import { isCancelled, type Check } from "@/lib/scoring/types";
import { assemblePool, PoolAssemblyError, type PoolItem } from "@/lib/search/assemble";
import { passes, type SearchFilters } from "@/lib/search/filters";
import { LIST_CARDS } from "@/lib/search/list";
import { liveModels } from "@/lib/search/models";
import { classifyRow, displayedPlaces, type PlaceRow } from "@/lib/search/places";
import { CATEGORY_PRIORITY, RULES_VERSION, selectThree, type Category, type SelectionResult } from "@/lib/selection";
import { invoiceRow } from "@/lib/selection/util";
import { CATEGORY_LABEL, num } from "@/lib/display/texts";
import {
  carFacts,
  carsFromSelection,
  checkOutput,
  crownedOf,
  justify,
  kmSentence,
  priceExpression,
  JUSTIFICATION_GENERATOR_VERSION,
  RULE,
  RUNNER_UP_FACT_MAX_CHARS,
  SENTENCE_MAX_CHARS,
  SENTENCE_REPEAT_MAX_SHARE_PCT,
  TAG_CHEAPER_THAN_CHEAPEST,
  type CarJustification,
  type JustificationCar,
  type JustificationSearch,
  type SentenceKind,
} from "@/lib/justification";

// The tool's own constant — not a ledger line, like RUNNER_UP_TUNING_WINDOW_PCT in scripts/select-three.ts:95.
const REPORT_FILE = "REPORT-measure-justifications.md";

// ---------- the report, as blocks ----------
// A block's HEAD is the one line the terminal prints for that count (§4.4); the file gets the whole block.

type Block = { head: string; lines: string[] };
const block = (head: string, lines: string[] = []): Block => ({ head, lines });

// ---------- the one repeated join ----------

/**
 * THE ONE JOIN src/components/list/SentenceLine.tsx:30-35 owns — the tag, " · ", the sentence. It is a JSX
 * fragment there and cannot be imported, so it is repeated HERE, and here only, to measure the line a reader
 * actually sees. If that component's join changes, this line changes with it.
 */
const taggedLine = (c: CarJustification): string => (c.tag === "" ? c.sentence : `${c.tag} · ${c.sentence}`);

// ---------- one search, measured ----------

/** Where a shown car sits on the screen (§3.1). The first three are classifyRow()'s own names. */
type PositionClass = "pick" | "cancelled" | "no_price" | "cards" | "list";
const POSITION_LABEL: Readonly<Record<PositionClass, string>> = {
  pick: "כרטיס המלצה",
  cancelled: "קבוצת המבוטלים",
  no_price: "קבוצת ללא השוואת מחיר",
  cards: "שלושת כרטיסי הרשימה",
  list: "המשך הרשימה המדורגת",
};

type FactKey = "price" | "ownership" | "km" | "empty";
const FACT_KEYS: readonly FactKey[] = ["price", "ownership", "km", "empty"];
const FACT_LABEL: Readonly<Record<FactKey, string>> = { price: "מחיר", ownership: "בעלויות", km: 'ק"מ', empty: "ריק" };

type Longest = { text: string; chars: number; where: string };

type Measured = {
  where: string;
  cut: number;
  crowned: boolean;
  with_comparison: number;
  cars: CarJustification[];
  input: readonly JustificationCar[];
  position: Map<number, PositionClass>;
  places: Map<number, number | null>;
  search: JustificationSearch;
  runner_up_fact: string | null;
  runner_up_family: FactKey | null;
  blocked_first: boolean;
  cheaper_offender: string | null;
  findings: { check: string; detail: string }[];
};

/** §3.1 — one search of the sweep, from the cut to the findings. */
function measure(model: string, ceiling: number | null, items: readonly PoolItem[]): Measured {
  const where = `${model} · ${ceiling === null ? "בלי סינון" : num(ceiling)}`;
  const filters: SearchFilters = ceiling === null ? {} : { priceMax: ceiling };
  const cut = items.filter((p) => passes(p, filters));
  const res = selectThree({ listings: cut.map((p) => p.candidate) });
  const cars = carsFromSelection(cut, res);
  const search: JustificationSearch = {
    crowned: crownedOf(res),
    runner_up: res.runner_ups.cheapest?.listing_id ?? null,
    has_price_ceiling: filters.priceMax !== undefined,
    cars,
  };
  const out = justify(search);
  const findings = checkOutput(search, out);

  const byId = new Map(cut.map((p) => [p.listing_id, p]));
  const itemOf = (listing_id: number): PoolItem => {
    const p = byId.get(listing_id);
    if (p === undefined) throw new Error(`listing ${listing_id} is in the selection's results but not in the cut it was built from`);
    return p;
  };

  return {
    where,
    cut: cut.length,
    crowned: search.crowned,
    with_comparison: res.crowning.with_comparison,
    cars: out.cars,
    input: cars,
    ...positions(res, itemOf),
    search,
    runner_up_fact: out.runner_up_fact,
    runner_up_family: out.runner_up_fact === null ? null : familyOf(out.runner_up_fact, cars, search.runner_up),
    blocked_first: blockedFirstRecorded(res),
    cheaper_offender: cheaperOffender(res, itemOf, where),
    findings: findings.map((f) => ({ check: f.check, detail: f.detail })),
  };
}

/** §3.1 — the displayed place of every shown car, and the class of position it falls in. */
function positions(res: SelectionResult, itemOf: (id: number) => PoolItem): { position: Map<number, PositionClass>; places: Map<number, number | null> } {
  const rows: PlaceRow[] = res.results.map((r) => ({
    listing_id: r.listing_id,
    rank: r.rank,
    recommendation_categories: r.categories,
    total_score: itemOf(r.listing_id).score,
    stage_b_trace: r.trace as unknown as PlaceRow["stage_b_trace"],
  }));
  const places = displayedPlaces(rows);
  const position = new Map<number, PositionClass>();
  const ranked: { listing_id: number; place: number }[] = [];
  for (const row of rows) {
    const kind = classifyRow(row);
    if (kind === "hidden") continue;
    if (kind === "ranked") {
      const place = places.get(row.listing_id);
      if (typeof place !== "number") throw new Error(`listing ${row.listing_id}: a ranked row with no displayed place`);
      ranked.push({ listing_id: row.listing_id, place });
      continue;
    }
    position.set(row.listing_id, kind);
  }
  // The list's own first LIST_CARDS places are the "מקום 4–6" cards; everything after them is the table.
  ranked.sort((a, b) => a.place - b.place);
  ranked.forEach((r, i) => position.set(r.listing_id, i < LIST_CARDS ? "cards" : "list"));
  return { position, places };
}

/**
 * §3.2 — the family behind the bar's fact, READ BACK from the library's own writers: the fact is the price
 * expression, or the km sentence, or (neither) an ownership form. Nothing of the ladder is restated — the two
 * texts are asked of the functions that produce them and compared.
 */
function familyOf(fact: string, cars: readonly JustificationCar[], runner_up: number | null): FactKey {
  const car = cars.find((c) => c.listing_id === runner_up);
  if (car === undefined) throw new Error(`the runner-up ${String(runner_up)} carries a fact but is not one of the search's cars`);
  const f = carFacts(car);
  if (fact === priceExpression(f.deal_score, car.median_price)) return "price";
  if (fact === kmSentence(f, car.listing_id)?.sentence) return "km";
  return "ownership";
}

/**
 * §3.2 — the searches in which the condition floor stopped the first in order. THE READING (found by
 * `git --no-pager grep -n "blocked_first" -- src/lib/selection`): src/lib/selection/picks.ts:116-117 writes
 * `blocked_first: [category, ...]` into the CONTEXT of that listing's `condition_floor` rule record. So a
 * search carries the case when any result has a condition_floor record whose context.blocked_first is a
 * non-empty array.
 */
function blockedFirstRecorded(res: SelectionResult): boolean {
  return res.results.some((r) =>
    r.trace.some((t) => {
      if (t.rule !== "condition_floor") return false;
      const v = t.context.blocked_first;
      return Array.isArray(v) && v.length > 0;
    }),
  );
}

/** §3.2 — "המשתלם ביותר" priced below "הכי חסכוני": must never happen. */
function cheaperOffender(res: SelectionResult, itemOf: (id: number) => PoolItem, where: string): string | null {
  const bv = res.picks.best_value;
  const ch = res.picks.cheapest;
  if (bv === null || ch === null) return null;
  const pbv = itemOf(bv).price;
  const pch = itemOf(ch).price;
  if (pbv >= pch) return null;
  return `${where} · המשתלם ${num(pbv)} · החסכוני ${num(pch)}`;
}

// ---------- the counts (§3.2) ----------

type Tally = {
  searches: number;
  crowned: number;
  uncrowned: number;
  zero_scored: number;
  zero_results: number;
  shown: number;
  kinds: Map<SentenceKind, number>;
  pick_family: Map<Category, Map<string, number>>;
  multi_category: number;
  empty_by_position: Map<PositionClass, number>;
  repeat_share_max: number;
  repeat_over: number;
  sentences: Map<string, number>;
  no_history_multi: number;
  no_history_max: number;
  longest_sentence: Longest | null;
  longest_tagged: Longest | null;
  longest_fact: Longest | null;
  tags: number;
  tags_max: number;
  with_runner_up: number;
  fact_written: number;
  fact_null: number;
  fact_family: Map<FactKey, number>;
  offenders: string[];
  blocked_first: number;
  findings: Map<string, number>;
  finding_details: Map<string, number>;
};

function newTally(): Tally {
  return {
    searches: 0,
    crowned: 0,
    uncrowned: 0,
    zero_scored: 0,
    zero_results: 0,
    shown: 0,
    kinds: new Map(),
    pick_family: new Map(CATEGORY_PRIORITY.map((c) => [c, new Map<string, number>()])),
    multi_category: 0,
    empty_by_position: new Map(),
    repeat_share_max: 0,
    repeat_over: 0,
    sentences: new Map(),
    no_history_multi: 0,
    no_history_max: 0,
    longest_sentence: null,
    longest_tagged: null,
    longest_fact: null,
    tags: 0,
    tags_max: 0,
    with_runner_up: 0,
    fact_written: 0,
    fact_null: 0,
    fact_family: new Map(),
    offenders: [],
    blocked_first: 0,
    findings: new Map(),
    finding_details: new Map(),
  };
}

const bump = <K,>(m: Map<K, number>, k: K, by = 1): void => void m.set(k, (m.get(k) ?? 0) + by);
const longer = (a: Longest | null, b: Longest): Longest => (a === null || b.chars > a.chars ? b : a);

/** Everything one measured search adds to a tally. Called once per tally a search belongs to. */
function add(t: Tally, m: Measured): void {
  t.searches += 1;
  if (m.cut === 0) t.zero_results += 1;
  else if (m.crowned) t.crowned += 1;
  else if (m.with_comparison === 0) t.zero_scored += 1;
  else t.uncrowned += 1;

  t.shown += m.cars.length;
  const categoriesOf = new Map(m.input.map((c) => [c.listing_id, c.categories]));

  let tagsHere = 0;
  let noHistoryHere = 0;
  const here = new Map<string, number>();
  for (const c of m.cars) {
    bump(t.kinds, c.kind);
    const cats = categoriesOf.get(c.listing_id) ?? [];
    if (cats.length > 1) t.multi_category += 1;
    for (const cat of cats) bump(t.pick_family.get(cat) as Map<string, number>, c.fact ?? "empty");

    const pos = m.position.get(c.listing_id);
    if (pos === undefined) throw new Error(`listing ${c.listing_id}: an output row with no position on the screen`);
    if (c.sentence === "") bump(t.empty_by_position, pos);
    else {
      bump(t.sentences, c.sentence);
      bump(here, c.sentence);
      t.longest_sentence = longer(t.longest_sentence, { text: c.sentence, chars: c.sentence.length, where: m.where });
      const line = taggedLine(c);
      t.longest_tagged = longer(t.longest_tagged, { text: line, chars: line.length, where: m.where });
    }
    if (c.sentence === RULE.no_history) noHistoryHere += 1;
    if (c.tag === TAG_CHEAPER_THAN_CHEAPEST) tagsHere += 1;
  }

  t.tags += tagsHere;
  if (tagsHere > t.tags_max) t.tags_max = tagsHere;
  if (noHistoryHere > 1) t.no_history_multi += 1;
  if (noHistoryHere > t.no_history_max) t.no_history_max = noHistoryHere;

  // §3.2 — the largest share of the search's SHOWN cars that carry one identical sentence.
  if (m.cars.length > 0 && here.size > 0) {
    const top = Math.max(...here.values());
    const share = (top / m.cars.length) * 100;
    if (share > t.repeat_share_max) t.repeat_share_max = share;
    if (share > SENTENCE_REPEAT_MAX_SHARE_PCT) t.repeat_over += 1;
  }

  if (m.search.runner_up !== null) {
    t.with_runner_up += 1;
    if (m.runner_up_fact === null) t.fact_null += 1;
    else {
      t.fact_written += 1;
      bump(t.fact_family, m.runner_up_family as FactKey);
      t.longest_fact = longer(t.longest_fact, { text: m.runner_up_fact, chars: m.runner_up_fact.length, where: m.where });
    }
  }

  if (m.cheaper_offender !== null) t.offenders.push(m.cheaper_offender);
  if (m.blocked_first) t.blocked_first += 1;
  for (const f of m.findings) {
    bump(t.findings, f.check);
    if (f.check === "repeated_sentence" || f.check === "identical_for_all") bump(t.finding_details, f.detail);
  }
}

// ---------- חלק א, written ----------

const pct = (v: number): string => num(Math.round(v * 10) / 10);
const topOf = (m: Map<string, number>, n: number): [string, number][] =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

function countBlocks(t: Tally): Block[] {
  const blocks: Block[] = [];

  blocks.push(
    block(`חיפושים שרצו: ${num(t.searches)}`, [
      `מתוכם מוכתרים: ${num(t.crowned)}`,
      `מתוכם לא מוכתרים: ${num(t.uncrowned)}`,
      `מתוכם בלי אף ציון עסקה: ${num(t.zero_scored)}`,
      `מתוכם בלי אף תוצאה: ${num(t.zero_results)}`,
      `רכבים מוצגים בסך הכול: ${num(t.shown)}`,
    ]),
  );

  const kinds = [...t.kinds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  blocks.push(
    block(
      `סוגי משפטים שנכתבו: ${num(kinds.length)}`,
      kinds.map(([k, n]) => `משפט מסוג ${k} על ${num(n)} רכבים מוצגים`),
    ),
  );

  const table: string[] = [
    `| קטגוריה | ${FACT_KEYS.map((k) => FACT_LABEL[k]).join(" | ")} |`,
    `| --- | ${FACT_KEYS.map(() => "---").join(" | ")} |`,
  ];
  const strays: string[] = [];
  for (const cat of CATEGORY_PRIORITY) {
    const row = t.pick_family.get(cat) as Map<string, number>;
    table.push(`| ${CATEGORY_LABEL[cat]} | ${FACT_KEYS.map((k) => num(row.get(k) ?? 0)).join(" | ")} |`);
    for (const [key, n] of row) if (!(FACT_KEYS as readonly string[]).includes(key)) strays.push(`עובדה מחוץ לטבלה בקטגוריה ${CATEGORY_LABEL[cat]}: ${key} על ${num(n)} רכבים`);
  }
  const cheapest = t.pick_family.get("cheapest") as Map<string, number>;
  blocks.push(
    block("טבלת נימוקי הזוכים לפי משפחת העובדה:", [
      ...table,
      ...strays,
      `רכבים שזכו ביותר מקטגוריה אחת, ונספרו בכל אחת מהן עם המשפט האחד שקיבלו: ${num(t.multi_category)}`,
      `סולם "${CATEGORY_LABEL.cheapest}" — שלב המחיר נענה ${num(cheapest.get("price") ?? 0)} פעמים`,
      `סולם "${CATEGORY_LABEL.cheapest}" — שלב הבעלויות נענה ${num(cheapest.get("ownership") ?? 0)} פעמים`,
      `סולם "${CATEGORY_LABEL.cheapest}" — שלב הק"מ נענה ${num(cheapest.get("km") ?? 0)} פעמים`,
      `סולם "${CATEGORY_LABEL.cheapest}" — השלב האחרון, הריק, נענה ${num(cheapest.get("empty") ?? 0)} פעמים`,
    ]),
  );

  const empties = [...t.empty_by_position.entries()].sort((a, b) => b[1] - a[1]);
  const emptyTotal = empties.reduce((s, [, n]) => s + n, 0);
  blocks.push(
    block(
      `משפט ריק על ${num(emptyTotal)} רכבים מתוך ${num(t.shown)} מוצגים`,
      empties.map(([p, n]) => `משפט ריק ב${POSITION_LABEL[p]} על ${num(n)} רכבים`),
    ),
  );

  blocks.push(
    block(`חזרתיות — השיעור הגבוה ביותר של משפט זהה אחד מבין הרכבים המוצגים בחיפוש: ${pct(t.repeat_share_max)} אחוזים`, [
      `חיפושים שבהם השיעור הזה עובר את הסף ${num(SENTENCE_REPEAT_MAX_SHARE_PCT)}: ${num(t.repeat_over)}`,
      `חיפושים שבהם המשפט "${RULE.no_history}" מופיע על יותר מרכב אחד: ${num(t.no_history_multi)}`,
      `המספר הגדול ביותר של רכבים על מסך אחד עם המשפט הזה: ${num(t.no_history_max)}`,
      "עשרת המשפטים החוזרים ביותר, ככתבם:",
      ...topOf(t.sentences, 10).map(([s, n], i) => `מקום ${num(i + 1)} — "${s}" — ${num(n)} פעמים`),
    ]),
  );

  const longestLines: string[] = [];
  const longLine = (word: string, l: Longest | null, limit: number): string =>
    l === null ? `${word}: לא נכתב אף אחד` : `${word}: "${l.text}" — ${num(l.chars)} תווים מול תקרה של ${num(limit)}, מתוך ${l.where}`;
  longestLines.push(longLine("השורה המתויגת הארוכה ביותר (תג · משפט)", t.longest_tagged, SENTENCE_MAX_CHARS));
  longestLines.push(longLine("עובדת הרנר-אפ הארוכה ביותר", t.longest_fact, RUNNER_UP_FACT_MAX_CHARS));
  blocks.push(block(longLine("המשפט הארוך ביותר", t.longest_sentence, SENTENCE_MAX_CHARS), longestLines));

  blocks.push(
    block(`רכבים הנושאים את התג "${TAG_CHEAPER_THAN_CHEAPEST}": ${num(t.tags)}`, [
      `המספר הגדול ביותר של רכבים עם התג על מסך אחד: ${num(t.tags_max)}`,
    ]),
  );

  blocks.push(
    block(`חיפושים שיש בהם רנר-אפ: ${num(t.with_runner_up)}`, [
      `מתוכם עם עובדה כתובה על הפס: ${num(t.fact_written)}`,
      `מתוכם בלי עובדה — אין עובדה אחת שמסבירה את רוב הפער: ${num(t.fact_null)}`,
      ...FACT_KEYS.filter((k) => k !== "empty").map((k) => `עובדות כתובות ממשפחת ${FACT_LABEL[k]}: ${num(t.fact_family.get(k) ?? 0)}`),
    ]),
  );

  blocks.push(
    block(`חיפושים שבהם "${CATEGORY_LABEL.best_value}" זול מ"${CATEGORY_LABEL.cheapest}": ${num(t.offenders.length)}`, t.offenders.map((o) => `חריגה: ${o}`)),
  );

  blocks.push(block(`חיפושים שבהם רצפת המצב עצרה את הראשון בתור (blocked_first על חוק condition_floor): ${num(t.blocked_first)}`));

  const findings = [...t.findings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = findings.reduce((s, [, n]) => s + n, 0);
  blocks.push(
    block(`ממצאי הבדיקה העצמית: ${num(total)}`, [
      ...findings.map(([c, n]) => `ממצא ${c}: ${num(n)} פעמים`),
      ...(t.finding_details.size === 0
        ? ["ממצאי חזרתיות וזהות: אין"]
        : ["ממצאי חזרתיות וזהות, עם המשפטים שמאחוריהם:", ...topOf(t.finding_details, t.finding_details.size).map(([d, n]) => `ממצא: ${d} — ${num(n)} פעמים`)]),
    ]),
  );

  return blocks;
}

// ---------- חלק ב, the live pool (§3.3) ----------

type PoolTally = {
  listings: number;
  cancelled: number;
  match: number;
  mismatch: Map<string, number>;
  unavailable: Map<string, number>;
  skipped: Map<string, number>;
  zero_km: number;
  zero_km_mismatched: number;
  typical_history: number;
};

function newPoolTally(): PoolTally {
  return { listings: 0, cancelled: 0, match: 0, mismatch: new Map(), unavailable: new Map(), skipped: new Map(), zero_km: 0, zero_km_mismatched: 0, typical_history: 0 };
}

/** The `hand` check of a scored invoice — always written beside the km check (scoring/types.ts:156). */
function handCheckOf(item: PoolItem): Check {
  const invoice = item.candidate.breakdown;
  if (isCancelled(invoice)) throw new Error(`listing ${item.listing_id}: a cancelled invoice carries no checks`);
  const check = invoice.checks.find((c) => c.check === "hand");
  if (check === undefined) throw new Error(`listing ${item.listing_id}: a scored invoice with no 'hand' check`);
  return check;
}

/**
 * The zero-km deal, off the history row as stored. facts.ts:134-136: a 'typical' history row is the cell's
 * median standing in for a record we do not have — its raw carries no owners, no hand and no zero_km_deal — so
 * such a row is no registry reading and therefore no zero-km deal; those rows are counted on their own line.
 * A scored REGISTRY row missing the field is a broken invoice, said as such.
 */
function zeroKmDeal(item: PoolItem, t: PoolTally): boolean {
  const invoice = item.candidate.breakdown;
  if (isCancelled(invoice)) return false;
  const history = invoiceRow(invoice, "history", item.listing_id);
  if (history.status !== "scored") return false;
  if (history.source === "typical") {
    t.typical_history += 1;
    return false;
  }
  const v = history.raw.zero_km_deal;
  if (typeof v !== "boolean") throw new Error(`listing ${item.listing_id}: the scored history row's raw.zero_km_deal is ${JSON.stringify(v)}, not a boolean`);
  return v;
}

function addPool(t: PoolTally, items: readonly PoolItem[]): Set<number> {
  const zero = new Set<number>();
  for (const item of items) {
    t.listings += 1;
    if (isCancelled(item.candidate.breakdown)) {
      t.cancelled += 1;
      continue;
    }
    const check = handCheckOf(item);
    if (check.status === "match") t.match += 1;
    else if (check.status === "mismatch") bump(t.mismatch, check.kind ?? "other");
    else if (check.status === "unavailable") bump(t.unavailable, check.reason ?? "unknown");
    else bump(t.skipped, check.reason ?? "unknown");
    if (zeroKmDeal(item, t)) {
      t.zero_km += 1;
      zero.add(item.listing_id);
      if (check.status === "mismatch") t.zero_km_mismatched += 1;
    }
  }
  return zero;
}

function poolBlocks(t: PoolTally): Block[] {
  const kinds = Object.keys(HAND_CHECK_KINDS);
  const mismatchTotal = [...t.mismatch.values()].reduce((s, n) => s + n, 0);
  return [
    block(`מודעות בבריכה: ${num(t.listings)}`, [
      `חשבוניות מבוטלות, בלי שורות ובלי בדיקות: ${num(t.cancelled)}`,
      `שורות היסטוריה מטיפוס "typical" — אין קריאת רשם, ולכן אינן עסקאות אפס ק"מ: ${num(t.typical_history)}`,
    ]),
    block(`בדיקת היד — התאמות: ${num(t.match)}`, [
      `בדיקת היד — אי-התאמות: ${num(mismatchTotal)}`,
      ...kinds.map((k) => `אי-התאמה מסוג ${k}: ${num(t.mismatch.get(k) ?? 0)}`),
      ...[...t.mismatch.entries()].filter(([k]) => !kinds.includes(k)).map(([k, n]) => `אי-התאמה מסוג לא מוכר ${k}: ${num(n)}`),
      ...[...t.unavailable.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `בדיקת היד לא זמינה מסיבה ${r}: ${num(n)}`),
      ...[...t.skipped.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `בדיקת היד דולגה מסיבה ${r}: ${num(n)}`),
    ]),
    block(`עסקאות אפס ק"מ: ${num(t.zero_km)}`, [`מתוכן עם אי-התאמה בבדיקת היד: ${num(t.zero_km_mismatched)}`]),
  ];
}

// ---------- חלק ב — where to look on the site (§3.3.2) ----------

function whereToLook(m: Measured, items: readonly PoolItem[], zero: ReadonlySet<number>): Block[] {
  const byId = new Map(items.map((p) => [p.listing_id, p]));
  const catsOf = new Map(m.input.map((c) => [c.listing_id, c.categories]));
  const plate = (id: number): string => (byId.get(id) as PoolItem).plate;
  const kmOf = (id: number): number | null => (byId.get(id) as PoolItem).km_declared;

  const placeText = (id: number): string => {
    const cats = catsOf.get(id) ?? [];
    if (cats.length > 0) return cats.map((c) => CATEGORY_LABEL[c]).join(" + ");
    const place = m.places.get(id);
    if (typeof place === "number") return `מקום ${num(place)}`;
    const pos = m.position.get(id);
    return pos === undefined ? "מחוץ למסך" : POSITION_LABEL[pos];
  };
  const line = (id: number, tail: string): string => `${placeText(id)} · ${plate(id)} · ${tail}`;

  const shown = m.cars;
  const zeroCars = shown.filter((c) => zero.has(c.listing_id));
  const emptyCars = shown.filter((c) => c.sentence === "");
  const tagCars = shown.filter((c) => c.tag === TAG_CHEAPER_THAN_CHEAPEST);
  const km = (id: number): string => {
    const v = kmOf(id);
    return v === null ? 'בלי ק"מ במודעה' : `${num(v)} ק"מ`;
  };

  const blocks: Block[] = [
    block(`רכבי עסקת אפס ק"מ המוצגים בחיפוש הזה: ${num(zeroCars.length)}`, zeroCars.map((c) => line(c.listing_id, km(c.listing_id)))),
    block(`רכבים מוצגים בלי משפט: ${num(emptyCars.length)}`, emptyCars.map((c) => line(c.listing_id, "ללא משפט"))),
    block(`רכבים הנושאים את התג: ${num(tagCars.length)}`, tagCars.map((c) => line(c.listing_id, c.tag))),
  ];

  const ru = m.search.runner_up;
  blocks.push(
    ru === null
      ? block("רנר-אפ: אין בחיפוש הזה")
      : block(`רנר-אפ: ${num(1)}`, [line(ru, m.runner_up_fact === null ? "בלי עובדה על הפס" : m.runner_up_fact)]),
  );
  return blocks;
}

// ---------- the run ----------

async function main(): Promise<void> {
  const now = new Date(); // one `now` for the whole run — every pool is assembled at the same instant
  const models = await liveModels();
  if (models.length === 0) throw new Error("no live model — there is nothing to measure");

  const file: string[] = [];
  const terminal: string[] = [];
  const say = (line = ""): void => void file.push(line);
  const both = newTally();
  const bothPool = newPoolTally();

  const header: string[] = [];
  header.push(`נכתב ב-${now.toISOString()}`);
  header.push(`גרסאות: מנוע ${num(ENGINE_VERSION)} · חוקים ${num(RULES_VERSION)} · מחולל ${num(JUSTIFICATION_GENERATOR_VERSION)}`);

  type Done = { model: string; tally: Tally; pool: PoolTally; items: PoolItem[]; noFilter: Measured; zero: Set<number> };
  const done: Done[] = [];

  for (const model of models) {
    let items: PoolItem[];
    try {
      items = (await assemblePool(model.key, { now })).items;
    } catch (e) {
      if (e instanceof PoolAssemblyError) for (const l of e.lines) console.log(l);
      throw e;
    }
    const ceilings = [...new Set(items.map((p) => p.price))].sort((a, b) => a - b);
    header.push(`היקף הסריקה ל${model.display}: ${num(ceilings.length)} תקרות מחיר ועוד חיפוש אחד בלי סינון, ${num(ceilings.length + 1)} חיפושים`);

    const tally = newTally();
    let noFilter: Measured | null = null;
    for (const ceiling of [...ceilings, null]) {
      const m = measure(model.display, ceiling, items);
      add(tally, m);
      add(both, m);
      if (ceiling === null) noFilter = m;
    }
    if (noFilter === null) throw new Error(`${model.display}: the search with no filter did not run`);

    const pool = newPoolTally();
    const zero = addPool(pool, items);
    addPool(bothPool, items);
    done.push({ model: model.display, tally, pool, items, noFilter, zero });
  }

  // ---------- the file ----------
  say("# מדידת ההצדקות");
  say();
  for (const l of header) say(l);
  say();
  say("## חלק א — הספירות");
  const partA: Block[] = [];
  for (const d of done) {
    say();
    say(`### ${d.model}`);
    for (const b of countBlocks(d.tally)) {
      partA.push(b);
      say(b.head);
      for (const l of b.lines) say(l);
    }
  }
  say();
  say("### שני הדגמים יחד");
  for (const b of countBlocks(both)) {
    partA.push(b);
    say(b.head);
    for (const l of b.lines) say(l);
  }

  say();
  say("## חלק ב — הבריכה החיה ואיפה להסתכל באתר");
  for (const d of done) {
    say();
    say(`### ${d.model}`);
    for (const b of poolBlocks(d.pool)) {
      say(b.head);
      for (const l of b.lines) say(l);
    }
    say();
    say(`#### איפה להסתכל באתר — ${d.model}, חיפוש בלי סינון`);
    for (const b of whereToLook(d.noFilter, d.items, d.zero)) {
      say(b.head);
      for (const l of b.lines) say(l);
    }
  }
  say();
  say("### שני הדגמים יחד");
  for (const b of poolBlocks(bothPool)) {
    say(b.head);
    for (const l of b.lines) say(l);
  }
  say();
  say('לשם השוואה בלבד, ספירת Supabase של ערן מ-28/09, לא נטענת כאן: 189 מודעות, 21 אי-התאמות — 3 / 12 / 1 / 5 — 11 עסקאות אפס ק"מ, 3 מהן עם אי-התאמה.');

  writeFileSync(REPORT_FILE, `${file.join("\n")}\n`, "utf8");

  // ---------- the terminal (§4.4) ----------
  for (const l of header) terminal.push(l);
  for (const b of partA) terminal.push(b.head);
  for (const l of terminal) console.log(l);
  console.log(`\nnothing written to the database; the measurements are in ${REPORT_FILE}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
