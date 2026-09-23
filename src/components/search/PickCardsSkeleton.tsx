// The recommendations area's placeholders (BRIEF Run 7c §11.3).
//
// These are the three grey cards Run 7 §7.2 drew in `src/app/(results)/loading.tsx`, moved here whole. The
// white header bar that stood beside them there is NOT here, and that is the whole point of the move: the
// real bar, the question row and the drawer stay on screen and are not rebuilt, so only the cards area has
// anything to stand in for. The route-level boundary is gone — this is a pending state of the results
// screen itself, in the browser, and it is shown only for a navigation that screen started from its own
// controls ("עדכן", a model picked from the search bar). A cold arrival gets no placeholder at all.
//
// NO TEXT AND NO DUMMY DATA (§7.2): a skeleton that invents a price or a model name would be showing a car
// that is not there. The shapes match PickCards' own — the same gutters, the same 2xl radius — so the real
// cards land where the placeholders stood instead of jumping.

export default function PickCardsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 px-4 py-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[132px] rounded-2xl border border-neutral-200 bg-[#e6e2db]" />
      ))}
    </div>
  );
}
