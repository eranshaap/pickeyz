// scripts/check-plates.ts
// Dry-run: for each plate, query the MOT registry + history files
// and print what the import would derive. No database writes.
// For the first plate only, also print the exact field names of every file.

const RESOURCES = {
  registry: "053cea08-09bc-40ec-8f7a-156f0677aff3",
  history1: "56063a99-8a3e-4ff4-912e-5966c0279bad",
  history2: "bb2355dc-9ec7-4f06-9c3f-3344672171da",
  cancelled: "851ecab1-0622-4dbe-a6c7-f950cf82abf9",
} as const;

const PLATES = [
  "67664002", // dealer ad, hand 1 declared
  "45324202", // private, hand 2
  "74294402", // the price/km-swap car, hand 1 declared, hatchback
  "69321102", // the no-price ad
  "74306802", // hand 3 declared, two dealer parkings
];

async function q(resource: string, plate: string) {
  const url =
    `https://data.gov.il/api/3/action/datastore_search` +
    `?resource_id=${resource}&filters=${encodeURIComponent(JSON.stringify({ mispar_rechev: plate }))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${resource}: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`${resource}: API success=false`);
  return data.result.records as any[];
}

function fields(label: string, rec: any) {
  if (rec) console.log(`${label} FIELDS:`, Object.keys(rec).join(", "));
}

async function checkPlate(plate: string, first: boolean) {
  console.log(`\n===== ${plate} =====`);

  // --- active registry ---
  const reg = await q(RESOURCES.registry, plate);
  if (reg.length === 0) {
    const cancelled = await q(RESOURCES.cancelled, plate);
    console.log(cancelled.length ? "CANCELLED registry hit" : "NOT FOUND in active registry");
    return;
  }
  const r = reg[0];
  if (first) fields("REGISTRY", r);
  console.log("degem_code:", `${r.tozeret_cd}-${r.degem_cd}`, "| degem_nm:", r.degem_nm, "| sug_degem:", r.sug_degem);
  console.log("shnat_yitzur:", r.shnat_yitzur, "| kinuy_mishari:", r.kinuy_mishari, "| ramat_gimur:", r.ramat_gimur);
  console.log("moed_aliya_lakvish:", r.moed_aliya_lakvish, "| baalut (current):", r.baalut, "| tzeva:", r.tzeva_rechev);
  console.log("tokef_dt:", r.tokef_dt, "| mivchan_acharon_dt:", r.mivchan_acharon_dt, "| horaat_rishum:", r.horaat_rishum);

  // --- history 1: first registration, km, change indicators ---
  const h1 = await q(RESOURCES.history1, plate);
  if (first) fields("HISTORY1", h1[0]);
  console.log("history1 rows:", h1.length);
  if (h1[0]) console.log("history1 record:", JSON.stringify(h1[0]));

  // --- history 2: ownership rows ---
  const h2 = await q(RESOURCES.history2, plate);
  if (first) fields("HISTORY2", h2[0]);
  if (h2[0]) console.log("history2 first record:", JSON.stringify(h2[0]));
  const owners = h2.map((x) => `${x.baalut_dt ?? x.shnui_baalut_dt ?? "?"}:${x.baalut ?? x.sug_baalut ?? "?"}`);
  console.log("history2 rows:", h2.length, "| ownership:", owners.join(" → "));
  const hand = h2.filter((x) => !String(x.baalut ?? x.sug_baalut ?? "").includes("סוחר")).length;
  console.log("derived hand:", hand);
}

async function main() {
  for (let i = 0; i < PLATES.length; i++) {
    try {
      await checkPlate(PLATES[i], i === 0);
    } catch (e) {
      console.log("ERROR:", (e as Error).message);
    }
  }
}

main();