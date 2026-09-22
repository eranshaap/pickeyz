// The car page (BRIEF Run 6b §7.2–§7.4) — board-accurate, and a RENDERER ONLY.
//
// Every display decision arrives already made: the page colour, the label words and their colours, the
// version line, the fair-number block, the seller line, the four rubrics and the ownership axis are all
// computed by the pure functions of src/lib/display/** and tested there (§8). Nothing in this file decides
// what a value means; it decides where it sits.
//
// THE PAGE COLOUR (§7.2) paints exactly: the label/place line and its 40×3px bar, the section headings, the
// contact button, the ownership-axis fills and the phone bottom-bar button. NOTHING ELSE IS COLOURED.
//
// Desktop: a 64px white header, then a two-column top block (content + a 360px image column), the rubric
// strip, "למה", "היסטוריית בעלויות". Phone: two white bars, the image full width, the same blocks stacked,
// the rubrics two by two, and a fixed 72px bottom bar that is always on screen.
//
// The contact button is WIRED TO NOTHING — it does nothing until the contact-window run. Nothing after the
// ownership history exists in this run: "מפרט ואבזור" and the contact window each come in their own round.

import Link from "next/link";
import type { RubricStrip } from "@/lib/display/rubrics";
import type { NoHistoryView, OwnershipAxis, PriceBlock } from "@/lib/display/texts";
import { shekel } from "@/lib/display/texts";
import type { SearchFilters } from "@/lib/search/filters";
import type { LiveModel } from "@/lib/search/models";
import type { Category } from "@/lib/selection";
import type { FilterName } from "@/app/actions/search";
import QuestionRow from "@/components/search/QuestionRow";
import { LinkPending } from "@/components/search/PickCards";
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

/** The question behind the page, when there is one. Absent = a black page with no question row (§7.1). */
export type PageQuestion = {
  models: LiveModel[];
  /** Run 7 §1.1 — the model AS SEARCHED: the sheet's shelf, its counters and its ask() all take this. */
  model: string;
  modelDisplay: string;
  modelKey: string;
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
  title: string;
  versionLine: string;
  /** The photo by licence plate; null → the placeholder box. */
  imageSrc: string | null;
  price: number;
  percentOfNew: string | null;
  priceBlock: PriceBlock;
  sellerLine: string;
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
      {/* Run 7 §3 — ONE wrapping baseline row (gap: 2px 12px) carrying BOTH the "{Y} ₪ מתחת/מעל…" line
          (16px/700) and the grey "הושווה ל-…" line (13px). They share a row and wrap only when the width
          truly runs out — never by default at desktop widths, which is what the 1280px container restores. */}
      {b !== null && "fair" in b && (
        <div className="flex flex-wrap items-baseline" style={{ gap: "2px 12px" }}>
          <span className={`font-bold tabular-nums ${size === "phone" ? "text-[15px]" : "text-[16px]"}`} style={{ color: DARK }}>
            {b.fair}
          </span>
          <span className={size === "phone" ? "text-[12px]" : "text-[13px]"} style={{ color: GREY }}>
            {b.compared}
          </span>
        </div>
      )}
      {b !== null && "thin" in b && (
        <span className={size === "phone" ? "text-[12px]" : "text-[13px]"} style={{ color: GREY }}>
          {b.thin}
        </span>
      )}
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

  // Run 7 §1.1 — no `onOpenFilters` is passed, which is exactly what makes the row open the sheet ITSELF,
  // in place over this page. The chips are no longer links and the address never moves.
  const questionRow = (q: PageQuestion) => (
    <QuestionRow models={q.models} model={q.model} modelDisplay={q.modelDisplay} modelKey={q.modelKey} filters={q.filters} active={q.active} />
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

      {/* Run 7 §3 — the page container: max-width 1280px, centred; main padding 36px 48px 40px; 28px between
          sections. Below 1280px the paddings hold and the grid shrinks fluidly (the columns are minmax(0,1fr)
          and a fixed 360px, so it is the flexible column that gives). The phone column is untouched by §3. */}
      <main className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 pt-4 pb-[88px] md:gap-7 md:px-12 md:pt-9 md:pb-10">
        {/* ------------------------------------------------------------ top block */}
        {/* §3 — grid minmax(0, 1fr) 360px, gap 32px: RTL puts the first column on the RIGHT, so the flexible
            info column is on the right and the 360px photo column on the left, per the board. `items-start`
            is what keeps the dead band from opening under the photo: neither column stretches. */}
        <section className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-8">
          <div className="flex flex-col gap-4">
            <div className="md:hidden">
              <VerdictLine data={data} size="phone" />
            </div>
            <div className="hidden md:block">
              <VerdictLine data={data} size="desktop" />
            </div>

            <h1 className="text-[26px] font-bold md:text-[34px]" style={{ color: DARK }}>
              {data.title}
            </h1>
            <p className="text-[14px] md:text-[15px]" style={{ color: GREY }}>
              {data.versionLine}
            </p>

            {/* the price row: the numbers, and at its end the contact button with the seller line under it */}
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
              <div className="md:hidden">
                <PriceBlockView data={data} size="phone" />
              </div>
              <div className="hidden md:block">
                <PriceBlockView data={data} size="desktop" />
              </div>

              {/* §3 — the contact button: height 48px, padding 0 32px, radius 8, the page colour; at the
                  row's far side with the seller line beneath it. */}
              <div className="hidden shrink-0 flex-col items-stretch gap-2 md:flex">
                <button type="button" className="h-12 rounded-lg px-8 text-[16px] font-semibold text-white" style={{ background: data.color }}>
                  {CONTACT}
                </button>
                <span className="text-[13px]" style={{ color: GREY }}>
                  {data.sellerLine}
                </span>
              </div>
            </div>

            <Rubrics strip={data.strip} />
          </div>

          {/* §3 — the photo box: 236px tall, radius 8, object-cover, filling its 360px column. */}
          <Photo src={data.imageSrc} className="hidden h-[236px] w-full rounded-lg md:block" />
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
          background are unchanged, and it has no scroll-aware behaviour of any kind. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex h-[72px] items-center justify-center border-t border-[#d8d3cb] bg-white px-4 md:hidden">
        <button type="button" className="h-[46px] shrink-0 rounded-lg px-7 text-[15px] font-semibold text-white" style={{ background: data.color }}>
          {CONTACT_SHORT}
        </button>
      </div>
    </div>
  );
}
