"use client";

// The "not found" page's strip with its back link (BRIEF Day 19b Run 24b §3.2). Next.js gives a not-found
// page neither the route params nor the search params, so the search id is read here, in the browser, from
// the address's `s`. With it → TopStrip with the car page's back link to that search's results; `s` missing
// or empty → TopStrip with no back link. The results screen loads `/?s=` through the same resolver the car
// page uses, so a re-run's id opens the same question.
//
// The word is backLinkWord's own answer for a car with a question and no label — not typed again here.

import { useSearchParams } from "next/navigation";
import { backLinkWord, resultsHref } from "@/lib/display/texts";
import TopStrip from "./TopStrip";

const BACK_WORD = backLinkWord({ hasQuestion: true, labels: [] });

export default function BackToResults({ brand }: { brand: string }) {
  const s = useSearchParams().get("s");
  return <TopStrip brand={brand} question={null} back={s ? { href: resultsHref(s), word: BACK_WORD } : null} />;
}
