// BRIEF Day 19b Run 21 §2 — the location rules. Pure: no file, no database, no clock.
//
// EVERY NON-ASCII MARK IS A \uXXXX ESCAPE, so each test says which character it means: the difference
// between a geresh and an apostrophe, or between a maqaf and a hyphen, is the whole point of lookupKey()
// and is invisible when the characters are pasted in.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanCityName,
  lookupKey,
  REGIONS,
  regionOf,
  regionOfDistrict,
  resolvePlace,
  shownPlace,
  type Locality,
  type LocalityIndex,
  type Region,
} from "./place";

// --- the names this file speaks about ---------------------------------------
const NETANYA = "\u05E0\u05EA\u05E0\u05D9\u05D4"; // נתניה
const SAKHNIN_APOSTROPHE = "\u05E1\u05D7\u0027\u05E0\u05D9\u05DF"; // סח'נין, with U+0027
const SAKHNIN_GERESH = "\u05E1\u05D7\u05F3\u05E0\u05D9\u05DF"; // סח׳נין, with U+05F3
const YAFO = "\u05D9\u05E4\u05D5"; // יפו
const TEL_AVIV = "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1"; // תל אביב
const TEL_AVIV_YAFO_FILE = "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1 -\u05D9\u05E4\u05D5"; // תל אביב -יפו, as the file writes it
const TEL_AVIV_YAFO_STORED = "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1-\u05D9\u05E4\u05D5"; // תל אביב-יפו, as we store it
const JERUSALEM = "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD"; // ירושלים
const EILAT = "\u05D0\u05D9\u05DC\u05EA"; // אילת
const BEER_SHEVA = "\u05D1\u05D0\u05E8 \u05E9\u05D1\u05E2"; // באר שבע
const SHARON = "\u05E9\u05E8\u05D5\u05DF"; // שרון — an area name that is not one of the eight
const DEAD_SEA_HOTELS = "\u05D9\u05DD \u05D4\u05DE\u05DC\u05D7 - \u05D1\u05EA\u05D9 \u05DE\u05DC\u05D5\u05DF"; // ים המלח - בתי מלון
const KIRYAT_LONG = "\u05E7\u05E8\u05D9\u05D9\u05EA"; // קריית, the file's spelling
const KIRYAT_SHORT = "\u05E7\u05E8\u05D9\u05EA"; // קרית, the collection tool's

// --- the eight areas --------------------------------------------------------
const NORTH: Region = "\u05E6\u05E4\u05D5\u05DF"; // צפון
const HAIFA_REGION: Region = "\u05D7\u05D9\u05E4\u05D4 \u05D5\u05D4\u05E7\u05E8\u05D9\u05D5\u05EA"; // חיפה והקריות
const CENTER: Region = "\u05DE\u05E8\u05DB\u05D6"; // מרכז
const TEL_AVIV_REGION: Region = "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1"; // תל אביב
const JERUSALEM_REGION: Region = "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD"; // ירושלים
const JUDEA: Region = "\u05D9\u05D4\u05D5\u05D3\u05D4 \u05D5\u05E9\u05D5\u05DE\u05E8\u05D5\u05DF"; // יהודה ושומרון
const SOUTH: Region = "\u05D3\u05E8\u05D5\u05DD"; // דרום
const EILAT_REGION: Region = "\u05D0\u05D9\u05DC\u05EA"; // אילת

// --- the file's seven district values ---------------------------------------
const D_NORTH = "\u05D4\u05E6\u05E4\u05D5\u05DF"; // הצפון
const D_HAIFA = "\u05D7\u05D9\u05E4\u05D4"; // חיפה
const D_CENTER = "\u05D4\u05DE\u05E8\u05DB\u05D6"; // המרכז
const D_TEL_AVIV = "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1"; // תל אביב
const D_JERUSALEM = "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD"; // ירושלים
const D_SOUTH = "\u05D4\u05D3\u05E8\u05D5\u05DD"; // הדרום
const D_JUDEA = "\u05D9\u05D4\u05D5\u05D3\u05D4 \u05D5\u05D4\u05E9\u05D5\u05DE\u05E8\u05D5\u05DF"; // יהודה והשומרון

describe("REGIONS (§2)", () => {
  it("is the eight areas, in their order", () => {
    assert.deepEqual([...REGIONS], [NORTH, HAIFA_REGION, CENTER, TEL_AVIV_REGION, JERUSALEM_REGION, JUDEA, SOUTH, EILAT_REGION]);
  });
});

describe("lookupKey (§2)", () => {
  it("removes every whitespace character", () => {
    assert.equal(lookupKey(`  ${TEL_AVIV}\t\n`), "\u05EA\u05DC\u05D0\u05D1\u05D9\u05D1"); // תלאביב
    assert.equal(lookupKey("a\u00A0b"), "ab"); // U+00A0, the no-break space
  });

  it("removes the invisible format characters (Cf) a right-to-left sheet is full of", () => {
    assert.equal(lookupKey(`\u200E${NETANYA}\u200F`), NETANYA); // LRM, RLM
    assert.equal(lookupKey(`${NETANYA}\u061C`), NETANYA); // ALM
  });

  it("removes every hyphen and dash form", () => {
    const bare = "\u05EA\u05DC\u05D0\u05D1\u05D9\u05D1\u05D9\u05E4\u05D5"; // תלאביביפו
    for (const dash of ["\u002D", "\u05BE", "\u2010", "\u2011", "\u2013", "\u2014", "\u2212"]) {
      assert.equal(lookupKey(`${TEL_AVIV}${dash}${YAFO}`), bare, dash);
    }
  });

  it("removes every geresh and gershayim form", () => {
    const bare = "\u05E1\u05D7\u05E0\u05D9\u05DF"; // סחנין
    for (const mark of ["\u0027", "\u05F3", "\u2018", "\u2019", "\u0060", "\u00B4", "\u0022", "\u05F4", "\u201C", "\u201D"]) {
      assert.equal(lookupKey(`\u05E1\u05D7${mark}\u05E0\u05D9\u05DF`), bare, mark);
    }
  });

  it("removes the asterisk the ministry's file marks names with", () => {
    assert.equal(lookupKey(`${NETANYA}*`), NETANYA);
  });

  it("leaves the LETTERS alone: no final-letter folding, no \u05E7\u05E8\u05D9\u05D9\u05EA / \u05E7\u05E8\u05D9\u05EA folding", () => {
    assert.notEqual(lookupKey(KIRYAT_LONG), lookupKey(KIRYAT_SHORT)); // קריית is not קרית
    assert.notEqual(lookupKey("\u05E0\u05D9\u05DF"), lookupKey("\u05E0\u05D9\u05E0")); // נין is not נינ
    assert.equal(lookupKey(NETANYA), NETANYA);
  });
});

describe("cleanCityName (§2)", () => {
  it("drops the asterisk", () => {
    assert.equal(cleanCityName(`${NETANYA}*`), NETANYA);
    assert.equal(cleanCityName(`*${NETANYA}`), NETANYA);
  });

  it("closes a space before a hyphen that has no space after it", () => {
    assert.equal(cleanCityName(TEL_AVIV_YAFO_FILE), TEL_AVIV_YAFO_STORED);
  });

  it("keeps a hyphen that has a space on BOTH sides", () => {
    assert.equal(cleanCityName(DEAD_SEA_HOTELS), DEAD_SEA_HOTELS);
  });

  it("a plain name comes back trimmed and otherwise untouched", () => {
    assert.equal(cleanCityName(`  ${NETANYA} `), NETANYA);
    assert.equal(cleanCityName(TEL_AVIV), TEL_AVIV);
  });
});

describe("regionOfDistrict (§2)", () => {
  it("the file's seven district values", () => {
    assert.equal(regionOfDistrict(D_NORTH), NORTH);
    assert.equal(regionOfDistrict(D_HAIFA), HAIFA_REGION);
    assert.equal(regionOfDistrict(D_CENTER), CENTER);
    assert.equal(regionOfDistrict(D_TEL_AVIV), TEL_AVIV_REGION);
    assert.equal(regionOfDistrict(D_JERUSALEM), JERUSALEM_REGION);
    assert.equal(regionOfDistrict(D_SOUTH), SOUTH);
    assert.equal(regionOfDistrict(D_JUDEA), JUDEA);
  });

  it("is trimmed and exact; anything else is null", () => {
    assert.equal(regionOfDistrict(`  ${D_SOUTH}  `), SOUTH);
    assert.equal(regionOfDistrict(SOUTH), null); // דרום is OUR name for the area, not the file's
    assert.equal(regionOfDistrict(""), null);
  });
});

describe("regionOf (§2)", () => {
  it("\u05D0\u05D9\u05DC\u05EA is its own area, whatever its district says", () => {
    assert.equal(regionOf(EILAT, D_SOUTH), EILAT_REGION);
  });

  it("every other locality takes its district's area", () => {
    assert.equal(regionOf(BEER_SHEVA, D_SOUTH), SOUTH);
    assert.equal(regionOf(NETANYA, D_CENTER), CENTER);
  });

  it("an unknown district is null", () => {
    assert.equal(regionOf(NETANYA, SHARON), null);
  });
});

/** The five localities of §2, keyed the way localities.ts keys them: by the FILE's name. */
function indexOf(rows: readonly { name: string; code: string; city: string; region: Region }[]): LocalityIndex {
  const map = new Map<string, Locality>();
  for (const r of rows) map.set(lookupKey(r.name), { code: r.code, city: r.city, region: r.region });
  return map;
}

const INDEX = indexOf([
  { name: NETANYA, code: "7400", city: NETANYA, region: CENTER },
  { name: SAKHNIN_APOSTROPHE, code: "0469", city: SAKHNIN_APOSTROPHE, region: NORTH },
  { name: TEL_AVIV_YAFO_FILE, code: "5000", city: TEL_AVIV_YAFO_STORED, region: TEL_AVIV_REGION },
  { name: JERUSALEM, code: "3000", city: JERUSALEM, region: JERUSALEM_REGION },
  { name: EILAT, code: "2600", city: EILAT, region: EILAT_REGION },
]);

describe("resolvePlace (§2)", () => {
  it("a locality, with or without surrounding spaces", () => {
    assert.deepEqual(resolvePlace(NETANYA, INDEX), { ok: true, city: NETANYA, region: CENTER });
    assert.deepEqual(resolvePlace(`  ${NETANYA}  `, INDEX), { ok: true, city: NETANYA, region: CENTER });
  });

  it("a geresh (U+05F3) where the file has an apostrophe (U+0027) is the same locality", () => {
    assert.deepEqual(resolvePlace(SAKHNIN_GERESH, INDEX), { ok: true, city: SAKHNIN_APOSTROPHE, region: NORTH });
  });

  it("the hyphen may be written any way, or left out, and the STORED spelling comes back", () => {
    assert.deepEqual(resolvePlace(`${TEL_AVIV} - ${YAFO}`, INDEX), { ok: true, city: TEL_AVIV_YAFO_STORED, region: TEL_AVIV_REGION });
    assert.deepEqual(resolvePlace(`${TEL_AVIV} ${YAFO}`, INDEX), { ok: true, city: TEL_AVIV_YAFO_STORED, region: TEL_AVIV_REGION });
  });

  it("THE CITY FIRST: \u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD is both a city and an area, and keeps its city", () => {
    assert.deepEqual(resolvePlace(JERUSALEM, INDEX), { ok: true, city: JERUSALEM, region: JERUSALEM_REGION });
    assert.deepEqual(resolvePlace(EILAT, INDEX), { ok: true, city: EILAT, region: EILAT_REGION });
  });

  it("an area that is no locality is an old manual row: the area, no city", () => {
    assert.deepEqual(resolvePlace(TEL_AVIV, INDEX), { ok: true, city: null, region: TEL_AVIV_REGION });
    assert.deepEqual(resolvePlace(CENTER, INDEX), { ok: true, city: null, region: CENTER });
  });

  it("neither a locality nor an area is unknown_city, with the cell as written", () => {
    assert.deepEqual(resolvePlace(SHARON, INDEX), { ok: false, reason: "unknown_city", written: SHARON });
    assert.deepEqual(resolvePlace(`  ${SHARON} `, INDEX), { ok: false, reason: "unknown_city", written: SHARON });
  });

  it("an empty cell is empty, however it is empty", () => {
    assert.deepEqual(resolvePlace("", INDEX), { ok: false, reason: "empty", written: "" });
    assert.deepEqual(resolvePlace("   ", INDEX), { ok: false, reason: "empty", written: "" });
    assert.deepEqual(resolvePlace(null, INDEX), { ok: false, reason: "empty", written: "" });
  });
});

describe("shownPlace (§2)", () => {
  it("the city wins when there is one", () => {
    assert.equal(shownPlace(NETANYA, CENTER), NETANYA);
  });

  it("a null city shows the area", () => {
    assert.equal(shownPlace(null, CENTER), CENTER);
  });

  it("a blank city shows the area", () => {
    assert.equal(shownPlace("", CENTER), CENTER);
    assert.equal(shownPlace("   ", CENTER), CENTER);
  });

  it("neither one is null — the line is not drawn at all", () => {
    assert.equal(shownPlace(null, null), null);
    assert.equal(shownPlace("", ""), null);
    assert.equal(shownPlace("  ", null), null);
  });

  it("the value comes back AS STORED, never trimmed or corrected", () => {
    assert.equal(shownPlace(` ${NETANYA} `, CENTER), ` ${NETANYA} `);
    assert.equal(shownPlace(null, ` ${CENTER} `), ` ${CENTER} `);
  });
});
