// The car's photo, and the box that stands in for one (BRIEF Run 1 §0.3e, §3.3) — ONE place, two screens.
//
// It was a private component of CarPageView.tsx. The pick cards need the same frame and the same placeholder
// (§3.3: "the page's placeholder in the same frame"), so it moved out whole; the car page's look does not
// change by one pixel — it passes the caption it always drew and gets the same box back.
//
// THE CAPTION IS THE ONE DIFFERENCE. The car page's placeholder carries "[תמונת הרכב]"; the card's does not,
// because that string is a BOARD placeholder and not a label a buyer should read (§3.3). So the caption is a
// prop: given, it is drawn under the glyph exactly as before; omitted, the box is the background and the
// glyph alone.
//
// WHERE THE SOURCE COMES FROM is not here: photoFor() (src/lib/search/load.ts) resolves a plate to a file,
// on the server, for both screens. This component receives a path or null and never looks anything up — which
// is what lets it render inside the results screen's client tree.

const GREY = "#665f58";
const PLACEHOLDER_BG = "#e6e2db";

function CarGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 48 24" className="h-8 w-16" fill="none" stroke={GREY} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M3 16v-3l4-1 3-5h16l5 5 10 1a3 3 0 0 1 3 3v3h-5" />
      <path d="M3 16h8m10 0h14" />
      <circle cx="15" cy="17" r="3" />
      <circle cx="38" cy="17" r="3" />
    </svg>
  );
}

export default function Photo({ src, className, caption }: { src: string | null; className: string; caption?: string }) {
  if (src !== null) {
    // eslint-disable-next-line @next/next/no-img-element -- a local file served from /public; no loader needed
    return <img src={src} alt="" className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} flex flex-col items-center justify-center gap-1`} style={{ background: PLACEHOLDER_BG }}>
      <CarGlyph />
      {caption !== undefined && (
        <span className="text-[13px]" style={{ color: GREY }}>
          {caption}
        </span>
      )}
    </div>
  );
}
