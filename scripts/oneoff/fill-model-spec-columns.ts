// scripts/oneoff/fill-model-spec-columns.ts
// Day 19ב §6 — a one-off fill, run once and then deleted (after its --write), committed only so
// that the fill is on record.
//
// WHY. Run 14's migration added the 19 spec columns to `models`, all empty. The catalog import
// (scripts/import-models.ts) writes with createMany + skipDuplicates: a row already in `models` is
// skipped, never updated, so the import can add new versions but can never fill a column of an
// existing one. This script does that once, from the same file, through the same translation.
//
// WHAT IT WRITES. The 19 new columns only — doors, airbags, drive_technology, co2_wltp and the 15
// flags — on the `models` rows whose identity (vehicle_class, degem_code, year) the file also has.
// No other column of `models` is touched: the spelling of make / model / sub_model and every other
// field stay exactly as they are, including the few file rows whose text carries a trailing space
// (the count is printed, so that what we are NOT changing is on record too).
//
// HOW. loadCatalog() + buildModelRows() — the import's own path, so a technology word or a flag
// value the catalog is not allowed to hold stops the script by name BEFORE anything is written
// (§2.3). Dry by default: everything below is printed and nothing is written. `--write` performs
// the updates in ONE transaction, in chunks of 1,000 rows, each chunk one UPDATE … FROM unnest(…).

import "dotenv/config";
import { WRITE_TRANSACTION_OPTIONS, db } from "@/lib/db";
import { buildModelRows, loadCatalog, type ModelRow } from "@/lib/mot/catalog";

const WRITE = process.argv.includes("--write");
for (const arg of process.argv.slice(2)) {
  if (arg === "--write") continue;
  throw new Error(`unknown argument ${JSON.stringify(arg)} — this script takes --write and nothing else`);
}

const CHUNK = 1000;

// The 15 flag columns, in the section's display order.
const FLAG_COLUMNS = [
  "aeb_pedestrian_cyclist",
  "pedestrian_detection",
  "two_wheeler_detection",
  "forward_collision_warning",
  "distance_monitoring",
  "lane_departure_warning",
  "lane_keeping",
  "blind_spot_detection",
  "adaptive_cruise",
  "traffic_sign_recognition",
  "auto_high_beams",
  "reverse_auto_braking",
  "sunroof",
  "alloy_wheels",
  "reverse_camera",
] as const satisfies readonly (keyof ModelRow)[];

type FlagColumn = (typeof FLAG_COLUMNS)[number];

// The catalog fields whose text this project stores in `models`. A trailing space in one of these
// is what the fill leaves alone: the column it feeds is not one of the 19.
const STORED_TEXT_FIELDS = ["tozar", "kinuy_mishari", "ramat_gimur", "merkav", "delek_nm", "hanaa_nm"] as const;

const identityOf = (r: { vehicle_class: string | null; degem_code: string | null; year: number | null }): string =>
  `${r.vehicle_class}|${r.degem_code}|${r.year}`;

async function main() {
  console.log(`${WRITE ? "--write" : "[DRY RUN]"} fill-model-spec-columns`);

  // ---------- the file ----------
  const catalog = loadCatalog();
  const { rows, report } = buildModelRows(); // a translation error stops the script here, naming the row
  const byIdentity = new Map<string, ModelRow>(rows.map((r) => [identityOf(r), r]));

  // ---------- models: the identities only ----------
  const models = await db.models.findMany({
    select: { id: true, vehicle_class: true, degem_code: true, year: true },
  });
  const matched = models.filter((m) => byIdentity.has(identityOf(m)));
  const unmatchedModels = models.filter((m) => !byIdentity.has(identityOf(m)));
  const modelIdentities = new Set(models.map(identityOf));
  const unmatchedFile = rows.filter((r) => !modelIdentities.has(identityOf(r)));

  console.log("\ncatalog rows in the file:", report.catalog_rows);
  console.log("rows in the file:        ", rows.length, "(one per class+code+year)");
  console.log("rows in models:          ", models.length);
  console.log("matched by identity:     ", matched.length);
  console.log("models rows with no file row:", unmatchedModels.length);
  for (const m of unmatchedModels.slice(0, 10)) console.log("   ", identityOf(m));
  console.log("file rows with no models row:", unmatchedFile.length);

  // ---------- what the 19 columns will hold, among the matched ----------
  const fill = matched.map((m) => byIdentity.get(identityOf(m))!);

  const byTech = new Map<string, number>();
  for (const r of fill) byTech.set(r.drive_technology, (byTech.get(r.drive_technology) ?? 0) + 1);
  console.log("\ndrive_technology, among the matched:");
  for (const [tech, n] of [...byTech.entries()].sort((a, b) => b[1] - a[1])) console.log("   ", tech.padEnd(10), n);

  const airbagsNull = fill.filter((r) => r.airbags === null).length;
  const airbagsZero = fill.filter((r) => r.airbags === 0).length;
  console.log("airbags: null", airbagsNull, "| 0", airbagsZero, "| other", fill.length - airbagsNull - airbagsZero);
  console.log("doors = 0:   ", fill.filter((r) => r.doors === 0).length);
  console.log("co2_wltp null:", fill.filter((r) => r.co2_wltp === null).length);

  console.log("\nflags, count of true among the matched:");
  for (const f of FLAG_COLUMNS) console.log("   ", f.padEnd(26), fill.filter((r) => r[f]).length);

  // ---------- the text we are NOT touching ----------
  const whitespaceRows = catalog.filter((r) =>
    STORED_TEXT_FIELDS.some((f) => (r[f] ?? "") !== (r[f] ?? "").trim()),
  ).length;
  console.log(
    "\nfile rows whose stored text carries surrounding whitespace:",
    whitespaceRows,
    "— their models rows keep the spelling they have; this fill does not touch it",
  );

  // ---------- the versions our cars sit on ----------
  const carModelIds = new Set(
    (await db.cars.findMany({ select: { model_id: true } }))
      .map((c) => c.model_id)
      .filter((id): id is number => id !== null),
  );
  const ours = models.filter((m) => carModelIds.has(m.id));
  console.log(`\nthe versions our cars sit on (${ours.length} models rows, ${carModelIds.size} referenced ids):`);
  console.log("    degem_code  year  model / sub_model | drive_technology airbags doors co2_wltp safety_rating");
  for (const m of ours.sort((a, b) => identityOf(a).localeCompare(identityOf(b)))) {
    const r = byIdentity.get(identityOf(m));
    if (!r) {
      console.log("   ", identityOf(m), "— no file row: the 19 columns stay empty");
      continue;
    }
    console.log(
      "   ",
      String(r.degem_code).padEnd(11),
      String(r.year).padEnd(5),
      `${r.model ?? "?"} / ${r.sub_model ?? "?"}`.padEnd(34),
      String(r.drive_technology).padEnd(9),
      String(r.airbags).padEnd(7),
      String(r.doors).padEnd(5),
      String(r.co2_wltp).padEnd(8),
      String(r.safety_rating),
    );
  }

  if (!WRITE) {
    console.log(`\n[DRY RUN] nothing written — ${fill.length} rows would have their 19 spec columns filled`);
    return;
  }

  // ---------- --write: one transaction, one statement per chunk of 1,000 ----------
  const updated = await db.$transaction(async (tx) => {
    let total = 0;
    for (let i = 0; i < fill.length; i += CHUNK) {
      const chunk = fill.slice(i, i + CHUNK);
      const col = <T>(pick: (r: ModelRow) => T): T[] => chunk.map(pick);
      const flag = (f: FlagColumn): boolean[] => chunk.map((r) => r[f]);
      const n = await tx.$executeRaw`
        UPDATE "models" AS m SET
          "doors" = v.doors,
          "airbags" = v.airbags,
          "drive_technology" = v.drive_technology,
          "co2_wltp" = v.co2_wltp,
          "aeb_pedestrian_cyclist" = v.aeb_pedestrian_cyclist,
          "pedestrian_detection" = v.pedestrian_detection,
          "two_wheeler_detection" = v.two_wheeler_detection,
          "forward_collision_warning" = v.forward_collision_warning,
          "distance_monitoring" = v.distance_monitoring,
          "lane_departure_warning" = v.lane_departure_warning,
          "lane_keeping" = v.lane_keeping,
          "blind_spot_detection" = v.blind_spot_detection,
          "adaptive_cruise" = v.adaptive_cruise,
          "traffic_sign_recognition" = v.traffic_sign_recognition,
          "auto_high_beams" = v.auto_high_beams,
          "reverse_auto_braking" = v.reverse_auto_braking,
          "sunroof" = v.sunroof,
          "alloy_wheels" = v.alloy_wheels,
          "reverse_camera" = v.reverse_camera
        FROM unnest(
          ${col((r) => r.vehicle_class)}::text[],
          ${col((r) => r.degem_code)}::text[],
          ${col((r) => r.year)}::int[],
          ${col((r) => r.doors)}::int[],
          ${col((r) => r.airbags)}::int[],
          ${col((r) => r.drive_technology)}::text[],
          ${col((r) => r.co2_wltp)}::int[],
          ${flag("aeb_pedestrian_cyclist")}::boolean[],
          ${flag("pedestrian_detection")}::boolean[],
          ${flag("two_wheeler_detection")}::boolean[],
          ${flag("forward_collision_warning")}::boolean[],
          ${flag("distance_monitoring")}::boolean[],
          ${flag("lane_departure_warning")}::boolean[],
          ${flag("lane_keeping")}::boolean[],
          ${flag("blind_spot_detection")}::boolean[],
          ${flag("adaptive_cruise")}::boolean[],
          ${flag("traffic_sign_recognition")}::boolean[],
          ${flag("auto_high_beams")}::boolean[],
          ${flag("reverse_auto_braking")}::boolean[],
          ${flag("sunroof")}::boolean[],
          ${flag("alloy_wheels")}::boolean[],
          ${flag("reverse_camera")}::boolean[]
        ) AS v(
          vehicle_class, degem_code, year, doors, airbags, drive_technology, co2_wltp,
          aeb_pedestrian_cyclist, pedestrian_detection, two_wheeler_detection,
          forward_collision_warning, distance_monitoring, lane_departure_warning, lane_keeping,
          blind_spot_detection, adaptive_cruise, traffic_sign_recognition, auto_high_beams,
          reverse_auto_braking, sunroof, alloy_wheels, reverse_camera
        )
        WHERE m."vehicle_class" = v.vehicle_class AND m."degem_code" = v.degem_code AND m."year" = v.year`;
      if (n !== chunk.length) {
        throw new Error(`chunk ${i / CHUNK + 1}: expected ${chunk.length} rows updated, got ${n} — rolled back`);
      }
      total += n;
      process.stdout.write(`\r  updated ${total}/${fill.length}`);
    }
    return total;
  }, WRITE_TRANSACTION_OPTIONS);

  console.log(`\nupdated ${updated} rows (the 19 spec columns only)`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", e instanceof Error ? e.message : e);
    await db.$disconnect();
    process.exit(1);
  });
