// Day 19b Run 18 §5 — the one place the section frame and its heading are written (work.md: a structure that
// repeats across screens lives in one place).
//
// The WHITE BOX IS NOT PART OF THIS COMPONENT. The page's three sections differ in their box: the ownership
// axis card has its own padding, "למה" has p-4, and "מפרט ואבזור" has 4px 16px on the phone and 6px 24px on
// the computer. So the box stays each section's own and arrives here as `children`; what is shared is the
// frame, the 12px under the heading, and the heading's own size, weight and colour.

export default function CarSection({
  heading,
  color,
  children,
}: {
  heading: string;
  /** The page colour — it paints the heading and nothing else. */
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[17px] font-extrabold md:text-[18px]" style={{ color }}>
        {heading}
      </h2>
      {children}
    </section>
  );
}
