// The car's title (BRIEF Run 9 §1.2, §3.1) — the model, then the year, with NO COMMA between them.
//
// It renders a FRAGMENT and not a box: the caller supplies the wrapper it belongs in (the car page's <h1>,
// a card's own title element), so the size, the weight and the colour stay exactly where they already are
// and this component decides one thing only — that the two parts are separated by a 0.4em gap rather than
// by punctuation. The parts themselves come from titleParts() in src/lib/display/texts.ts, tested there.
//
// A car with no year renders the model alone, with no trailing gap and no empty span.

import { titleParts } from "@/lib/display/texts";

export default function CarTitle({ model, year }: { model: string; year: number | null }) {
  const parts = titleParts(model, year);
  return (
    <>
      {parts[0]}
      {parts.length > 1 && <span style={{ marginInlineStart: "0.4em" }}>{parts[1]}</span>}
    </>
  );
}
