import type { Metadata, Viewport } from "next";
import { Assistant } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/brand";

// BRIEF Run 7 §4 — ONE FONT, LOADED, EVERYWHERE.
//
// The approved boards load Assistant (400/600/700/800) and use the stack `'Assistant', 'Segoe UI', Arial,
// sans-serif` for everything; that is the spec, and this is the one place it is declared. next/font/google
// self-hosts the files at build time, so the page makes no runtime request to Google and there is no
// render-blocking stylesheet — the build-time fetch is the whole point of the API.
//
// WHY WINDOWS SPLIT THE FONTS (§4.2): nothing here loaded a Hebrew font at all. `globals.css` set
// `body { font-family: Arial, Helvetica, sans-serif }` while Geist — a LATIN-ONLY subset — governed <html>
// through Tailwind's `--font-sans`. Every Hebrew glyph therefore fell out of both and landed on whatever the
// platform chose, and Windows answers a `font-weight: 800` request on the Arial family with a different face
// than it answers 400 with. The headings and the body were genuinely two fonts. They are one now.
//
// The class carries the CSS variable rather than the font's own className, because the stack has to continue
// past Assistant into 'Segoe UI' and Arial; globals.css composes it in exactly one declaration.
const assistant = Assistant({
  weight: ["400", "600", "700", "800"],
  subsets: ["hebrew", "latin"],
  display: "swap",
  variable: "--font-assistant",
});

// BRIEF Run 3 (Days 24–25) §4.4 — `suppressHydrationWarning` ON <html>, AND NOWHERE ELSE. The inline script
// of PickCards writes the pick form's attribute and the photo box's two custom properties onto this element
// while the browser is still parsing the page, so that the server-rendered first paint of the recommendations
// screen is already the right form at the right size. Those three things are not React's, and React compares the DOM
// against its own output when it hydrates; this attribute is the standard way to tell it that on this one
// element the DOM wins (Next.js, "How to prevent flash before hydration"). It suppresses nothing below <html>.
//
// Metadata and viewport only (BRIEF Run 2b, ALLOWED). The element, the lang and the dir are untouched —
// `dir="rtl"` was already set and every screen relies on it.
export const metadata: Metadata = {
  title: BRAND.name,
  description: "שלושה רכבים, לא מאה: המשתלם ביותר, ראש שקט, והכי חסכוני.",
};

// The screen is mobile-first, so the layout viewport has to be the device's. Without this the phone renders
// at ~980 px and the bottom "חפש" bar and the filters window are laid out for a screen nobody is holding.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning className={`${assistant.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
