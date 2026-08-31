import { dealerStats, getDealerData } from "../src/lib/mot/dealers";

console.log(dealerStats());
for (const name of ["אזולאי עודד", "כהן נסים", "אוטו כהן חולון"]) {
  console.log(name, "→", getDealerData(name));
}