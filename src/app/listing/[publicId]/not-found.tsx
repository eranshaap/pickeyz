// The car page's not-found boundary (BRIEF Run 6b2 §13.1, fix D1).
//
// The markup is the one §7.1 fixes, moved here unchanged from page.tsx: the white bar with the brand name,
// a "לחיפוש" link to /, and the text "לא נמצא". Nothing else.
//
// It renders fixed content — no params, no data, nothing that touches the database — so that every site in
// page.tsx that used to return this markup can call notFound() instead and the response carries HTTP 404.
// The BLACK page (a real, shown listing with no search behind it) is NOT a 404 and does not come here.

import Link from "next/link";
import { BLACK, NOT_FOUND } from "@/lib/display/texts";
import { BRAND } from "@/lib/brand";

const TO_SEARCH = "לחיפוש";

export default function ListingNotFound() {
  return (
    <div className="min-h-screen" style={{ background: "#eeece8" }}>
      <header className="flex h-14 items-center justify-between border-b border-[#d8d3cb] bg-white px-4 md:h-16 md:px-6">
        <Link href="/" className="text-[17px] font-extrabold" style={{ color: BLACK }}>
          {BRAND.name}
        </Link>
        <Link href="/" className="text-[15px] font-semibold underline underline-offset-4" style={{ color: BLACK }}>
          {TO_SEARCH}
        </Link>
      </header>
      <main className="px-4 py-16 md:px-12">
        <p className="text-[18px]" style={{ color: BLACK }}>
          {NOT_FOUND}
        </p>
      </main>
    </div>
  );
}
