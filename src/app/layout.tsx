import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata and viewport only (BRIEF Run 2b, ALLOWED). The fonts are Day 29's business and are untouched;
// so are the element, the lang and the dir — `dir="rtl"` was already set and the screen relies on it.
export const metadata: Metadata = {
  title: BRAND.name,
  description: "שלושה רכבים, לא מאה: המשתלם ביותר, ראש שקט, והכי חסכוני.",
};

// The screen is mobile-first, so the layout viewport has to be the device's. Without this the phone renders
// at ~980 px and the bottom "חפש" bar and the drawer are laid out for a screen nobody is holding.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
