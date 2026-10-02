// BRIEF Day 19b Run 21 §2 — WHERE A CAR IS. The eight areas, the flexible search key for a locality name,
// the spelling we store, the district-to-area table, and what a screen shows.
//
// PURE: imports nothing but types. The car page and the contact window read shownPlace() from here, so this
// file must never pull in a spreadsheet reader, node:* or the database — that is why src/lib/location/ has
// no index.ts and why the localities FILE is read in localities.ts next door, which the site never imports.
//
// The rules are findCar-now.md "המיקום — עיר ואזור": a listing has a city when the collection tool named
// one we recognise, and an area always. The FILTERS read listings.region and nothing from here; this file is
// the city's side of the story, plus the one display function that chooses between the two.

/**
 * The eight areas, exactly — the filters' region chips, the stored questions and listings.region all use
 * these spellings. The order is the order they are shown in.
 */
export const REGIONS = [
  "\u05E6\u05E4\u05D5\u05DF", // צפון
  "\u05D7\u05D9\u05E4\u05D4 \u05D5\u05D4\u05E7\u05E8\u05D9\u05D5\u05EA", // חיפה והקריות
  "\u05DE\u05E8\u05DB\u05D6", // מרכז
  "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1", // תל אביב
  "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD", // ירושלים
  "\u05D9\u05D4\u05D5\u05D3\u05D4 \u05D5\u05E9\u05D5\u05DE\u05E8\u05D5\u05DF", // יהודה ושומרון
  "\u05D3\u05E8\u05D5\u05DD", // דרום
  "\u05D0\u05D9\u05DC\u05EA", // אילת
] as const;

export type Region = (typeof REGIONS)[number];

/**
 * The hyphens and dashes a name may be written with: the ASCII hyphen, the Hebrew maqaf, and the four
 * typographic dashes plus the minus sign. A name is matched with all of them removed, so "תל אביב-יפו",
 * "תל אביב יפו" and "תל אביב - יפו" are one key.
 */
const DASHES = ["\u002D", "\u05BE", "\u2010", "\u2011", "\u2013", "\u2014", "\u2212"];

/**
 * Every geresh and gershayim form, straight and curly, single and double, plus the two accent characters
 * keyboards produce instead: "סח'נין", "סח׳נין" and "סחנין" are one key.
 */
const QUOTES = ["\u0027", "\u05F3", "\u2018", "\u2019", "\u0060", "\u00B4", "\u0022", "\u05F4", "\u201C", "\u201D"];

/**
 * THE FLEXIBLE SEARCH KEY — what a locality name is matched by, on both sides: the file's names are indexed
 * by it, and a collection-tool cell is looked up by it.
 *
 * Removed: all whitespace; every invisible format character (Unicode Cf — the LRM and RLM marks a
 * right-to-left spreadsheet is full of); every hyphen or dash form; every geresh or gershayim form; and the
 * asterisk the ministry's file marks some names with.
 *
 * LETTERS ARE UNTOUCHED. No final-letter folding, and no קריית/קרית folding: the file spells קריית, the
 * collection tool sometimes spells קרית, and whether those are one place is a product decision taken at the
 * first import against the real data — not here.
 */
export function lookupKey(name: string): string {
  let out = "";
  for (const ch of name) {
    if (/\s/u.test(ch)) continue;
    if (/\p{Cf}/u.test(ch)) continue;
    if (DASHES.includes(ch)) continue;
    if (QUOTES.includes(ch)) continue;
    if (ch === "*") continue;
    out += ch;
  }
  return out;
}

/**
 * The spelling we STORE in listings.city, from the file's official name:
 *   - the asterisk the file marks some names with is dropped;
 *   - a space before a hyphen that has no space after it closes up — "תל אביב -יפו" → "תל אביב-יפו";
 *   - a hyphen with a space on BOTH sides is left alone — "ים המלח - בתי מלון" is written that way;
 *   - and the result is trimmed.
 * Nothing else is corrected: the city a page shows is the ministry's own name for the place.
 */
export function cleanCityName(official: string): string {
  const withoutStars = official.split("*").join("");
  const closed = withoutStars.replace(/ +-(?! )/g, "-");
  return closed.trim();
}

/** The localities file's seven district values → our area names. Anything else → null: the import stops. */
const DISTRICT_REGION: Readonly<Record<string, Region>> = {
  // הצפון → צפון
  "\u05D4\u05E6\u05E4\u05D5\u05DF": "\u05E6\u05E4\u05D5\u05DF",
  // חיפה → חיפה והקריות
  "\u05D7\u05D9\u05E4\u05D4": "\u05D7\u05D9\u05E4\u05D4 \u05D5\u05D4\u05E7\u05E8\u05D9\u05D5\u05EA",
  // המרכז → מרכז
  "\u05D4\u05DE\u05E8\u05DB\u05D6": "\u05DE\u05E8\u05DB\u05D6",
  // תל אביב → תל אביב
  "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1": "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1",
  // ירושלים → ירושלים
  "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD": "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD",
  // הדרום → דרום
  "\u05D4\u05D3\u05E8\u05D5\u05DD": "\u05D3\u05E8\u05D5\u05DD",
  // יהודה והשומרון → יהודה ושומרון
  "\u05D9\u05D4\u05D5\u05D3\u05D4 \u05D5\u05D4\u05E9\u05D5\u05DE\u05E8\u05D5\u05DF": "\u05D9\u05D4\u05D5\u05D3\u05D4 \u05D5\u05E9\u05D5\u05DE\u05E8\u05D5\u05DF",
};

/** The district column of the localities file → our area. Trimmed and exact; an unknown value → null. */
export function regionOfDistrict(district: string): Region | null {
  return DISTRICT_REGION[district.trim()] ?? null;
}

/**
 * The area of a locality. THE ONE EXCEPTION FIRST: אילת is its own area on our site and sits in the הדרום
 * district in the file, so the city decides before the district is even read. Every other locality takes
 * its district's area.
 */
export function regionOf(cleanCity: string, district: string): Region | null {
  // אילת
  if (cleanCity.trim() === "\u05D0\u05D9\u05DC\u05EA") return "\u05D0\u05D9\u05DC\u05EA";
  return regionOfDistrict(district);
}

/** One row of the localities file, as we keep it. `city` is already the stored spelling. */
export type Locality = { code: string; city: string; region: Region };

/** The localities, by lookupKey() of the FILE's name — built in localities.ts, read here. */
export type LocalityIndex = ReadonlyMap<string, Locality>;

/** What resolvePlace() returns: a place, or the reason there is none, with what was written. */
export type PlaceResolution =
  | { ok: true; city: string | null; region: Region }
  | { ok: false; reason: "empty" | "unknown_city"; written: string };

/**
 * A collection-tool location cell → the city and the area to store.
 *
 * THE ORDER IS THE RULE. The city is tried BEFORE the area list, because ירושלים and אילת are each both a
 * city and an area: a row that says "ירושלים" is a car in Jerusalem and keeps its city. Only a cell that is
 * no locality we know and IS one of the eight areas is an old manual row — the area, no city.
 *
 * An unknown city is never guessed at and never silently dropped: it comes back as a reason, with the cell
 * as written, for the import's alert list.
 */
export function resolvePlace(cell: string | null, index: LocalityIndex): PlaceResolution {
  const written = (cell ?? "").trim();
  if (written === "") return { ok: false, reason: "empty", written: "" };

  const hit = index.get(lookupKey(written));
  if (hit !== undefined) return { ok: true, city: hit.city, region: hit.region };

  const asRegion = REGIONS.find((r) => r === written);
  if (asRegion !== undefined) return { ok: true, city: null, region: asRegion };

  return { ok: false, reason: "unknown_city", written };
}

/**
 * WHAT A SCREEN SHOWS of where the car is — the car page's place line and the contact window's car line:
 * the city when there is one, else the area, else nothing at all.
 *
 * The value comes back AS STORED: no trimming, no correction. A page shows what the database holds; the
 * spelling was decided when the row was written.
 */
export function shownPlace(city: string | null, region: string | null): string | null {
  if (city !== null && city.trim() !== "") return city;
  if (region !== null && region.trim() !== "") return region;
  return null;
}
