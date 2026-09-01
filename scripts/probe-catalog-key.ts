import { loadCatalog } from "../src/lib/mot/catalog";
import { makeDegemCode } from "../src/lib/mot/degem-code";

type Row = ReturnType<typeof loadCatalog>[number] & { sug_degem?: string };
const all = loadCatalog() as Row[];

function conflicts(name: string, extra: (r: Row) => string) {
  const seen = new Map<string, Set<string>>();
  for (const r of all) {
    const code = makeDegemCode(r.tozeret_cd, r.degem_cd);
    if (!code) continue;
    const spec = [r.tozar, r.kinuy_mishari, r.merkav, r.nefah_manoa, r.koah_sus].join("~");
    const k = `${extra(r)}|${code}|${r.shnat_yitzur}`;
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k)!.add(spec);
  }
  const bad = [...seen.entries()].filter(([, s]) => s.size > 1);
  console.log(name.padEnd(42), "keys:", seen.size, " conflicts:", bad.length);
  return bad;
}

conflicts("pair + year", () => "");
const remaining = conflicts("sug_degem + pair + year", (r) => r.sug_degem ?? "");
conflicts("sug_degem + pair + year + degem_nm", (r) => `${r.sug_degem ?? ""}|${r.degem_nm ?? ""}`);

console.log("\nsug_degem values:", [...new Set(all.map((r) => r.sug_degem ?? ""))]);
console.log("\nconflicts left after sug_degem (sample):");
for (const [k, s] of remaining.slice(0, 10)) console.log(" ", k, [...s]);