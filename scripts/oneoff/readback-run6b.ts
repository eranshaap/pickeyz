// scripts/oneoff/readback-run6b.ts — the read-back of Day 19 Run 6b (BRIEF §10).
//
// READ-ONLY. It issues SELECTs and nothing else: no transaction, no write path, no --write flag, and
// deliberately NO CALL TO loadForAddress() — that function is allowed to write the run's one re-run when it
// finds an update, and a read-back must never change what it is reporting on. It instead calls the very
// pieces loadForAddress() is built from — latestRun() and updateSignals() over the same max/version inputs —
// so the numbers printed here are the numbers the live page would decide on, without the page's write.
//
//   10.1  every person's question (rerun_of null): the address, the run latestRun() resolves, and the three
//         update signals against now WITH THE EVIDENCE — the two max updated_at values against created_at,
//         the two Israel dates, and the two version pairs. No fixed count is claimed: the day signal fires
//         for any question asked on a previous Israel day, and that is the rule working.
//   10.2  three sample listings resolved exactly as the page resolves them (§3.3 + §7.1): one recommended in
//         the latest run of some question, one ranked non-pick, one delisted. The delisted one must come
//         back "לא נמצא".
//   10.3  over ALL live listings, how many resolve not-shown by each §3.3 reason, with the ids. No expected
//         number is claimed.

import "dotenv/config";
import { db } from "@/lib/db";
import { rubricStrip } from "@/lib/display/rubrics";
import {
  israelDay,
  legendLine,
  noHistoryView,
  NOT_FOUND,
  ownershipAxis,
  pageColor,
  priceBlock,
  sellerLine,
  zeroKmExplanation,
} from "@/lib/display/texts";
import { versionLine } from "@/lib/display/version-line";
import { isCancelled, type Check, type Invoice, type Row } from "@/lib/scoring/types";
import { isThinCell } from "@/lib/selection";
import { assemblePool, type PoolItem } from "@/lib/search/assemble";
import {
  currentVersions,
  latestRun,
  maxDealerCommercialUpdatedAt,
  maxModelListingUpdatedAt,
  isUpdate,
  updateSignals,
  type SearchRow,
} from "@/lib/search/load";
import { decideVisibility, poolVerdicts, type NotShownReason } from "@/lib/search/visibility";
import { selectThree, type Category, type ListingResult } from "@/lib/selection";

const SEARCH_COLUMNS = {
  id: true,
  public_id: true,
  rerun_of: true,
  created_at: true,
  model_searched: true,
  family_id: true,
  filters: true,
  priority: true,
  engine_version: true,
  rules_version: true,
  results_count: true,
  pool_count: true,
} as const;

const iso = (d: Date | null) => (d === null ? "(none)" : d.toISOString());

/**
 * §10.2 — the page's own display decisions for one listing, built from the SAME pure functions
 * src/app/listing/[publicId]/page.tsx builds them from and printed so the wording can be read against the
 * boards. Read-only: it reads the stored invoice, it never scores anything.
 *
 * `itemOf` is filled by §10.3's pool pass, so this costs no extra assembly.
 */
let itemOfRef: Map<number, PoolItem> = new Map();

async function printPage(listing_id: number, categories: Category[], rank: number | null) {
  const item = itemOfRef.get(listing_id);
  if (item === undefined) throw new Error(`readback: listing ${listing_id} is in no assembled pool`);

  const l = await db.listings.findUniqueOrThrow({
    where: { id: listing_id },
    select: {
      price: true,
      km_declared: true,
      hand_declared: true,
      region: true,
      score: true,
      market_stats_id: true,
      dealer: { select: { name: true, dealer_type: true, region: true } },
      car: {
        select: {
          year: true,
          hand: true,
          ownership_history: true,
          color: true,
          registry_color: true,
          test_expiry: true,
          first_registration: true,
          current_owner_type: true,
          model: { select: { model: true, sub_model: true, body_type: true, engine_size: true, transmission: true, vehicle_class: true } },
          test_readings: { select: { test_date: true, km: true }, orderBy: { test_date: "asc" } },
        },
      },
    },
  });
  const car = l.car;
  const norm =
    l.market_stats_id === null
      ? null
      : await db.market_stats.findUnique({ where: { id: l.market_stats_id }, select: { median_price: true, sample_size: true, window_days: true } });

  const invoice = item.candidate.breakdown as Invoice;
  const cancelled = isCancelled(invoice);
  const kmCheck: Check | null = cancelled ? null : ((invoice.checks ?? []).find((c) => c.check === "km") ?? null);
  const historyRow: Row | undefined = cancelled ? undefined : invoice.rows.find((r) => r.row === "history");
  const raw = (historyRow?.raw ?? {}) as { zero_km_deal?: boolean; months_to_first_private?: number };
  const history = Array.isArray(car.ownership_history) ? (car.ownership_history as { ym: string; type: string }[]) : [];

  console.log(`      name: ${car.model.model}, ${car.year}   | page colour ${cancelled ? "#221f1c (cancelled)" : pageColor(categories)}${rank === null ? "" : ""}`);
  console.log(
    `      version line: ${versionLine({
      model: car.model.model,
      body_type: car.model.body_type,
      engine_size: car.model.engine_size,
      transmission: car.model.transmission,
      sub_model: car.model.sub_model,
      vehicle_class: car.model.vehicle_class,
    })}`,
  );
  const block = priceBlock({
    score: cancelled ? null : l.score,
    thin_cell: !cancelled && isThinCell(item.candidate),
    median_price: norm?.median_price ?? null,
    sample_size: norm?.sample_size ?? null,
    window_days: norm?.window_days ?? null,
  });
  console.log(`      price block: ${block === null ? "(nothing — unscored)" : "fair" in block ? `${block.fair} | ${block.compared}` : block.thin}`);
  console.log(`      seller line: ${sellerLine({ dealer_type: l.dealer.dealer_type, dealer_name: l.dealer.name, listing_region: l.region, dealer_region: l.dealer.region })}`);

  const strip = rubricStrip({
    km: { km_declared: l.km_declared, test_readings: car.test_readings, km_check: kmCheck },
    hand: { hand_declared: l.hand_declared, registry_hand: car.hand, has_registry_history: history.length > 0 },
    color: {
      color: car.color,
      registry_color: car.registry_color,
      color_mismatch: cancelled ? undefined : invoice.facts?.color_mismatch,
      color_changed_reported: !cancelled && invoice.facts?.color_changed_reported === true,
    },
    licence: { test_expiry: car.test_expiry, now: new Date() },
  });
  for (const r of strip) console.log(`      rubric ${r.heading.padEnd(6)} big "${r.rubric.big}" | small "${r.rubric.small}"${r.rubric.dark ? "  [DARK]" : ""}`);

  if (history.length > 0) {
    const axis = ownershipAxis({ history, first_registration: car.first_registration, now: new Date(), zero_km_deal: raw.zero_km_deal === true });
    console.log(`      axis: ${axis.start_label} -> ${axis.end_label} (${axis.total_months} months, ${axis.segments.length} segment(s))`);
    for (const s of axis.segments) console.log(`        ${legendLine(s)}${s.zero_km ? "   [0 km marker]" : ""}`);
    if (raw.zero_km_deal === true && typeof raw.months_to_first_private === "number") console.log(`        ${zeroKmExplanation(raw.months_to_first_private)}`);
  } else {
    const v = noHistoryView({ first_registration: car.first_registration, current_owner_type: car.current_owner_type, hand_declared: l.hand_declared });
    console.log(`      no registry history: ${v.reason}`);
    console.log(`        ${v.current ?? "(no registry holder)"} | ${v.declared ?? "(no declared hand)"}`);
  }
}

async function main() {
  const now = new Date();
  console.log("=== Run 6b §10 — read-back (read-only) ===");
  console.log(`generated_at: ${now.toISOString()}  |  Israel day: ${israelDay(now)}`);

  const current = await currentVersions();
  console.log(`current versions: engine ${current.engineVersion}, rules ${current.rulesVersion}`);

  // -------------------------------------------------------------------- 10.1
  console.log("\n--- §10.1 every person's question: latest run + the three update signals ---");

  const all = await db.searches.findMany({ select: SEARCH_COLUMNS, orderBy: { id: "asc" } });
  const questions = all.filter((r) => r.rerun_of === null);
  const rerunsOf = new Map<number, SearchRow[]>();
  for (const r of all) {
    if (r.rerun_of === null) continue;
    const list = rerunsOf.get(r.rerun_of) ?? [];
    list.push(r);
    rerunsOf.set(r.rerun_of, list);
  }
  console.log(`${all.length} searches rows: ${questions.length} question(s), ${all.length - questions.length} re-run(s)`);

  const dealerMax = await maxDealerCommercialUpdatedAt();
  const modelMax = new Map<string, Date | null>();
  let fired = 0;

  for (const q of questions) {
    const reruns = rerunsOf.get(q.id) ?? [];
    const run = latestRun(q, reruns);
    if (!modelMax.has(run.model_searched)) modelMax.set(run.model_searched, await maxModelListingUpdatedAt(run.model_searched));
    const listingMax = modelMax.get(run.model_searched) as Date | null;
    const s = updateSignals(run, now, current, listingMax, dealerMax);
    if (isUpdate(s)) fired += 1;

    console.log(`\n  /?s=${q.public_id}  (search ${q.id}, ${run.model_searched})`);
    console.log(`    latest run: ${run.id === q.id ? "itself (no re-run)" : `re-run ${run.id}`}  | re-runs: ${reruns.length}  | created_at ${iso(run.created_at)}`);
    console.log(`    data    ${s.data ? "FIRES" : "-    "}  max(listings.updated_at) ${iso(listingMax)} | max(dealer_commercial.updated_at) ${iso(dealerMax)} | vs created_at ${iso(run.created_at)}`);
    console.log(`    day     ${s.day ? "FIRES" : "-    "}  run ${israelDay(run.created_at)} vs now ${israelDay(now)} (Asia/Jerusalem)`);
    console.log(`    version ${s.version ? "FIRES" : "-    "}  engine ${run.engine_version} vs ${current.engineVersion} | rules ${run.rules_version} vs ${current.rulesVersion}`);
    console.log(`    => ${isUpdate(s) ? "AN UPDATE: the next load re-runs this question in place" : "no update: the stored rows are shown, nothing is written"}`);
  }
  console.log(`\n  ${fired} of ${questions.length} question(s) would re-run on the next load.`);

  // ------------------------------------------------ the pools, assembled once per model
  console.log("\n--- §10.3 visibility over ALL live listings, by reason ---");

  const liveModels = await db.listings.findMany({
    where: { delisted_at: null },
    select: { car: { select: { model: { select: { model: true } } } } },
  });
  const modelNames = [...new Set(liveModels.map((l) => l.car.model.model).filter((m): m is string => m !== null))];

  const verdictOf = new Map<number, ListingResult>();
  const itemOf = new Map<number, PoolItem>();
  for (const m of modelNames) {
    const pool = await assemblePool(m);
    const res = selectThree({ listings: pool.items.map((p) => p.candidate) });
    for (const r of res.results) verdictOf.set(r.listing_id, r);
    for (const p of pool.items) itemOf.set(p.listing_id, p);
  }
  itemOfRef = itemOf;

  const live = await db.listings.findMany({ where: { delisted_at: null }, select: { id: true, public_id: true }, orderBy: { id: "asc" } });
  const byReason = new Map<NotShownReason, number[]>();
  let shownCount = 0;
  for (const l of live) {
    const r = verdictOf.get(l.id);
    if (r === undefined) throw new Error(`readback: live listing ${l.id} is in no assembled pool`);
    const v = decideVisibility({ exists: true, delisted: false, ...poolVerdicts(r) });
    if (v.shown) {
      shownCount += 1;
      continue;
    }
    byReason.set(v.reason, [...(byReason.get(v.reason) ?? []), l.id]);
  }

  console.log(`  ${live.length} live listings: ${shownCount} shown, ${live.length - shownCount} not shown`);
  for (const reason of ["dealer_not_visible", "sold_strong", "below_threshold", "above_new_price"] as NotShownReason[]) {
    const ids = byReason.get(reason) ?? [];
    console.log(`    ${reason.padEnd(19)} ${String(ids.length).padStart(4)}${ids.length ? `  ids: ${ids.join(", ")}` : ""}`);
  }
  console.log("  (the gate excludes a sold_strong listing before the three rules run, so such a listing is");
  console.log("   counted under sold_strong alone — the library's own order, not a gap in the count.)");

  // -------------------------------------------------------------------- 10.2
  console.log("\n--- §10.2 three sample listings, resolved as the page resolves them ---");

  // The three samples are picked FROM the latest run of a question, so the label and the place printed here
  // are the ones that run recorded — the same row §7.1 reads.
  type Sample = { what: string; listing_id: number; search_public_id: string | null; categories: Category[]; rank: number | null };
  const samples: Sample[] = [];

  for (const q of questions) {
    const run = latestRun(q, rerunsOf.get(q.id) ?? []);
    const rows = await db.search_results.findMany({
      where: { search_id: run.id },
      select: { listing_id: true, rank: true, recommendation_categories: true },
      orderBy: [{ rank: "asc" }, { listing_id: "asc" }],
    });
    const recommended = rows.find((r) => r.recommendation_categories.length > 0);
    const ranked = rows.find((r) => r.rank !== null && r.recommendation_categories.length === 0);
    if (recommended !== undefined && !samples.some((s) => s.what === "recommended")) {
      samples.push({ what: "recommended", listing_id: recommended.listing_id, search_public_id: q.public_id, categories: recommended.recommendation_categories as Category[], rank: recommended.rank });
    }
    if (ranked !== undefined && !samples.some((s) => s.what === "ranked non-pick")) {
      samples.push({ what: "ranked non-pick", listing_id: ranked.listing_id, search_public_id: q.public_id, categories: [], rank: ranked.rank });
    }
    if (samples.length >= 2) break;
  }

  const delisted = await db.listings.findFirst({ where: { delisted_at: { not: null } }, select: { id: true }, orderBy: { id: "asc" } });
  if (delisted !== null) samples.push({ what: "delisted", listing_id: delisted.id, search_public_id: null, categories: [], rank: null });

  for (const sample of samples) {
    const l = await db.listings.findUniqueOrThrow({ where: { id: sample.listing_id }, select: { id: true, public_id: true, delisted_at: true } });
    let verdict: string;
    if (l.delisted_at !== null) {
      verdict = `not shown (delisted) -> "${NOT_FOUND}"`;
    } else {
      const r = verdictOf.get(l.id);
      if (r === undefined) throw new Error(`readback: live listing ${l.id} is in no assembled pool`);
      const v = decideVisibility({ exists: true, delisted: false, ...poolVerdicts(r) });
      verdict = v.shown ? "shown (a page exists)" : `not shown (${v.reason}) -> "${NOT_FOUND}"`;
    }
    const source = sample.categories.length > 0 ? `label(s): ${sample.categories.join(", ")}` : sample.rank !== null ? `place: מקום ${sample.rank}` : "no label and no place";
    console.log(`  ${sample.what.padEnd(16)} listing ${String(sample.listing_id).padStart(4)}  public_id ${l.public_id}`);
    console.log(`      address: /listing/${l.public_id}${sample.search_public_id === null ? "" : `?s=${sample.search_public_id}`}`);
    console.log(`      visibility: ${verdict}`);
    console.log(`      §7.1 verdict source: ${sample.search_public_id === null ? "no search behind the page — no label, no place" : source}`);
    if (l.delisted_at === null) await printPage(l.id, sample.categories, sample.rank);
  }

  console.log("\n=== end ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
