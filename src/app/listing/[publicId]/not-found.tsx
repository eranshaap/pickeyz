// The car page's not-found boundary (BRIEF Run 6b2 §13.1, fix D1; rebuilt by Day 19b Run 24b §3).
//
// The car page's own white strip — TopStrip, the same code, not a copy — with no question row. When the
// address carries a search (`s`), BackToResults adds the link "חזרה לתוצאות" back to that search's results;
// it reads `s` in the browser, because a not-found page is given neither the route params nor the search
// params. Until it has, the server's strip without a back link stands in for it. Below the strip: the
// heading, a gray line and a button to a new search on the opening screen.
//
// It renders fixed content — no params, no data, nothing that touches the database — so that every site in
// page.tsx that used to return this markup can call notFound() instead and the response carries HTTP 404.
// The BLACK page (a real, shown listing with no search behind it) is NOT a 404 and does not come here.

import { Suspense } from "react";
import Link from "next/link";
import { BLACK, NOT_FOUND_BUTTON, NOT_FOUND_HEADING, NOT_FOUND_LINE } from "@/lib/display/texts";
import { BRAND } from "@/lib/brand";
import TopStrip from "@/components/car/TopStrip";
import BackToResults from "@/components/car/BackToResults";

const GREY = "#665f58";

export default function ListingNotFound() {
  return (
    <div className="min-h-screen" style={{ background: "#eeece8" }}>
      <Suspense fallback={<TopStrip brand={BRAND.name} question={null} back={null} />}>
        <BackToResults brand={BRAND.name} />
      </Suspense>
      {/* §3.3 — a first guess, judged on the live site. The button takes the contact button's height, padding,
          radius and type on each screen (ContactButton.tsx: 46px / px-7 / 15px on the phone, 48px / px-8 /
          16px from md up; rounded-lg; 600), in black. */}
      <main className="mx-auto mt-14 max-w-[480px] px-4 text-center md:mt-24">
        <h1 className="text-[20px] font-extrabold md:text-[22px]" style={{ color: BLACK, margin: 0 }}>
          {NOT_FOUND_HEADING}
        </h1>
        <p className="mt-2 text-[14px] leading-[1.5] md:text-[15px]" style={{ color: GREY }}>
          {NOT_FOUND_LINE}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-[46px] items-center rounded-lg px-7 text-[15px] font-semibold text-white md:h-12 md:px-8 md:text-[16px]"
          style={{ background: BLACK }}
        >
          {NOT_FOUND_BUTTON}
        </Link>
      </main>
    </div>
  );
}
