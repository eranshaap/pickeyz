import { samplePlates } from "../src/lib/mot/fetch";
import { getVehicleData } from "../src/lib/mot/vehicle";

const year = Number(process.argv[2] ?? 2020);

async function main() {
  const plates = await samplePlates({ tozeret_cd: 588, shnat_yitzur: year }, 30);
  console.log(`sampled ${plates.length} Mazda plates, year ${year}\n`);

  let km = 0, hist = 0, handKnown = 0;
  const origins = new Map<string, number>();

  for (const plate of plates) {
    const r = await getVehicleData(plate);
    if (r.status !== "active") {
      console.log(plate, r.status);
      continue;
    }
    const d = r.data;
    if (d.km_at_last_test !== null) km++;
    if (d.ownership_history.length > 0) hist++;
    if (d.hand !== null) handKnown++;
    if (d.origin) origins.set(d.origin, (origins.get(d.origin) ?? 0) + 1);
    console.log(plate, "hand:", d.hand, "km:", d.km_at_last_test, "origin:", d.origin);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  console.log(`\nhistory-1 (km):       ${km}/${plates.length}`);
  console.log(`history-2 (ownership): ${hist}/${plates.length}`);
  console.log(`hand known:            ${handKnown}/${plates.length}`);
  console.log("origins:", Object.fromEntries(origins));
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message);
  process.exit(1);
});