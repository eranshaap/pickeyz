// Day 18 (§3.2, §9): colour families — the ad's word (cars.color) and the registry's word
// (cars.registry_color = tzeva_rechev) mapped to one family code, so the two can be compared.
//
// Families: white | black | grey | blue | red | green | brown | yellow | other.
//   silver is inside grey; gold / beige / champagne inside brown; orange inside yellow; bordeaux inside red;
//   purple / pink / turquoise -> other.
// Every spelling is its own entry, looked up after the same clean() as translator.ts. A word that is not
// in the dictionary is null — the unknown side of a comparison, never a throw (§3.2): the score run prints
// every such word with its count, and the dictionary grows by decision, not by guessing.

import { clean } from "./translator";

export type ColorFamily = "white" | "black" | "grey" | "blue" | "red" | "green" | "brown" | "yellow" | "other";

const FAMILY: Record<string, ColorFamily> = {
  // registry words (tzeva_rechev)
  "שנהב לבן": "white",
  "שחור": "black", // also an ad word
  "שחור מטלי": "black",
  "כסף": "grey",
  "כסף מטלי": "grey",
  "כסוף כהה": "grey",
  "אפור": "grey", // also an ad word
  "אפור כהה מטלי": "grey",
  "כחול": "blue", // also an ad word
  "כחול מטל": "blue",
  "זהוב": "brown",
  // ad words (cars.color)
  "לבן": "white",
  "שחור מטאלי": "black",
  "כסוף": "grey",
  "כסוף מטאלי": "grey",
  "כסף מטאלי": "grey",
  "אפור מטאלי": "grey",
  "אפור עכבר": "grey",
  "כחול מטאלי": "blue",
};

/** The family of a colour word, or null when the word is null, empty or not in the dictionary. */
export function colorFamily(word: string | null | undefined): ColorFamily | null {
  if (word === null || word === undefined) return null;
  const key = clean(word);
  if (key === "" || !Object.hasOwn(FAMILY, key)) return null;
  return FAMILY[key];
}
