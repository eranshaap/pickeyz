// scripts/score-listings.ts
// Scores every live listing with the Stage A engine (BRIEF Day 11, §11). Default is a DRY RUN: it
// prints the report below and writes the same text to REPORT-score-listings.md (§22.3 — never to
// REPORT.md), nothing else. `--write` is the only way anything reaches the database.
//
// Per listing with delisted_at IS NULL:
//   1. load listing, car, model, dealer; the norm row = the latest market_stats row by computed_at for
//      (models.comparison_group, cars.year) with group_version = GROUP_VERSION; none -> market = null.
//   2. build ScoringInput (src/lib/scoring-input.ts), scoreListing(input, now). One `now` for the run.
//   3. collect; a listing that throws is reported with its id and the error, and the run continues.
//
// Dry run prints: top 10 by deal_score (nulls last) as compact invoices; counts by confidence level,
// by check kind, by sold_signal strength, by unavailable reason per row; the full ScoreResult JSON for
// `--plates=1234567,...`; everything that threw.
//
// --write (§22.2): one transaction, one statement per table — a createMany of listing_scores rows
// (§19.1) and one UPDATE listings … FROM unnest(...) setting score = deal_score, condition_score,
// confidence = level, score_breakdown = the result, scored_at = now, market_stats_id = the norm
// row's id or null, engine_version = ENGINE_VERSION (and updated_at, which Prisma's update would
// have touched). Prisma's default transaction timeout. The report is printed in both modes.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { GROUP_VERSION, groupKey, type GroupFields } from "@/lib/comparison-group";
import { scoreListing, type ScoreResult, type ScoringInput } from "@/lib/scoring";
import { ENGINE_VERSION } from "@/lib/scoring/constants";
import { scoringSubject } from "@/lib/scoring-input";

const WRITE = process.argv.includes("--write");
const PLATES = (() => {
  const a = process.argv.find((x) => x.startsWith("--plates="));
  return a ? a.slice("--plates=".length).split(",").map((p) => p.trim()).filter(Boolean) : [];
})();
const REPORT_FILE = "REPORT-score-listings.md"; // §22.3: never REPORT.md

type Scored = {
  listing_id: number;
  plate: string;
  year: number;
  price: number;
  market_stats_id: number | null;
  result: ScoreResult;
  stored: { score: number | null; condition_score: number | null; confidence: string | null }; // Day 12 §6: what listings holds now, for the regression count
};
type Failed = { listing_id: number; plate: string; error: string };

const out: string[] = [];
function log(line = "") {
  out.push(line);
  console.log(line);
}
function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "-" : (n > 0 ? "+" : "") + String(n);
}
function count<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function main() {
  const now = new Date();
  log(`${WRITE ? "" : "[DRY RUN] "}score-listings - now = ${now.toISOString()}, engine_version = ${ENGINE_VERSION}, group_version = ${GROUP_VERSION}`);

  const listings = await db.listings.findMany({
    where: { delisted_at: null },
    include: { car: { include: { model: true } }, dealer: { select: { dealer_type: true } } },
    orderBy: { id: "asc" },
  });

  // ---------- 1. norm rows ----------
  const norms = new Map<string, Awaited<ReturnType<typeof db.market_stats.findFirst>>>();
  async function normRow(group: string, year: number) {
    const k = `${group} ${year}`;
    if (!norms.has(k)) {
      norms.set(k, await db.market_stats.findFirst({
        where: { comparison_group: group, year, group_version: GROUP_VERSION },
        orderBy: { computed_at: "desc" },
      }));
    }
    return norms.get(k) ?? null;
  }

  // ---------- 2. score ----------
  const scored: Scored[] = [];
  const failed: Failed[] = [];
  let noGroup = 0; // models.comparison_group is null
  let noNorm = 0; // no market_stats row for (group, year)
  let keyMismatch = 0; // models.comparison_group differs from groupKey(fields) under the current version
  let staleNorm = 0; // norm row computed under an older engine (no median_condition)

  for (const l of listings) {
    const plate = l.car.license_plate ?? "?";
    try {
      const m = l.car.model;
      const fields: GroupFields = {
        vehicle_class: m.vehicle_class, make: m.make, model: m.model, body_type: m.body_type, fuel_type: m.fuel_type,
        engine_size: m.engine_size, horsepower: m.horsepower, transmission: m.transmission, drive_type: m.drive_type, sub_model: m.sub_model,
      };
      if (m.comparison_group !== null && m.comparison_group !== groupKey(fields)) keyMismatch++;

      const subject = scoringSubject(l, l.car, l.dealer.dealer_type);
      let market: ScoringInput["market"] = null;
      if (m.comparison_group === null) noGroup++;
      else {
        const n = await normRow(m.comparison_group, subject.car.year);
        if (n === null) noNorm++;
        else {
          if (n.engine_version !== ENGINE_VERSION) staleNorm++;
          market = { id: n.id, median_price: n.median_price, median_km: n.median_km, median_condition: n.median_condition, sample_size: n.sample_size, window_days: n.window_days };
        }
      }
      const result = scoreListing({ ...subject, market }, now);
      scored.push({ listing_id: l.id, plate, year: subject.car.year, price: l.price, market_stats_id: market?.id ?? null, result, stored: { score: l.score, condition_score: l.condition_score, confidence: l.confidence } });
    } catch (e) {
      failed.push({ listing_id: l.id, plate, error: (e as Error).message });
    }
  }

  // ---------- 3. report ----------
  log(`listings (delisted_at is null): ${listings.length}; scored: ${scored.length}; threw: ${failed.length}`);
  log(`no norm row: ${noNorm}; model without comparison_group: ${noGroup}; comparison_group != groupKey(fields): ${keyMismatch}; norm row from an older engine: ${staleNorm}`);

  log(`\n===== TOP 10 BY deal_score (nulls last) =====`);
  log("plate | year | price | price_adv | history | km | condition | typical | deal | confidence | sold");
  const ranked = [...scored].sort((a, b) => {
    const x = a.result.deal_score, y = b.result.deal_score;
    if (x === null && y === null) return a.listing_id - b.listing_id;
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || a.listing_id - b.listing_id;
  });
  for (const s of ranked.slice(0, 10)) {
    const r = s.result;
    const row = (name: string) => r.rows.find((x) => x.row === name);
    log(`${s.plate} | ${s.year} | ${s.price} | ${fmt(r.price_advantage)} | ${fmt(row("history")?.value)} | ${fmt(row("km")?.value)} | ${fmt(r.condition_score)} | ${fmt(r.typical_condition)} | ${fmt(r.deal_score)} | ${r.confidence.level} | ${r.sold_signal.strength ?? "-"}`);
  }

  log(`\n===== COUNTS =====`);
  log("by confidence level");
  for (const [k, n] of count(scored, (s) => s.result.confidence.level)) log(`  ${n.toString().padStart(4)}  ${k}`);
  log("by check kind (check: status[:kind|reason])");
  const checkLines = scored.flatMap((s) => s.result.checks.map((c) => `${c.check}: ${c.status}${c.kind ? ":" + c.kind : c.reason ? ":" + c.reason : ""}`));
  for (const [k, n] of count(checkLines, (x) => x)) log(`  ${n.toString().padStart(4)}  ${k}`);
  log("by sold_signal strength");
  for (const [k, n] of count(scored, (s) => s.result.sold_signal.strength ?? "null")) log(`  ${n.toString().padStart(4)}  ${k}`);
  log("by unavailable reason per row");
  const unavailable = scored.flatMap((s) => s.result.rows.filter((r) => r.status === "unavailable").map((r) => `${r.row}: ${r.reason}`));
  for (const [k, n] of count(unavailable, (x) => x)) log(`  ${n.toString().padStart(4)}  ${k}`);
  log("deal_score present");
  log(`  ${scored.filter((s) => s.result.deal_score !== null).length.toString().padStart(4)}  scored`);
  log(`  ${scored.filter((s) => s.result.deal_score === null).length.toString().padStart(4)}  null`);

  // ---------- Day 12 §6: regression against listings, and the reality delta ----------
  log(`\n===== REGRESSION vs listings (score, condition_score, confidence) =====`);
  const regressed = scored.filter(
    (s) => s.result.deal_score !== s.stored.score || s.result.condition_score !== s.stored.condition_score || s.result.confidence.level !== s.stored.confidence,
  );
  log(`regression count: ${regressed.length} (must be 0)`);
  for (const s of regressed) {
    log(`listing ${s.listing_id} (${s.plate}): score ${fmt(s.stored.score)} -> ${fmt(s.result.deal_score)}; condition_score ${fmt(s.stored.condition_score)} -> ${fmt(s.result.condition_score)}; confidence ${s.stored.confidence ?? "-"} -> ${s.result.confidence.level}`);
  }

  log(`\n===== REALITY DELTA (condition_by_reality !== condition_score) =====`);
  const historyOf = (s: Scored) => s.result.rows.find((r) => r.row === "history")!;
  const zeroKm = scored.filter((s) => historyOf(s).raw.zero_km_deal === true);
  const delta = scored.filter((s) => s.result.condition_by_reality !== s.result.condition_score);
  log(`zero-km cars in the pool: ${zeroKm.length}; listings with a reality delta: ${delta.length}`);
  log("listing | plate | history paper | history reality | delta (reality - paper)");
  for (const s of delta) {
    const h = historyOf(s);
    const d = typeof h.value === "number" && typeof h.value_by_reality === "number" ? Math.round((h.value_by_reality - h.value) * 10) / 10 : null;
    log(`${s.listing_id} | ${s.plate} | ${fmt(h.value)} | ${fmt(h.value_by_reality)} | ${fmt(d)}`);
  }

  if (PLATES.length) {
    log(`\n===== FULL RESULTS FOR --plates (${PLATES.length}) =====`);
    for (const p of PLATES) {
      const hits = scored.filter((s) => s.plate === p);
      if (hits.length === 0) {
        const f = failed.filter((x) => x.plate === p);
        log(`\n--- ${p}: ${f.length ? "threw: " + f.map((x) => x.error).join("; ") : "no live listing with this plate"}`);
        continue;
      }
      for (const s of hits) {
        log(`\n--- ${p} (listing ${s.listing_id}, year ${s.year}, price ${s.price}, market_stats_id ${s.market_stats_id ?? "null"})`);
        log(JSON.stringify(s.result, null, 2));
      }
    }
  }

  log(`\n===== THREW (${failed.length}) =====`);
  for (const f of failed) log(`listing ${f.listing_id} (${f.plate}): ${f.error}`);

  // ---------- 4. write ----------
  writeFileSync(REPORT_FILE, `# score-listings ${WRITE ? "--write" : "dry run"}\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`, "utf8");
  if (!WRITE) {
    console.log(`\n[DRY RUN] nothing written to the database; report written to ${REPORT_FILE}`);
    return;
  }
  // §22.2: one statement per table, inside one transaction, default timeout.
  const ids = scored.map((s) => s.listing_id);
  const deal = scored.map((s) => s.result.deal_score);
  const cond = scored.map((s) => s.result.condition_score);
  const level = scored.map((s) => s.result.confidence.level);
  const breakdown = scored.map((s) => JSON.stringify(s.result));
  const msid = scored.map((s) => s.market_stats_id);
  const n = await db.$transaction(async (tx) => {
    const ins = await tx.listing_scores.createMany({
      data: scored.map((s) => ({
        listing_id: s.listing_id, scored_at: now, engine_version: ENGINE_VERSION, market_stats_id: s.market_stats_id,
        deal_score: s.result.deal_score, condition_score: s.result.condition_score, confidence: s.result.confidence.level,
        breakdown: s.result as unknown as Prisma.InputJsonValue,
      })),
    });
    const upd = await tx.$executeRaw`
      UPDATE "listings" AS l SET
        "score" = v.score,
        "condition_score" = v.condition_score,
        "confidence" = v.confidence::"ConfidenceLevel",
        "score_breakdown" = v.breakdown,
        "scored_at" = ${now},
        "market_stats_id" = v.market_stats_id,
        "engine_version" = ${ENGINE_VERSION},
        "updated_at" = ${now}
      FROM unnest(${ids}::int[], ${deal}::float8[], ${cond}::float8[], ${level}::text[], ${breakdown}::jsonb[], ${msid}::int[])
        AS v(id, score, condition_score, confidence, breakdown, market_stats_id)
      WHERE l."id" = v.id`;
    if (ins.count !== scored.length || upd !== scored.length) {
      throw new Error(`write: expected ${scored.length} rows, inserted ${ins.count} listing_scores and updated ${upd} listings — rolled back`);
    }
    return upd;
  });
  console.log(`\nwrote ${n} listings and ${n} listing_scores rows; report written to ${REPORT_FILE}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
