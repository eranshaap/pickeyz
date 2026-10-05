// Opening screen, S1 §5 — the screen's fixed texts (findCar-plan.md, "מסך הפתיחה — לבנייה", the texts table).
// The site's punctuation rule: a full sentence ends with a period, a label has none, a sentence that
// introduces a list ends with a colon. The brand name is not here — it stays only in src/lib/brand.ts.

export const GERSHAYIM = String.fromCharCode(0x5f4);

export const OPENING_TEXTS = {
  headline: ["את הדגם כבר בחרת.", "את הרכב נמצא בשבילך."],
  subline: "בודקים כל מודעה מול הרישוי, ומביאים את שלושת הרכבים ששווים את הזמן שלך.",
  hintPrefix: "איזה דגם? למשל",
  hintAlone: "איזה דגם?",
  search: "חפש",
  categoryLines: {
    bestValue: "התמורה הכי טובה לכסף", // המשתלם ביותר
    peaceOfMind: "הכי מעט בעלויות וק" + GERSHAYIM + "מ", // ראש שקט
    cheapest: "הכי זול שעדיין שווה", // הכי חסכוני
  },
  tags: ["לא שייכים לאף יבואן, סוחר, חברת ליסינג או חברת מימון", "אי אפשר לקנות מקום בדירוג"],
  needModel: "צריך לבחור דגם.",
  greyNotOurs: "אין לנו דגם כזה בינתיים.",
  greyNotFound: "לא מצאנו דגם כזה.",
  haveLine: "כרגע יש אצלנו רק את אלה:",
  phoneBar: "איזה דגם?",
  phoneCancel: "ביטול",
  loadFailed: "לא הצלחנו לטעון את התוצאות.",
  retry: "נסה שוב",
};
