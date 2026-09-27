// The recommendations area's placeholders (BRIEF Run 7c §11.3; rebuilt to the new card by Run 1 §6, and to
// the two desktop forms by Run 3 §6).
//
// These are the three grey cards Run 7 §7.2 drew in a route-level `loading.tsx`, which is gone: this is a
// pending state of the results screen ITSELF, in the browser, shown only for a navigation that screen started
// from its own controls ("עדכן", a model picked from the search bar). A cold arrival gets no placeholder at all.
//
// §6 — THE POINT IS THAT THE SCREEN DOES NOT JUMP, so the placeholders take the NEW card's frame and not a
// rectangle of their own: the §3.0 row, a card at the three-card width with the same border and radius, the
// 6px strip, and inside it a block per row of the real card at that row's own height — the label with its
// 40×3 bar, the photo, the title and the price as ONE block (Run 3b §3.1), the rubric strip between its two
// hairlines, and the 40px button on both desktop forms (46 on the phone).
//
// RUN 3b §2 — THE TWO DESKTOP VALUES RUN 3 LEFT BEHIND: the button is `md:h-10` and the rubric strip
// `md:py-2`, which are the CARD's own desktop values (PickCards.tsx §4.2). While they were the card's 40 and 16
// and the skeleton's 44 and 20 the grey card was taller than the card that replaced it, which is the jump this
// file exists to prevent. The phone's `h-[46px]` and `py-2.5` are unchanged.
//
// RUN 3 §6 — AND THE SAME GRID, THE SAME VARIANT AND THE SAME PHOTO BOX as PickCards.tsx §4.2: the card's
// inner container is one DOM in two desktop layouts, so a placeholder drawn as a flex column would have the
// wrong form and the wrong height the moment the window asks for the compact one. The classes below are
// written out rather than imported, as every other measurement of this file already is — it is the card's
// frame copied, and PickCards.tsx is where it is decided. The photo block is sized by the SAME two custom
// properties the real photo is, with the same `100%` / `auto` fallback, so the two boxes are one box.
//
// NO TEXT AND NO DUMMY DATA (§7.2): a skeleton that invents a price or a model name would be showing a car
// that is not there. Everything below is a block in today's skeleton tone.

const CARD_BG = "#ffffff";
const CARD_BORDER = "#d8d3cb";
const BLOCK = "#e6e2db";

/** A grey block of a given height, filling its row. */
function Block({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={className} style={{ background: BLOCK, ...style }} />;
}

/**
 * §6 / §4.2 — the card's grid, and its rows for a card with no sentence (a placeholder never has one). Run 3b
 * §3.1 — one row fewer in both forms, because the title and the price are ONE block here as on the card.
 */
const GRID =
  "flex grow flex-col gap-3 p-4 md:grid md:grid-cols-1 md:gap-x-0 md:gap-y-[10px] md:px-5 md:py-4 " +
  "pick-compact:grid-cols-[var(--pick-photo-w,1fr)_minmax(130px,1fr)] pick-compact:gap-x-[12px] pick-compact:p-4 " +
  "md:grid-rows-[auto_auto_auto_auto_1fr] pick-compact:grid-rows-[auto_auto_auto_1fr]";

/** §6 / §4.2 — everything that is not the photo or the title-and-price block spans both compact columns. */
const FULL_ROW = "pick-compact:col-span-2";

/** §6 / Run 3b §3.1 — the card's TITLE_PRICE_BLOCK, copied as every other measurement of this file is. */
const TITLE_PRICE_BLOCK = "flex flex-col gap-3 md:gap-[10px] pick-compact:self-center";

export default function PickCardsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col items-stretch justify-center gap-6 md:flex-row">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-xl md:w-[calc((100%-48px)/3)] md:shrink-0 md:grow-0"
          style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
        >
          {/* §3.1 — the 6px strip, flush with the edge; grey, because no category is known yet. */}
          <Block className="h-1.5 shrink-0" />

          <div className={GRID}>
            {/* §3.2 — the label and its bar */}
            <div className={`flex flex-col gap-1.5 ${FULL_ROW}`}>
              <Block className="h-[25px] w-[132px] rounded-sm" />
              <Block className="rounded-sm" style={{ width: 40, height: 3 }} />
            </div>

            {/* §3.3 / §4.2 — the photo frame, in the very box the real photo gets */}
            <Block className="aspect-[4/3] w-full rounded-lg md:h-[var(--pick-photo-h,auto)] md:w-[var(--pick-photo-w,100%)] md:max-w-full md:justify-self-center pick-compact:col-start-1" />

            {/* §3.4 / §3.5 / Run 3b §3.1 — the title's line and the price's, as ONE block */}
            <div className={TITLE_PRICE_BLOCK}>
              <Block className="h-6 w-3/5 rounded-sm" />
              <Block className="h-9 w-2/5 rounded-sm" />
            </div>

            {/* §3.6 — the rubric strip, between its own two hairlines */}
            <div className={`grid border-t border-b border-[#e6e2db] py-2.5 md:py-2 ${FULL_ROW}`} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              {[0, 1, 2].map((c) => (
                <div key={c} className={`flex flex-col gap-0.5 ${c === 0 ? "px-1" : "border-s border-[#e6e2db] px-2.5 md:px-3"}`}>
                  <Block className="h-6 w-4/5 rounded-sm" />
                  <Block className="h-[18px] w-3/5 rounded-sm" />
                </div>
              ))}
            </div>

            {/* §3.9 — the button, at the bottom of the card as on the real one */}
            <div className={`mt-auto ${FULL_ROW}`}>
              <Block className="h-[46px] w-full rounded-lg md:h-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
