import { loadCatalog } from "../src/lib/mot/catalog";

const all = loadCatalog();

// How does tozeret_cd for Mazda actually look?
const mazda = all.filter((r) => r.tozeret_nm.includes("מזדה"));
console.log("rows with tozeret_nm containing מזדה:", mazda.length);
console.log("distinct tozeret_cd values there:", [...new Set(mazda.map((r) => JSON.stringify(r.tozeret_cd)))]);

// And one full row, values as parsed:
const one = mazda.find((r) => r.degem_nm.includes("BP")) ?? mazda[0];
console.log("\nsample row:", JSON.stringify({
  tozeret_cd: one?.tozeret_cd,
  degem_cd: one?.degem_cd,
  degem_nm: one?.degem_nm,
  shnat_yitzur: one?.shnat_yitzur,
  ramat_gimur: one?.ramat_gimur,
  kinuy: (one as Record<string, string> | undefined)?.["kinuy_mishari"],
}, null, 2));