// scripts/backfill-owners-at-first-seen.ts
// One-time backfill (BRIEF Day 11, §12). For every listing with owners_at_first_seen IS NULL, set it to
// the current ownership_history.length of its car; a null history leaves it null. Justification: no
// car's history has been refreshed since import, so the current record is the record at first sight.
// `--dry-run` counts and writes nothing. Prints how many rows were updated.

import "dotenv/config";
import { db } from "@/lib/db";
import { parseOwnershipHistory } from "@/lib/scoring-input";

const DRY = process.argv.includes("--dry-run");

async function main() {
  const listings = await db.listings.findMany({
    where: { owners_at_first_seen: null },
    select: { id: true, car: { select: { license_plate: true, ownership_history: true } } },
    orderBy: { id: "asc" },
  });
  const total = await db.listings.count();
  console.log(`${DRY ? "[DRY RUN] " : ""}backfill-owners-at-first-seen: ${total} listings, ${listings.length} with owners_at_first_seen null`);

  // Validate every history before writing anything (fail loudly, write nothing).
  const updates: { id: number; owners: number }[] = [];
  let nullHistory = 0;
  for (const l of listings) {
    const rows = parseOwnershipHistory(l.car.ownership_history, l.car.license_plate ?? "?");
    if (rows === null) nullHistory++;
    else updates.push({ id: l.id, owners: rows.length });
  }
  console.log(`to update: ${updates.length}; left null (car has no history): ${nullHistory}`);
  if (DRY) {
    console.log("[DRY RUN] nothing written");
    return;
  }
  // One statement, one round trip: all rows or none. (78 separate updates over the pooler exceed
  // Prisma's 5 s transaction cap, in both the interactive and the batched form.)
  const ids = updates.map((u) => u.id);
  const owners = updates.map((u) => u.owners);
  const updated = await db.$executeRaw`
    UPDATE "listings" AS l SET "owners_at_first_seen" = v.owners
    FROM unnest(${ids}::int[], ${owners}::int[]) AS v(id, owners)
    WHERE l."id" = v.id AND l."owners_at_first_seen" IS NULL`;
  console.log(`updated ${updated} rows`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
