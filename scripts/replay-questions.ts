// scripts/replay-questions.ts
// THE READ-BACK of every rules change (BRIEF Days 22–23, Run 1b §1). It re-runs the selection on every question
// a person has asked, with the code exactly as it is at the moment it runs, and prints what the selection
// decided. Run it once before a rules edit and once after, with the same --now, and the two files are the
// before ← after of that change over the people's own questions.
//
// READ-ONLY BY CONSTRUCTION: there is no --write flag, no Prisma mutation is imported, no transaction is
// opened. It reads `searches` and the live pool and writes one text file.
//
// It is a KEPT script, not a one-off: from now on every rules version is read back through it.
//
// Arguments:
//   --out=<path>    REQUIRED. The whole text is written there (and printed to stdout).
//   --now=<ISO>     the instant the pool is assembled at (seller visibility, §13.3). Default: new Date().
//                   The header prints the `now` used; the second run of a pair passes the first run's value.
//
// What it does, per question, is exactly the read-only sequence runSearch() runs before it writes
// (src/lib/search/run.ts:160-165): assemblePool(model, { now }) — cached per model — then the cut with
// passes()/storedFilters(), then selectThree() with no options. Nothing else, and no option the site does not pass.
//
// EVERYTHING IS REACHED GENERICALLY, so the script runs unchanged against rules version 7 and version 8:
// `crowning`, `picks`, `runner_ups`, the eligibility reasons and the invoice rows are printed as plain
// objects and never through a field that exists in only one version.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { ENGINE_VERSION } from "@/lib/scoring/constants";
import { assemblePool, modelKey, PoolAssemblyError, type AssembledPool, type PoolItem } from "@/lib/search/assemble";
import { passes } from "@/lib/search/filters";
import { storedFilters } from "@/lib/search/load";
import { isCancelled, RULES_VERSION, selectThree, type ListingResult, type SelectionResult } from "@/lib/selection";
import { invoiceRow } from "@/lib/selection/util";

// ---------- arguments ----------
function stringArg(name: string): string | null {
  if (process.argv.includes(`--${name}`)) throw new Error(`--${name}: missing value — write --${name}=<value>`);
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (!a) return null;
  const v = a.slice(name.length + 3);
  if (!v) throw new Error(`--${name}: missing value`);
  return v;
}
const OUT = stringArg("out");
const NOW = stringArg("now");

function resolveNow(): Date {
  if (NOW === null) return new Date();
  const t = Date.parse(NOW);
  if (Number.isNaN(t)) throw new Error(`--now: '${NOW}' is not a valid ISO instant`);
  return new Date(t);
}

// ---------- output ----------
const out: string[] = [];
function log(line = "") {
  out.push(line);
  console.log(line);
}

// ---------- the facts printed about one selection ----------
const itemsById = (items: readonly PoolItem[]): Map<number, PoolItem> => new Map(items.map((p) => [p.listing_id, p]));

function itemOfRow(r: ListingResult, byId: ReadonlyMap<number, PoolItem>): PoolItem {
  const p = byId.get(r.listing_id);
  if (p === undefined) throw new Error(`replay: listing ${r.listing_id} came back from selectThree but is not in the pool it was given`);
  return p;
}

/** The shown rows that have a deal score, and of those the rows the floor barred — read off the reasons. */
function floorFacts(res: SelectionResult, byId: ReadonlyMap<number, PoolItem>): { scored: ListingResult[]; below: ListingResult[] } {
  const scored = res.results.filter((r) => r.status === "shown" && itemOfRow(r, byId).candidate.breakdown.deal_score !== null);
  return { scored, below: scored.filter((r) => r.eligibility.reasons.includes("below_floor")) };
}

/** A shown, scored row whose condition_vs_typical is unknown — the floor cannot speak about it (§6.2). */
function scoredNullCvt(res: SelectionResult, byId: ReadonlyMap<number, PoolItem>): number {
  return floorFacts(res, byId).scored.filter((r) => itemOfRow(r, byId).candidate.breakdown.condition_vs_typical === null).length;
}

/**
 * The tail row's history key: the paper value of a registry reading, or what stands in its place. isCancelled()
 * comes first — invoiceRow() throws on a cancelled invoice, which has no rows at all.
 */
function historyKey(p: PoolItem): string {
  if (isCancelled(p.candidate)) return "cancelled";
  const row = invoiceRow(p.candidate.breakdown, "history", p.listing_id);
  if (row.status !== "scored") return "unavailable";
  if (row.source === "mot") return `mot=${String(row.value)}`;
  if (row.source === "typical") return `typical=${String(row.value)}`;
  throw new Error(`replay: listing ${p.listing_id} — a scored history row with source '${String(row.source)}'; the invoice knows only 'mot' and 'typical' here`);
}

function tailText(res: SelectionResult, byId: ReadonlyMap<number, PoolItem>): string {
  const tail = res.results
    .filter((r) => r.status === "shown" && r.rank !== null && itemOfRow(r, byId).candidate.breakdown.deal_score === null)
    .sort((a, b) => (a.rank as number) - (b.rank as number));
  if (tail.length === 0) return "-";
  return tail.map((r) => `${r.listing_id}:${historyKey(itemOfRow(r, byId))}`).join(", ");
}

/** §1.4 — the cheapest pick is never pricier than the best_value pick; n/a when either is empty. */
function cheapestVsBestValue(res: SelectionResult, byId: ReadonlyMap<number, PoolItem>): string {
  const cheapest = res.picks.cheapest;
  const bestValue = res.picks.best_value;
  if (cheapest === null || bestValue === null) return "n/a";
  const c = byId.get(cheapest);
  const b = byId.get(bestValue);
  if (c === undefined || b === undefined) throw new Error(`replay: a pick (${cheapest} / ${bestValue}) is not in the pool it was picked from`);
  return c.candidate.price <= b.candidate.price ? "ok" : "VIOLATION";
}

async function main() {
  if (OUT === null) throw new Error("--out=<path> is required: the replay writes its whole text to a file");
  const now = resolveNow();

  const questions = await db.searches.findMany({
    where: { rerun_of: null },
    orderBy: { created_at: "asc" },
    select: { id: true, public_id: true, visitor_id: true, model_searched: true, filters: true, created_at: true, rules_version: true },
  });

  log(`replay-questions · engine ${ENGINE_VERSION} · rules ${RULES_VERSION} · now=${now.toISOString()} · questions ${questions.length}`);

  // The pool of a model, assembled once — the questions of one model all cut the same pool.
  const pools = new Map<string, AssembledPool>();
  const poolOf = async (model: string): Promise<AssembledPool> => {
    const key = modelKey(model);
    const hit = pools.get(key);
    if (hit !== undefined) return hit;
    let assembled: AssembledPool;
    try {
      assembled = await assemblePool(model, { now });
    } catch (e) {
      if (e instanceof PoolAssemblyError) for (const line of e.lines) log(line);
      throw e;
    }
    pools.set(key, assembled);
    return assembled;
  };

  // ---------- the pools, over the UNFILTERED pool of each model ----------
  for (const q of questions) await poolOf(q.model_searched);
  for (const [key, assembled] of pools) {
    const byId = itemsById(assembled.items);
    const res = selectThree({ listings: assembled.items.map((p) => p.candidate) });
    const { scored, below } = floorFacts(res, byId);
    log(`pool ${key} · scored ${scored.length} · below_floor ${below.length}`);
    for (const r of below) {
      const p = itemOfRow(r, byId);
      log(`  ${p.listing_id} cvt=${String(p.candidate.breakdown.condition_vs_typical)} price=${p.candidate.price}`);
    }
  }

  // ---------- the questions ----------
  for (const q of questions) {
    const assembled = await poolOf(q.model_searched);
    const filters = storedFilters(q.filters);
    const cut = assembled.items.filter((p) => passes(p, filters));
    const res = selectThree({ listings: cut.map((p) => p.candidate) });
    const byId = itemsById(cut);
    const { scored, below } = floorFacts(res, byId);

    log();
    log(
      `Q ${q.public_id} · ${q.model_searched} · ${q.created_at.toISOString()} · visitor=${q.visitor_id ?? "-"} · stored_rules=${q.rules_version} · filters=${JSON.stringify(filters)} · pool ${assembled.items.length} · cut ${cut.length}`,
    );
    log(`crowning ${JSON.stringify(res.crowning)}`);
    log(`picks ${JSON.stringify(res.picks)}`);
    log(`runner_up ${JSON.stringify(res.runner_ups.cheapest)}`);
    log(`below_floor ${below.length} of scored ${scored.length}`);
    log(`scored_null_cvt ${scoredNullCvt(res, byId)}`);
    log(`cheapest_vs_best_value ${cheapestVsBestValue(res, byId)}`);
    log(`tail ${tailText(res, byId)}`);
  }

  writeFileSync(OUT, `${out.join("\n")}\n`, "utf8");
  console.log(`\nnothing written to the database; the replay is in ${OUT}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
