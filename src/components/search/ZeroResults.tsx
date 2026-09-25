// The zero-results screen (BRIEF Days 20–21, Run 2 §6) — the boards «מסך אפס תוצאות — גודל מלא» and the third
// frame of «טלפון — שלושת מסכי הקצה».
//
// WHAT IS IN THE BLOCK (§6.0): the Day 15 headline and TODAY'S relief control, centred in the window's
// remaining height. The desktop board's second line is a draft nudge sentence and is NOT rendered — the
// document's rule is the Day 15 line plus one relief suggestion computed from the counts, and that suggestion
// is the control the action already computes (`AskResult.relief`). When the action computed no relief, the
// headline stands alone.
//
// WHAT IS GONE (§6.1): the count line, "נבחרו מתוך 0 רכבים." — deleted, not hidden. Nothing else is in the
// region.
//
// THE RELIEF CONTROL IS PASSED IN, not rebuilt: its markup, its handler and its look are untouched (§6.1), and
// its handler belongs to the screen that owns the draft. This component only puts it in the centred block.
//
// THE BAR'S HEIGHT (§0.3h): the white bar sets NO explicit height anywhere in the code — it is `py-3` (12px top
// and bottom) plus its 1px bottom border plus its tallest child, which is a question-row chip
// (`px-3 py-1 text-[13px] md:text-[14px]` inside a 1px border): 4 + 4 + 2 + 13×1.5 = 29.5 on the phone and
// 4 + 4 + 2 + 14×1.5 = 31 on the desktop. So the bar is 54.5 and 56. BAR_PHONE is rounded UP to the whole pixel,
// which makes the block a half-pixel shorter rather than half a pixel too tall — this region must never be the
// thing that puts a scrollbar on the page.

import { NO_CARS_AT_ALL } from "@/lib/display/edge-screens";

export default function ZeroResults({ relief }: { relief: React.ReactNode }) {
  return (
    // §6.1 / §6.2 — padding 48 on the desktop and `24px 20px 40px` on the phone; the block centred in the
    // window's height less the white bar's.
    <div className="flex min-h-[calc(100vh-55px)] flex-1 items-center justify-center px-5 pt-6 pb-10 md:min-h-[calc(100vh-56px)] md:p-12">
      <div className="gap-5 md:gap-2.5" style={{ display: "flex", flexDirection: "column", maxWidth: 620, textAlign: "center", alignItems: "center" }}>
        <h1 className="text-[22px] leading-[1.3] md:text-[30px] md:leading-[1.25]" style={{ margin: 0, fontWeight: 800 }}>
          {NO_CARS_AT_ALL}
        </h1>
        {relief}
      </div>
    </div>
  );
}
