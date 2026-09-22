// The results screen's loading skeleton (BRIEF Run 7 §7.2).
//
// This is the ONLY loading boundary in the app, and it belongs to `/` alone. §7.4 forbids one on
// `src/app/listing/[publicId]/**` in the strongest terms: a Suspense fallback is what makes the response
// start streaming, and once it has, the HTTP status is fixed at 200 — which would reopen exactly the soft
// 404 that Run 6b2 closed. The car page's feedback therefore lives on the element that was clicked (§7.1),
// never on the route.
//
// NO TEXT AND NO DUMMY DATA (§7.2): the white header bar and three grey card placeholders in the page
// background, nothing else. A skeleton that invents a price or a model name would be showing a car that is
// not there. The shapes match PickCards' own — the same gutters, the same 2xl radius — so the real cards
// land where the placeholders stood instead of jumping.

export default function Loading() {
  return (
    <div aria-hidden className="flex min-h-screen flex-col">
      {/* the white top bar the question row sits in */}
      <div className="h-[58px] shrink-0 border-b border-[#d8d3cb] bg-white" />

      <div className="flex flex-col gap-4 px-4 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[132px] rounded-2xl border border-neutral-200 bg-[#e6e2db]" />
        ))}
      </div>
    </div>
  );
}
