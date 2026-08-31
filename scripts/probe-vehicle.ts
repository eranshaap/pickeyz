import { getVehicleData } from "../src/lib/mot/vehicle";

const plate = process.argv[2];
if (!plate) {
  console.log("usage: npx tsx scripts/probe-vehicle.ts <plate>");
  process.exit(1);
}

getVehicleData(plate)
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => {
    console.error("FAILED:", (e as Error).message);
    process.exit(1);
  });