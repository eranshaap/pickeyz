// The car page (BRIEF Run 6b §7.2–§7.4; the top block rebuilt by Run 9 §3–§5) — board-accurate, and a
// RENDERER ONLY.
//
// Every display decision arrives already made: the page colour, the label words and their colours, the
// version line, the fair-number block, the four rubrics and the ownership axis are all computed by the pure
// functions of src/lib/display/** and tested there (§8). Nothing in this file decides what a value means; it
// decides where it sits.
//
// THE PAGE COLOUR (§7.2) paints exactly: the label/place line and its 40×3px bar, the section headings, the
// contact button, the ownership-axis fills, the phone bottom-bar button — and, from Run 9 §4.3, the region
// line's pin and word. NOTHING ELSE IS COLOURED.
//
// Desktop: a 64px white header, then a two-column top block (the text column + a 536px image column), the
// rubric strip, "למה", "היסטוריית בעלויות". Phone: two white bars, the image full width, the same blocks
// stacked, the rubrics two by two, and a fixed 72px bottom bar that is always on screen.
//
// RUN 9, WHAT THE TOP BLOCK NOW IS:
//   §3.2  the title and the version line are ONE group, 4px apart. The larger gap on the deployed site was
//         never an h1 margin (Tailwind's preflight zeroes those and no stylesheet adds one back) — it was
//         the text column's OWN 16px flex gap, which the two were simply siblings of. They are wrapped now.
//   §4.1  the comparison sentence ("הושווה ל-…") is GONE — deleted here and in texts.ts, not hidden.
//   §4.3  a region line is the LAST line of the price block: the pin and listings.region, in the page colour.
//   §4.4  the seller line is GONE from both screens, with its business name, its "מגרש" and its region.
//   §5.1  the photo is 536×357 and the text column ends level with it: 12px between its rows, a 357px
//         minimum height, and the contact button pushed to the bottom by `margin-top: auto`.
//   §5.2  the gap under the top block is gapAfterTopBlock(S) — one and a half section gaps, rounded up to a
//         multiple of 4 — laid on as EXTRA bottom margin, so the section-to-section gap itself never moves.
//
// The contact button is WIRED TO NOTHING — it does nothing until the contact-window run. Nothing after the
// ownership history exists in this run: "מפרט ואבזור" and the contact window each come in their own round.

import Link from "next/link";
import type { RubricStrip } from "@/lib/display/rubrics";
import type { NoHistoryView, OwnershipAxis, PriceBlock } from "@/lib/display/texts";
import { gapAfterTopBlock, shekel } from "@/lib/display/texts";
import type { SearchFilters } from "@/lib/search/filters";
import type { Category } from "@/lib/selection";
import type { FilterName } from "@/app/actions/search";
import QuestionRow from "@/components/search/QuestionRow";
import { LinkPending } from "@/components/search/PickCards";
import CarTitle from "./CarTitle";
import OwnershipTimeline from "./OwnershipTimeline";
import Rubrics from "./Rubrics";
import WhySection from "./WhySection";

const GREY = "#665f58";
const DARK = "#221f1c";
const PLACEHOLDER_BG = "#e6e2db";

const CONTACT = "צור קשר עם המוכר";
const CONTACT_SHORT = "צור קשר";
const OWNERSHIP_HEADING = "היסטוריית בעלויות";
const PHOTO_PLACEHOLDER = "[תמונת הרכב]";

// §5.1 — the photo is 536×357 off the board «עמוד הרכב המלא — פריסה ב» (it was 360×236), and the text
// column's minimum height is that same 357, which is what makes the two columns end on the same line. Both
// numbers are written as literal Tailwind classes below (`w-[536px] h-[357px]`, `md:min-h-[357px]`) and not
// as constants: a class name assembled at runtime is a class Tailwind never sees and never emits.

// §5.2 — S, the page's OWN section gap, as <main> below spells it: `gap-4` (16px) on the phone and
// `md:gap-7` (28px) from `md` up. S itself does not change; the top block simply carries the DIFFERENCE
// between gapAfterTopBlock(S) and S as extra bottom margin, so every other section-to-section gap is
// untouched. 28 → 44 (extra 16) on the desktop, 16 → 24 (extra 8) on the phone.
const SECTION_GAP_PHONE = 16;
const SECTION_GAP_DESKTOP = 28;

const topBlockGap: React.CSSProperties & Record<string, string> = {
  "--top-extra-phone": `${gapAfterTopBlock(SECTION_GAP_PHONE) - SECTION_GAP_PHONE}px`,
  "--top-extra-desktop": `${gapAfterTopBlock(SECTION_GAP_DESKTOP) - SECTION_GAP_DESKTOP}px`,
};

/**
 * The question behind the page, when there is one. Absent = a black page with no question row (§7.1).
 *
 * Run 7c §11.2 — IT IS TEXT NOW, so this is all of it: what the row spells, plus the address "חזרה" goes
 * back to. The live model list, the model as searched and its key were here for the sheet Run 7 §1 opened
 * over this page; that sheet is gone and so are they.
 */
export type PageQuestion = {
  modelDisplay: string;
  filters: SearchFilters;
  active: FilterName[];
  publicId: string;
};

export type CarPageData = {
  brand: string;
  backHref: string;
  backWord: string;
  question: PageQuestion | null;
  color: string;
  /** The label(s), each with its OWN colour when there is more than one (§7.2). */
  labelWords: { word: string; color: string }[];
  labels: Category[];
  /** "מקום {N}", or "ביטול סופי" for a cancelled car; null when the page carries neither. */
  placeWord: string | null;
  rank: number | null;
  /** §3.1 — the title's two parts, never a joined string: CarTitle puts the gap between them, not a comma. */
  model: string;
  year: number | null;
  versionLine: string;
  /** The photo by licence plate; null → the placeholder box. */
  imageSrc: string | null;
  price: number;
  percentOfNew: string | null;
  priceBlock: PriceBlock;
  /** §4.3 — listings.region, the very field the drawer's region chips read. Empty/null → no line at all. */
  region: string | null;
  strip: RubricStrip;
  axis: OwnershipAxis | null;
  noHistory: NoHistoryView | null;
  zeroKmExplanation: string | null;
  /** Always empty in this run — the justification generator is Days 22–23 (§7.7). */
  whyLines: string[];
};

// ---------------------------------------------------------------------------

function CarGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 48 24" className="h-8 w-16" fill="none" stroke={GREY} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M3 16v-3l4-1 3-5h16l5 5 10 1a3 3 0 0 1 3 3v3h-5" />
      <path d="M3 16h8m10 0h14" />
      <circle cx="15" cy="17" r="3" />
      <circle cx="38" cy="17" r="3" />
    </svg>
  );
}

function Photo({ src, className }: { src: string | null; className: string }) {
  if (src !== null) {
    // eslint-disable-next-line @next/next/no-img-element -- a local file served from /public; no loader needed
    return <img src={src} alt="" className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} flex flex-col items-center justify-center gap-1`} style={{ background: PLACEHOLDER_BG }}>
      <CarGlyph />
      <span className="text-[13px]" style={{ color: GREY }}>
        {PHOTO_PLACEHOLDER}
      </span>
    </div>
  );
}

/** The label(s) or the place, then the 40×3px bar in the page colour. Nothing at all when there is neither. */
function VerdictLine({ data, size }: { data: CarPageData; size: "phone" | "desktop" }) {
  const has = data.labelWords.length > 0 || data.placeWord !== null;
  if (!has) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-wrap items-baseline gap-x-2 font-extrabold ${size === "phone" ? "text-[14px]" : "text-[18px]"}`}>
        {data.labelWords.length > 0
          ? data.labelWords.map((l) => (
              <span key={l.word} style={{ color: l.color }}>
                {l.word}
              </span>
            ))
          : (
              <span style={{ color: data.color }}>{data.placeWord}</span>
            )}
      </div>
      <span aria-hidden className="block" style={{ width: 40, height: 3, background: data.color }} />
    </div>
  );
}

/**
 * §4.3 — THE REGION LINE, the last line of the price block: the pin and listings.region, in the page colour
 * (black on a black page). An empty or missing region renders NOTHING — not an empty line, no element at
 * all — so a listing without a region simply ends its price block at the line above.
 *
 * The seller line this replaces (§4.4) is gone from both screens; this is the only place the car page says
 * where the car is, and it says it from the LISTING's own field, never from the dealer's.
 */
function RegionLine({ region, color, size }: { region: string | null; color: string; size: "phone" | "desktop" }) {
  if (region === null || region.trim() === "") return null;
  const phone = size === "phone";
  const icon = phone ? 17 : 18;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: phone ? 5 : 6, fontSize: phone ? 15 : 16, fontWeight: 700, lineHeight: 1.3, color }}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path d="M12 21c-4-4.2-7-7.8-7-11.2a7 7 0 0 1 14 0c0 3.4-3 7-7 11.2z" />
        <circle cx="12" cy="9.8" r="2.5" />
      </svg>
      <span>{region}</span>
    </div>
  );
}

/**
 * §5.1 — the price block: a 4px column. The price row as it was, then the fair number ALONE (§4.1 — the
 * grey "הושווה ל-…" line that used to share its baseline row is deleted, so the fair number is a line of
 * its own and no longer wraps against anything), or the thin-cell sentence, and last the region line.
 */
function PriceBlockView({ data, size }: { data: CarPageData; size: "phone" | "desktop" }) {
  const b = data.priceBlock;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className={`font-extrabold tabular-nums ${size === "phone" ? "text-[28px]" : "text-[32px]"}`} style={{ color: DARK }}>
          {shekel(data.price)}
        </span>
        {data.percentOfNew !== null && (
          <span className={size === "phone" ? "text-[13px]" : "text-[14px]"} style={{ color: GREY }}>
            {data.percentOfNew}
          </span>
        )}
      </div>
      {b !== null && "fair" in b && (
        <span className={`font-bold tabular-nums ${size === "phone" ? "text-[15px]" : "text-[16px]"}`} style={{ color: DARK }}>
          {b.fair}
        </span>
      )}
      {b !== null && "thin" in b && (
        <span className={size === "phone" ? "text-[12px]" : "text-[13px]"} style={{ color: GREY }}>
          {b.thin}
        </span>
      )}
      {/* §4.3 — always the LAST line of the block: after the fair number, after the thin-cell sentence, and
          directly after the price row on a cancelled car, which has neither. */}
      <RegionLine region={data.region} color={data.color} size={size} />
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function CarPageView({ data }: { data: CarPageData }) {
  // Run 7 §7.1 — the back link acknowledges its own click: from the click until the navigation commits it
  // dims and carries a spinner, through the framework's link-status mechanism. On ITSELF — §7.4 forbids any
  // streaming boundary on this route, so the feedback for leaving this page lives on the source element.
  const backLink = (
    <Link
      href={data.backHref}
      className="relative shrink-0 whitespace-nowrap px-1 text-[15px] font-semibold underline underline-offset-4"
      style={{ color: DARK }}
    >
      {data.backWord}
      <LinkPending compact />
    </Link>
  );
  const brandName = (
    <Link href="/" className="shrink-0 whitespace-nowrap text-[17px] font-extrabold" style={{ color: DARK }}>
      {data.brand}
    </Link>
  );

  // Run 7c §11.2 — READ-ONLY. The row still shows the question behind the verdict, but as text: no click on
  // the model, no click on a chip, no "+ פילטרים", default cursor throughout. This page mounts no
  // FilterPanel and no search bar; "חזרה" is the only way to change the question, on the results screen.
  const questionRow = (q: PageQuestion) => <QuestionRow readOnly modelDisplay={q.modelDisplay} filters={q.filters} active={q.active} />;

  // §3.2 — the title group: the h1 and the version line, 4px apart, wrapped so the text column's own row gap
  // cannot open between them. The h1 carries `margin: 0` explicitly, so the group's 4px is the only spacing.
  const titleGroup = (
    <div className="flex flex-col gap-1">
      <h1 className="text-[26px] font-bold md:text-[34px]" style={{ color: DARK, margin: 0 }}>
        <CarTitle model={data.model} year={data.year} />
      </h1>
      <p className="text-[14px] md:text-[15px]" style={{ color: GREY }}>
        {data.versionLine}
      </p>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#eeece8" }}>
      {/* ---------------------------------------------------------------- header */}
      {/* DESKTOP (§7.3, Run 7 §3): one 64px white bar — brand · the question row · the back link.
          The white and its 1px bottom border run the full width of the window; the CONTENT inside it is the
          page container — max-width 1280px, centred, padding 0 48px — so the header's items line up with the
          main column at every width. The board is drawn at exactly 1280px and cannot say which of the two
          the white stops at; a bar that stops mid-window is the one reading that would look broken. */}
      <header className="hidden border-b border-[#d8d3cb] bg-white md:block">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-12">
          {brandName}
          {data.question !== null ? questionRow(data.question) : <span className="flex-1" />}
          {backLink}
        </div>
      </header>

      {/* PHONE (§7.4): a 56px bar with the brand and the back link, then a 48px bar with the question row. */}
      <header className="md:hidden">
        <div className="flex h-14 items-center justify-between border-b border-[#d8d3cb] bg-white px-4">
          {brandName}
          {backLink}
        </div>
        {data.question !== null && (
          <div className="flex h-12 items-center border-b border-[#d8d3cb] bg-white px-4">{questionRow(data.question)}</div>
        )}
      </header>

      {/* ---------------------------------------------------------------- phone image */}
      <Photo src={data.imageSrc} className="block h-[200px] w-full md:hidden" />

      {/* Run 7 §3 — the page container: max-width 1280px, centred; main padding 36px 48px 40px. S, the gap
          BETWEEN sections, is this element's own `gap-4` / `md:gap-7` and Run 9 §5.2 does not touch it. */}
      <main className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 pt-4 pb-[88px] md:gap-7 md:px-12 md:pt-9 md:pb-10">
        {/* ------------------------------------------------------------ top block */}
        {/* §5.1 — grid minmax(0, 1fr) 536px, gap 32px: RTL puts the first column on the RIGHT, so the
            flexible text column is on the right and the 536px photo column on the left, per the board.
            `items-start` is what keeps the dead band from opening under the photo: neither column stretches.
            §5.2 — the extra bottom margin is gapAfterTopBlock(S) − S, from the one function that decides it. */}
        <section
          className="mb-[var(--top-extra-phone)] flex flex-col gap-4 md:mb-[var(--top-extra-desktop)] md:grid md:grid-cols-[minmax(0,1fr)_536px] md:items-start md:gap-8"
          style={topBlockGap}
        >
          {/* §5.1 — the text column: 12px between its rows (it was 16) and at least as tall as the photo, so
              the contact button pushed down by `mt-auto` lands on the photo's bottom line. */}
          <div className="flex flex-col gap-4 md:min-h-[357px] md:gap-3">
            <div className="md:hidden">
              <VerdictLine data={data} size="phone" />
            </div>
            <div className="hidden md:block">
              <VerdictLine data={data} size="desktop" />
            </div>

            {titleGroup}

            <div className="md:hidden">
              <PriceBlockView data={data} size="phone" />
            </div>
            <div className="hidden md:block">
              <PriceBlockView data={data} size="desktop" />
            </div>

            <Rubrics strip={data.strip} />

            {/* §5.1 — the contact button: height 48px, padding 0 32px, radius 8, the page colour, at the
                BOTTOM of the text column. The phone does not show it here — the fixed bar holds it. */}
            <div className="mt-auto hidden md:block">
              <button type="button" className="h-12 rounded-lg px-8 text-[16px] font-semibold text-white" style={{ background: data.color }}>
                {CONTACT}
              </button>
            </div>
          </div>

          {/* §5.1 — the photo box: 536×357, radius 8, object-cover. */}
          <Photo src={data.imageSrc} className="hidden h-[357px] w-[536px] rounded-lg md:block" />
        </section>

        {/* ------------------------------------------------- למה (between the rubrics and the history) */}
        <WhySection labels={data.labels} rank={data.rank} lines={data.whyLines} color={data.color} />

        {/* ------------------------------------------------------------ ownership history */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-extrabold md:text-[18px]" style={{ color: data.color }}>
            {OWNERSHIP_HEADING}
          </h2>
          {/* Run 7 §2.3 — ONE tick system now: the phone no longer drops every year tick by rule, it drops
              whichever labels do not clear, by the same collision rule the desktop uses. The axis is still
              rendered twice only because each copy measures its own card. */}
          <div className="md:hidden">
            <OwnershipTimeline axis={data.axis} noHistory={data.noHistory} color={data.color} zeroKmExplanation={data.zeroKmExplanation} />
          </div>
          <div className="hidden md:block">
            <OwnershipTimeline axis={data.axis} noHistory={data.noHistory} color={data.color} zeroKmExplanation={data.zeroKmExplanation} />
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------------ phone bottom bar (§7.4, Run 7 §5) */}
      {/* §5 — the price element is GONE from this bar (the price is already on the page, a few centimetres
          above it). The contact button is the bar's only content, horizontally centred. The bar's height and
          background are unchanged, and it has no scroll-aware behaviour of any kind. Run 9 §4.4: the region
          does NOT enter this bar either. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex h-[72px] items-center justify-center border-t border-[#d8d3cb] bg-white px-4 md:hidden">
        <button type="button" className="h-[46px] shrink-0 rounded-lg px-7 text-[15px] font-semibold text-white" style={{ background: data.color }}>
          {CONTACT_SHORT}
        </button>
      </div>
    </div>
  );
}
