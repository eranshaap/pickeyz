// The tag and the sentence, one rule (BRIEF Days 24–25, Run 1 §4.6) — the line the justification generator will
// write, drawn identically wherever it appears: on a "מקום N" card, in the desktop table's sentence cell and on
// the second line of a phone row.
//
// THE RULE (§4.6, decision 8):
//   tag non-empty   the tag first — 13px / 600, the label grey — then " · ", then the sentence in the black the
//                   container already carries
//   tag empty       the sentence alone
//   both empty      NOTHING AT ALL: this component renders null and each of the three structures then draws
//                   what it draws today for an empty sentence (§4.2, §4.3) — the card omits the row, the
//                   desktop cell stays empty, the phone row shows its data line only.
//
// BUILT, NOT VISIBLE. Until the generator lands, every row carries `sentence: ""` and `tag: ""` (§3), so this
// component draws nothing anywhere on the live site.
//
// It returns INLINE CONTENT, not a box: the element around it, and therefore the font size and the line height,
// belong to the structure that draws it — which is what makes one rule fit all three.

const GREY = "#665f58";

/** §4.6 — is there a line at all? The three structures ask this before they draw their own wrapper. */
export function hasSentenceLine(row: { tag: string; sentence: string }): boolean {
  return row.tag !== "" || row.sentence !== "";
}

export default function SentenceLine({ tag, sentence }: { tag: string; sentence: string }) {
  if (!hasSentenceLine({ tag, sentence })) return null;
  return (
    <>
      {tag !== "" && (
        <>
          <span style={{ fontSize: 13, fontWeight: 600, color: GREY }}>{tag}</span>
          {" · "}
        </>
      )}
      {sentence}
    </>
  );
}
