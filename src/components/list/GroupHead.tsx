// The group object (BRIEF Days 20–21, Run 2 §4.3) — the little two-line heading above a group of rows.
//
// ONE PLACE IN THE CODE: the below-threshold screen draws it over its rows of cars with no price comparison,
// and the bottom list of Days 24–25 will draw the same component over the same kind of group.
//
// IT KNOWS NO HEBREW. Both strings come in as props, decided by src/lib/display/edge-screens.ts (§2.4).

export default function GroupHead({ title, line }: { title: string; line: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
