// The recommendations area's placeholders (BRIEF Run 7c §11.3; rebuilt to the new card by Run 1 §6).
//
// These are the three grey cards Run 7 §7.2 drew in a route-level `loading.tsx`, which is gone: this is a
// pending state of the results screen ITSELF, in the browser, shown only for a navigation that screen started
// from its own controls ("עדכן", a model picked from the search bar). A cold arrival gets no placeholder at all.
//
// §6 — THE POINT IS THAT THE SCREEN DOES NOT JUMP, so the placeholders take the NEW card's frame and not a
// rectangle of their own: the §3.0 row, a card at the three-card width with the same border and radius, the
// 6px strip, and inside it a block per row of the real card at that row's own height — the label with its
// 40×3 bar, the 196px photo (a 4/3 frame on the phone, §5), the title, the price, the rubric strip between
// its two hairlines, and the 44px button (46 on the phone).
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

          <div className="flex grow flex-col gap-3 p-4 md:gap-3.5 md:p-5">
            {/* §3.2 — the label and its bar */}
            <div className="flex flex-col gap-1.5">
              <Block className="h-[25px] w-[132px] rounded-sm" />
              <Block className="rounded-sm" style={{ width: 40, height: 3 }} />
            </div>

            {/* §3.3 / §5 — the photo frame */}
            <Block className="aspect-[4/3] w-full rounded-lg md:aspect-auto md:h-[196px]" />

            {/* §3.4 — the title */}
            <Block className="h-6 w-3/5 rounded-sm" />

            {/* §3.5 — the price row */}
            <Block className="h-9 w-2/5 rounded-sm" />

            {/* §3.6 — the rubric strip, between its own two hairlines */}
            <div className="grid border-t border-b border-[#e6e2db] py-2.5" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              {[0, 1, 2].map((c) => (
                <div key={c} className={`flex flex-col gap-0.5 ${c === 0 ? "px-1" : "border-s border-[#e6e2db] px-2.5 md:px-3"}`}>
                  <Block className="h-6 w-4/5 rounded-sm" />
                  <Block className="h-[18px] w-3/5 rounded-sm" />
                </div>
              ))}
            </div>

            {/* §3.9 — the button, at the bottom of the card as on the real one */}
            <div className="mt-auto">
              <Block className="h-[46px] w-full rounded-lg md:h-11" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
