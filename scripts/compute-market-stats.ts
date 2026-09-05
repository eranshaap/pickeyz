// scripts/compute-market-stats.ts
// Computes the market norm - median price and km per (comparison_group x year) - from listings
// and appends rows to market_stats. `--dry-run` computes and prints everything, writes nothing.
//
// Rules (Day 9, revised Day 9c - no descent ladder):
// - One `now` for the run: it bounds the pool and is the computed_at of every row.
// - Pool for window W: first_seen_at <= now AND (delisted_at IS NULL OR delisted_at >= now - W days).
//   Every listing in the pool contributes price. Every listing counts - no dedupe by car, dealer or phone.
// - Cells: every distinct (groupKey(fields), cars.year) in the 90-day pool.
// - Per cell: pool at 90 days; if sample_size < MIN_SAMPLE, pool at 180 days instead. The row is
//   written with the window actually used and its true sample_size, even when it is still below
//   MIN_SAMPLE. A thin cell is never merged into a coarser group - the scoring step treats
//   sample_size < MIN_SAMPLE as "no price comparison".
// - One row per cell. Keys come only from groupKey() in src/lib/comparison-group.ts;
//   group_version = GROUP_VERSION.
// - Touches market_stats only. listings.market_stats_id is written by the scoring step.

import "dotenv/config";
import { db } from "@/lib/db";
import { GROUP_VERSION, groupKey, type GroupFields } from "@/lib/comparison-group";

const DRY = process.argv.includes("--dry-run");

const MIN_SAMPLE = 5;
const WINDOWS = [90, 180] as const;
type Window = (typeof WINDOWS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

type PoolListing = {
  id: number;
  car_id: number;
  year: number;
  price: number; // the contributed price
  km: number | null;
  dealer_type: string;
  delisted_at: Date | null;
  key: string; // groupKey(fields)
};

function median(values: number[]): number {
  if (values.length === 0) throw new Error("median of an empty set");
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function inWindow(l: PoolListing, now: Date, window: Window): boolean {
  return l.delisted_at === null || l.delisted_at.getTime() >= now.getTime() - window * DAY_MS;
}

function mix(pool: PoolListing[]): string {
  const counts = new Map<string, number>();
  for (const l of pool) counts.set(l.dealer_type, (counts.get(l.dealer_type) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
}

type Cell = { key: string; year: number; count90: number };
type Row = {
  comparison_group: string;
  year: number;
  median_price: number;
  median_km: number | null;
  sample_size: number;
  window_days: Window;
  group_version: number;
  computed_at: Date;
  // printed, not stored
  pool: PoolListing[];
};

async function main() {
  const now = new Date();
  const maxWindow = Math.max(...WINDOWS) as Window;
  console.log(`${DRY ? "[DRY RUN] " : ""}compute-market-stats - now = ${now.toISOString()}, group_version = ${GROUP_VERSION}`);

  // ---------- 1. the pool ----------
  const totalListings = await db.listings.count();
  const inactiveNotDelisted = await db.listings.count({ where: { is_active: false, delisted_at: null } });
  const activeButDelisted = await db.listings.count({ where: { is_active: true, delisted_at: { not: null } } });

  const raw = await db.listings.findMany({
    where: {
      first_seen_at: { lte: now },
      OR: [{ delisted_at: null }, { delisted_at: { gte: new Date(now.getTime() - maxWindow * DAY_MS) } }],
    },
    include: { car: { include: { model: true } }, dealer: { select: { dealer_type: true } } },
    orderBy: { id: "asc" },
  });

  const pool: PoolListing[] = raw.map((l) => {
    if (l.car.year === null) throw new Error(`listing ${l.id} (car ${l.car_id}): cars.year is null - cannot place it in a (group, year) cell`);
    const m = l.car.model;
    const fields: GroupFields = {
      vehicle_class: m.vehicle_class,
      make: m.make, model: m.model, body_type: m.body_type, fuel_type: m.fuel_type,
      engine_size: m.engine_size, horsepower: m.horsepower, transmission: m.transmission,
      drive_type: m.drive_type, sub_model: m.sub_model,
    };
    return {
      id: l.id, car_id: l.car_id, year: l.car.year, price: l.price, km: l.km_declared,
      dealer_type: l.dealer.dealer_type, delisted_at: l.delisted_at,
      key: groupKey(fields),
    };
  });
  const pool90 = pool.filter((l) => inWindow(l, now, 90));
  const pool180 = pool.filter((l) => inWindow(l, now, 180));

  // ---------- 2. cells ----------
  const cells = new Map<string, Cell>();
  for (const l of pool90) {
    const id = `${l.key} ${l.year}`;
    const c = cells.get(id);
    if (c) c.count90++;
    else cells.set(id, { key: l.key, year: l.year, count90: 1 });
  }
  const cellList = [...cells.values()].sort((a, b) => a.key.localeCompare(b.key) || a.year - b.year);

  console.log(`\n===== DISTRIBUTION - (comparison_group, year) cells in the 90-day pool (${cellList.length}) =====`);
  for (const c of cellList) console.log(`${c.count90.toString().padStart(4)}  ${c.key} x ${c.year}`);

  // ---------- 3. one row per cell ----------
  const rowList: Row[] = [];
  let widened = 0; // cells whose 90-day sample was thin and were pooled at 180 days
  let thin = 0; // rows still below MIN_SAMPLE at the window actually used

  for (const c of cellList) {
    const inCell = (l: PoolListing) => l.year === c.year && l.key === c.key;
    let window: Window = 90;
    let cellPool = pool90.filter(inCell);
    if (cellPool.length < MIN_SAMPLE) {
      window = 180;
      cellPool = pool180.filter(inCell);
      widened++;
    }
    if (cellPool.length < MIN_SAMPLE) thin++;
    const kms = cellPool.map((l) => l.km).filter((k): k is number => k !== null);
    rowList.push({
      comparison_group: c.key,
      year: c.year,
      median_price: Math.round(median(cellPool.map((l) => l.price))),
      median_km: kms.length ? Math.round(median(kms)) : null,
      sample_size: cellPool.length,
      window_days: window,
      group_version: GROUP_VERSION,
      computed_at: now,
      pool: cellPool,
    });
  }

  console.log(`\n===== ROWS TO WRITE (${rowList.length}) =====`);
  console.log("comparison_group | year | window | sample_size | median_price | median_km");
  for (const r of rowList) {
    const flag = r.sample_size < MIN_SAMPLE ? " THIN" : "";
    console.log(`\n${r.comparison_group} | ${r.year} | ${r.window_days} | ${r.sample_size} | ${r.median_price} | ${r.median_km ?? "-"}${flag}`);
    console.log(`  dealer_type mix: ${mix(r.pool)}`);
  }

  // ---------- 4. summary ----------
  console.log("\n===== SUMMARY =====");
  console.log(`listings in DB                      ${totalListings}`);
  console.log(`listings in 90-day pool             ${pool90.length}`);
  console.log(`listings in 180-day pool            ${pool180.length}`);
  console.log(`is_active=false & delisted_at null  ${inactiveNotDelisted}`);
  console.log(`is_active=true  & delisted_at set   ${activeButDelisted}`);
  console.log(`cells                               ${cellList.length}`);
  console.log(`rows to write                       ${rowList.length}`);
  console.log(`rows widened to 180                 ${widened}`);
  console.log(`thin rows (sample_size < ${MIN_SAMPLE})         ${thin}`);

  // ---------- 5. write ----------
  if (DRY) {
    console.log("\n[DRY RUN] nothing written");
    return;
  }
  const inserted = await db.$transaction(async (tx) => {
    const res = await tx.market_stats.createMany({
      data: rowList.map((r) => ({
        comparison_group: r.comparison_group,
        year: r.year,
        median_price: r.median_price,
        median_km: r.median_km,
        sample_size: r.sample_size,
        window_days: r.window_days,
        group_version: r.group_version,
        computed_at: r.computed_at,
      })),
    });
    return res.count;
  });
  console.log(`\ninserted ${inserted} market_stats rows`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
