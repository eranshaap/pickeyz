// The group object (BRIEF Days 20–21, Run 2 §4.3) — the little two-line heading above a group of rows.
//
// ONE PLACE IN THE CODE: the below-threshold screen draws it over its rows of cars with no price comparison,
// and the bottom list of Days 24–25 will draw the same component over the same kind of group.
//
// IT KNOWS NO HEBREW. Both strings come in as props, decided by src/lib/display/edge-screens.ts (§2.4).
//
// RUN 2b (Days 24–25) §3.1 — THE AIR ABOVE IT IS THIS COMPONENT'S OWN: a 12px top margin on both devices, on
// top of whatever gap the parent stack already puts between its children, so the heading belongs to its grey
// line and its rows and stands off from what is above it. It is here and not in the parents because the
// component is the one place the group object lives (work.md, "מבנה חוזר = מקום אחד בקוד"), and no parent
// gap changes: the two uncrowned screens go 28 → 40 on the desktop and 16 → 28 on the phone, and the bottom
// list 16 → 28 on both. Claude's estimate, 26/09 — move by eye on the live site.

export default function GroupHead({ title, line }: { title: string; line: string }) {
  return (
    <div className="mt-3" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* §4.3 — 15px on the phone, 16px on the desktop. */}
      <h3 className="text-[15px] md:text-[16px]" style={{ margin: 0, fontWeight: 700, color: "#221f1c" }}>
        {title}
      </h3>
      {/* §4.3 — line-height 1.45 on the phone, normal on the desktop. */}
      <p className="leading-[1.45] md:leading-normal" style={{ margin: 0, fontSize: 13, color: "#665f58" }}>
        {line}
      </p>
    </div>
  );
}
