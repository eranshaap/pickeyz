// The failed search (S4 §4) — what the results area shows when a load of the results screen threw, or had no
// answer RESULTS_LOAD_TIMEOUT_MS after it started: from the opening screen, from another model chosen in the
// question row, and from "עדכן" in the filters window alike. It takes the place of the placeholders, or of the
// results that were there; the question row above it keeps showing what was asked.
//
// The sentence large and centred in the area (36 px, weight 700 on the computer; 26 px on the phone) and under
// it "נסה שוב" as a dark pill 56 px high. The block is centred the way the zero-results screen centres its own
// (ZeroResults.tsx): in the window's height less the white bar's. The retry itself is the screen's — it runs
// the same request again — so this file draws and decides nothing else.

import { OPENING_TEXTS } from "@/lib/opening/texts";

const INK = "#221f1c"; // BLACK in src/lib/display/texts.ts — the site's ink

export default function SearchFailed({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  return (
    <div className="flex min-h-[calc(100vh-55px)] flex-1 items-center justify-center px-5 pt-6 pb-10 md:min-h-[calc(100vh-56px)] md:p-12">
      <div className="flex max-w-[620px] flex-col items-center gap-6 text-center">
        <p className="m-0 text-[26px] leading-[1.3] font-bold md:text-[36px] md:leading-[1.25]" style={{ color: INK }}>
          {OPENING_TEXTS.loadFailed}
        </p>
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={onRetry}
          className="flex h-14 items-center justify-center rounded-full bg-[#221f1c] px-8 text-[18px] font-bold text-white disabled:bg-neutral-300"
        >
          {OPENING_TEXTS.retry}
        </button>
      </div>
    </div>
  );
}
