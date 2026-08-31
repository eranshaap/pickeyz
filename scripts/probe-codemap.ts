import { loadCatalog } from "../src/lib/mot/catalog";
import { makeDegemCode } from "../src/lib/mot/degem-code";

const all = loadCatalog();
console.log("catalog rows:", all.length);

// Gen 4 Mazda 3: factory designation starts with BP, Mazda rows only.
// tozeret_cd is zero-padded here ("00588") but numeric in the API (588);
// makeDegemCode normalizes both to the same pair, so we filter by name, not by code.
const gen4 = all.filter((r) => r.degem_nm.startsWith("BP") && r.tozeret_nm.includes("מזדה"));
console.log("gen-4 rows:", gen4.length, "\n");

const groups = new Map<string, typeof gen4>();
for (const r of gen4) {
  const code = makeDegemCode(r.tozeret_cd, r.degem_cd)!;
  if (!groups.has(code)) groups.set(code, []);
  groups.get(code)!.push(r);
}

console.log("distinct pair codes:", groups.size, "\n");
console.log("code | years | degem_nm | trim | kinuy | body | cc | hp | seats | auto | horaat");
for (const [code, rs] of [...groups.entries()].sort()) {
  const u = (f: (r: (typeof rs)[0]) => string) => [...new Set(rs.map(f))].join(",");
  console.log(
    code.padEnd(9),
    "|", u((r) => r.shnat_yitzur).padEnd(20),
    "|", u((r) => r.degem_nm),
    "|", u((r) => r.ramat_gimur),
    "|", u((r) => r.kinuy_mishari),
    "|", u((r) => r.merkav),
    "|", u((r) => r.nefah_manoa),
    "|", u((r) => r.koah_sus),
    "|", u((r) => r.mispar_moshavim),
    "|", u((r) => r.automatic_ind),
    "|", u((r) => r.horaat_rishum ?? "-"),
  );
}

// The decisive question for decision 10: inside one pair, does anything vary besides the year?
let mixed = 0;
for (const [code, rs] of groups) {
  const spec = (r: (typeof rs)[0]) =>
    [r.degem_nm, r.ramat_gimur, r.kinuy_mishari, r.merkav, r.nefah_manoa, r.koah_sus, r.mispar_moshavim, r.automatic_ind].join("~");
  if (new Set(rs.map(spec)).size > 1) {
    mixed++;
    console.log("\nMIXED SPEC inside", code, [...new Set(rs.map(spec))]);
  }
}
console.log(`\npairs with mixed spec beyond year: ${mixed}/${groups.size}`);