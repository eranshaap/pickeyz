// Opening screen, F2 — the data of the review sheet (BRIEF §10.2). The ONLY file of src/lib/families
// that holds Hebrew letters: the catalog's make spellings, the sheet's tab names and headers, the yes-word.
// Every key and value is written in the compared form (makeKey in sheet.ts): trimmed, one space per
// whitespace run, the apostrophe U+0027 as the catalog writes it.

// (a) Catalog make spelling -> canonical catalog spelling (findCar-plan.md (ד), "איחוד יצרנים לפני הרף").
export const MAKE_MERGES: Record<string, string> = {
  "אודי": "אאודי",
  "דאציה": "דאצ'יה",
  "מרצדס בנץ": "מרצדס",
  "רובר": "לנדרובר",
  "ניאו": "ניאו רכב",
  "ג'יי.אמ.סי": "ג'י.אמ.סי",
  "קיי גי מוביליט": "סאנגיונג",
  "מרוטי סוזוקי": "סוזוקי",
};

export type MakeEntry = {
  /** The make's English name; fills the sheet's English-name columns (Eran corrects it in the review). */
  english: string;
  /** Words stripped from the START of a model name by the automatic merge (merge.ts tries the longest first). */
  prefixes: string[];
};

// (b) Canonical catalog spelling -> its English name and its model-name prefixes.
export const MAKES: Record<string, MakeEntry> = {
  "יונדאי": { english: "HYUNDAI", prefixes: ["HYUNDAI", "GENESIS"] },
  "טויוטה": { english: "TOYOTA", prefixes: ["TOYOTA"] },
  "קיה": { english: "KIA", prefixes: ["KIA"] },
  "סקודה": { english: "SKODA", prefixes: ["SKODA"] },
  "מזדה": { english: "MAZDA", prefixes: ["MAZDA"] },
  "מיצובישי": { english: "MITSUBISHI", prefixes: ["MITSUBISHI"] },
  "סוזוקי": { english: "SUZUKI", prefixes: ["MARUTI SUZUKI", "SUZUKI", "MARUTI"] },
  "ניסאן": { english: "NISSAN", prefixes: ["NISSAN", "INFINITI"] },
  "סיאט": { english: "SEAT", prefixes: ["SEAT", "CUPRA"] },
  "צ'רי": { english: "CHERY", prefixes: ["CHERY"] },
  "רנו": { english: "RENAULT", prefixes: ["RENAULT"] },
  "בי ווי די": { english: "BYD", prefixes: ["BYD"] },
  "סובארו": { english: "SUBARU", prefixes: ["SUBARU"] },
  "פיג'ו": { english: "PEUGEOT", prefixes: ["PEUGEOT"] },
  "שברולט": { english: "CHEVROLET", prefixes: ["CHEVROLET", "CHEVY"] },
  "פולקסווגן": { english: "VOLKSWAGEN", prefixes: ["VOLKSWAGEN", "VW"] },
  "מרצדס": { english: "MERCEDES", prefixes: ["MERCEDES-BENZ", "MERCEDES BENZ", "MERCEDES-AMG", "MERCEDES", "AMG", "MB"] },
  "ג'אקו": { english: "JAECOO", prefixes: ["JAECOO"] },
  "מ.ג": { english: "MG", prefixes: ["MG"] },
  "ב מ וו": { english: "BMW", prefixes: ["BMW", "MINI"] },
  "הונדה": { english: "HONDA", prefixes: ["HONDA"] },
  "טסלה": { english: "TESLA", prefixes: ["TESLA"] },
  "אאודי": { english: "AUDI", prefixes: ["AUDI"] },
  "סיטרואן": { english: "CITROEN", prefixes: ["CITROEN"] },
  "דאצ'יה": { english: "DACIA", prefixes: ["DACIA"] },
  "גילי": { english: "GEELY", prefixes: ["GEELY"] },
  "אופל": { english: "OPEL", prefixes: ["OPEL"] },
  "לקסוס": { english: "LEXUS", prefixes: ["LEXUS"] },
  "וולבו": { english: "VOLVO", prefixes: ["VOLVO"] },
  "פורד": { english: "FORD", prefixes: ["FORD", "LINCOLN"] },
  "אקספנג": { english: "XPENG", prefixes: ["XPENG"] },
  "פיאט": { english: "FIAT", prefixes: ["FIAT"] },
  "ג'יפ": { english: "JEEP", prefixes: ["JEEP"] },
  "לנדרובר": { english: "LAND ROVER", prefixes: ["LAND ROVER", "LANDROVER", "RANGE ROVER", "RANGE R.", "R.ROVER", "R ROVER"] },
  "קרייזלר": { english: "CHRYSLER", prefixes: ["CHRYSLER", "JEEP", "DODGE"] },
  "סאנגיונג": { english: "SSANGYONG", prefixes: ["SSANGYONG", "KGM"] },
  "לינק אנד קו": { english: "LYNK & CO", prefixes: ["LYNK AND CO", "LYNK & CO", "LYNK&CO", "LYNKCO", "LYNK"] },
  "זיקר": { english: "ZEEKR", prefixes: ["ZEEKR"] },
  "דיפאל": { english: "DEEPAL", prefixes: ["DEEPAL"] },
  "אומודה": { english: "OMODA", prefixes: ["OMODA"] },
  "אורה": { english: "ORA", prefixes: ["GWM ORA", "ORA", "GWM"] },
  "דונגפנג": { english: "DONGFENG", prefixes: ["DONGFENG"] },
  "סמארט": { english: "SMART", prefixes: ["SMART"] },
  "סקיוול": { english: "SKYWELL", prefixes: ["SKYWELL"] },
  "איווייס": { english: "AIWAYS", prefixes: ["AIWAYS"] },
  "ליפמוטור": { english: "LEAPMOTOR", prefixes: ["LEAPMOTOR"] },
  "פורשה": { english: "PORSCHE", prefixes: ["PORSCHE"] },
  "קופרה": { english: "CUPRA", prefixes: ["CUPRA"] },
  "אלפא רומיאו": { english: "ALFA ROMEO", prefixes: ["ALFA ROMEO", "ALFA"] },
  "קאדילאק": { english: "CADILLAC", prefixes: ["CADILLAC"] },
  "ג'אק": { english: "JAC", prefixes: ["JAC"] },
  "גי.אי.סי": { english: "GAC", prefixes: ["GAC"] },
  "וויה": { english: "VOYAH", prefixes: ["VOYAH"] },
  "די אס": { english: "DS", prefixes: ["DS"] },
  "מקסוס": { english: "MAXUS", prefixes: ["MAXUS"] },
  "ג'י.אמ.סי": { english: "GMC", prefixes: ["GMC"] },
  "ניאו רכב": { english: "NIO", prefixes: ["NIO"] },
  "יגואר": { english: "JAGUAR", prefixes: ["JAGUAR"] },
  "מיני": { english: "MINI", prefixes: ["MINI"] },
  "סרס": { english: "SERES", prefixes: ["SERES"] },
};

// (c) The sheet's words (BRIEF §10.7.4).
export const MODELS_TAB = "דגמים";
export const MAKES_TAB = "יצרנים";

export const MODELS_HEADERS = [
  "יצרן בקטלוג", "קבוצה", "שם בקטלוג", "רכבים", "שנים", "אצלנו", "יצרן", "דגם", "שם בעברית",
] as const;

export const MAKES_HEADERS = ["יצרן בקטלוג", "רכבים", "שם באנגלית", "שם בעברית", "כתיבים נוספים"] as const;

export const YES = "כן";
