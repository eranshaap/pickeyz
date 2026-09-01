import { loadCatalog } from "../src/lib/mot/catalog";
import { makeDegemCode } from "../src/lib/mot/degem-code";

const codes = process.argv.slice(2);
if (codes.length < 2) {
  console.log("usage: npx tsx scripts/probe-diff.ts 588-342 588-353 588-364");
  process.exit(1);
}

const all = loadCatalog();
const byCode = new Map<string, Record<string, string>[]>();
let broken = 0;

for (const r of all) {
  let c: string | null;
  try {
    c = makeDegemCode(r.tozeret_cd, r.degem_cd);
  } catch {
    broken++;
    continue;
  }
  if (c && codes.includes(c)) {
    if (!byCode.has(c)) byCode.set(c, []);
    byCode.get(c)!.push(r as unknown as Record<string, string>);
  }
}
if (broken) console.log("catalog rows with half a pair, skipped:", broken);

const yearSets = codes.map((c) => new Set((byCode.get(c) ?? []).map((r) => r.shnat_yitzur)));
const common = [...(yearSets[0] ?? [])].find((y) => yearSets.every((s) => s.has(y)));
const reps = codes.map((c) => {
  const rows = byCode.get(c);
  if (!rows?.length) throw new Error(`code not found in catalog: ${c}`);
  return (common ? rows.find((r) => r.shnat_yitzur === common) : rows[0])!;
});

console.log(`comparing ${codes.join("  ")} at year ${common ?? "(none common)"}\n`);
const fields = Object.keys(reps[0]);
let diffs = 0;
for (const f of fields) {
  const values = reps.map((r) => r[f] ?? "");
  if (new Set(values).size > 1) {
    diffs++;
    console.log(f.padEnd(45), values.join("  |  "));
  }
}
console.log(`\ncolumns that differ: ${diffs}/${fields.length}`);