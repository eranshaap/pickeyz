// The car page's white strip (BRIEF Day 19b Run 24b §2) — ONE component, used by the car page and by its
// "not found" page. Moved here unchanged from CarPageView.tsx: the same elements, classes and order.
//
// It draws what it is given and decides nothing: the brand, the question row when there is a question, and
// the back link when there is one. No question → on the computer an empty `flex-1` span holds the back link at
// the end, and on the phone there is no second bar. No back link → no link element at all.
//
// No hooks and no "use client": the car page renders it on the server, and BackToResults (a client
// component) renders it in the browser.

import Link from "next/link";
import QuestionRow from "@/components/search/QuestionRow";
import { LinkPending } from "@/components/search/PickCards";
import type { PageQuestion } from "./CarPageView";

const DARK = "#221f1c";

export type TopStripProps = {
  brand: string;
  question: PageQuestion | null;
  /** The back link's target and word; null = no back link. */
  back: { href: string; word: string } | null;
};

export default function TopStrip({ brand, question, back }: TopStripProps) {
  // Run 7 §7.1 — the back link acknowledges its own click: from the click until the navigation commits it
  // dims and carries a spinner, through the framework's link-status mechanism. On ITSELF — §7.4 forbids any
  // streaming boundary on this route, so the feedback for leaving this page lives on the source element.
  const backLink =
    back === null ? null : (
      <Link
        href={back.href}
        className="relative shrink-0 whitespace-nowrap px-1 text-[15px] font-semibold underline underline-offset-4"
        style={{ color: DARK }}
      >
        {back.word}
        <LinkPending compact />
      </Link>
    );
  const brandName = (
    <Link href="/" className="shrink-0 whitespace-nowrap text-[17px] font-extrabold" style={{ color: DARK }}>
      {brand}
    </Link>
  );

  // Run 7c §11.2 — READ-ONLY. The row still shows the question behind the verdict, but as text: no click on
  // the model, no click on a chip, no "+ פילטרים", default cursor throughout. This page mounts no
  // FilterPanel and no search bar; "חזרה" is the only way to change the question, on the results screen.
  const questionRow = (q: PageQuestion) => <QuestionRow readOnly modelDisplay={q.modelDisplay} filters={q.filters} active={q.active} />;

  return (
    <>
      {/* DESKTOP (§7.3, Run 7 §3): one 64px white bar — brand · the question row · the back link.
          The white and its 1px bottom border run the full width of the window; the CONTENT inside it is the
          page container — max-width 1280px, centred, padding 0 48px — so the header's items line up with the
          main column at every width. The board is drawn at exactly 1280px and cannot say which of the two
          the white stops at; a bar that stops mid-window is the one reading that would look broken. */}
      <header className="hidden border-b border-[#d8d3cb] bg-white md:block">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-12">
          {brandName}
          {question !== null ? questionRow(question) : <span className="flex-1" />}
          {backLink}
        </div>
      </header>

      {/* PHONE (§7.4): a 56px bar with the brand and the back link, then a 48px bar with the question row. */}
      <header className="md:hidden">
        <div className="flex h-14 items-center justify-between border-b border-[#d8d3cb] bg-white px-4">
          {brandName}
          {backLink}
        </div>
        {question !== null && (
          <div className="flex h-12 items-center border-b border-[#d8d3cb] bg-white px-4">{questionRow(question)}</div>
        )}
      </header>
    </>
  );
}
