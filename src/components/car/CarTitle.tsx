// The car's title (BRIEF Run 9 §1.2, §3.1; the gap rebuilt by Run 9c §11.1) — the model, then the year,
// with NO COMMA between them.
//
// It renders a FRAGMENT and not a box: the caller supplies the wrapper it belongs in (the car page's <h1>,
// a card's own title element), so the size, the weight and the colour stay exactly where they already are
// and this component decides one thing only — that the two parts are separated by a 0.4em gap rather than
// by punctuation. The parts themselves come from titleParts() in src/lib/display/texts.ts, tested there.
//
// §11.1 — THE GAP IS A SPACER, NOT A MARGIN. It was `margin-inline-start: 0.4em` on the year's span, and
// under the page's right-to-left direction that margin sits on the span's RIGHT side. With a Latin model
// name ("IONIQ HYBRID") the bidi algorithm lays the name and the year out left-to-right, so the year ends
// up to the right of the name and its margin lands at the END of the line: the live title read
// "IONIQ HYBRID2021" and stopped ~14px short of the column's edge. An atomic inline box counts as a
// NEUTRAL character in bidi, so a spacer element stays between the two parts in either script, and the
// non-breaking space inside it keeps copy/paste and screen readers reading "model year" while stopping the
// year from wrapping onto a line of its own.
//
// A car with no year renders the model alone, with no spacer and no empty span.

import { titleParts } from "@/lib/display/texts";

export default function CarTitle({ model, year }: { model: string; year: number | null }) {
  const parts = titleParts(model, year);
  if (parts.length === 1) return <>{parts[0]}</>;
  return (
    <>
      {parts[0]}
      <span style={{ display: "inline-block", width: "0.4em" }}>{"\u00A0"}</span>
      {parts[1]}
    </>
  );
}
