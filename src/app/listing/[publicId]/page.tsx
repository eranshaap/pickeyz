// The car page's route (BRIEF Run 6b §7) — a server component. A page exists for EVERY listing shown on the
// site: per listing, not per car.
//
// WHAT IT READS, in the order §7.1 fixes:
//   1. VISIBILITY FIRST (§3.3). Not shown → the minimal "לא נמצא" page and nothing else.
//   2. The verdict (label / place / colour) ONLY when `s` is present and resolves — through the one loading
//      rule, loadForAddress(), which may itself write the run's one re-run (§4) — and then THIS listing's
//      row in the displayed run's `search_results`.
//   3. EVERYTHING ELSE IS READ FROM THE DATABASE, never from the run: the listing, its car and `models` row,
//      the dealer, the car's test readings, the CURRENT invoice (`listings.score_breakdown`), the norm row
//      via `listings.market_stats_id`, and the car's new price through the existing four-column join — which
//      is reused, not re-derived: assemblePool() already performed it for the pool this page's visibility
//      check assembled, so the price comes back on the pool item.
//
// Every display decision is made by the pure functions of src/lib/display/** (§8); this file only gathers
// the inputs and hands them over. Nothing is decided here.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { rubricStrip, type RubricStrip } from "@/lib/display/rubrics";
import {
  backLinkWord,
  CANCELLED_WORD,
  CATEGORY_LABEL,
  CATEGORY_COLOR,
  BLACK,
  noHistoryView,
  ownershipAxis,
  pageColor,
  percentOfNewLine,
  placeWord,
  priceBlock,
  zeroKmExplanation,
  type NoHistoryView,
  type OwnershipAxis,
} from "@/lib/display/texts";
import { versionLine } from "@/lib/display/version-line";
import { db } from "@/lib/db";
import { isPublicId } from "@/lib/public-id";
import { isCancelled, type Check, type Invoice, type Row } from "@/lib/scoring/types";
import { modelKey } from "@/lib/search/assemble";
import { activeFilterNames } from "@/lib/search/filters";
// Run 1 §0.3e — photoFor() moved to load.ts, where the recommendations screen's view builder also
// needs it: ONE resolution of a plate to a file for both screens. §7.3's rule is unchanged.
import { loadForAddress, photoFor, storedFilters, viewerFromCookies } from "@/lib/search/load";
// Days 24–25 Run 1 §1.3 / §4.8 — the ONE function that turns a search's stored rows into the place a reader
// sees. This page and the bottom list read it, so they cannot show one car two different numbers.
import { displayedPlaces } from "@/lib/search/places";
import { liveModels } from "@/lib/search/models";
import { resolveListing } from "@/lib/search/visibility";
import { isThinCell, type Category } from "@/lib/selection";
import { BRAND } from "@/lib/brand";
import CarPageView, { type CarPageData, type PageQuestion } from "@/components/car/CarPageView";
import type { FilterName } from "@/app/actions/search";

export const dynamic = "force-dynamic";

// §13.2 (D2) — every car page declares its BARE address as canonical: /listing/{publicId}, never carrying
// `s=` or any other query. searchParams is deliberately not read, so both address forms emit the same tag.
export async function generateMetadata({ params }: PageProps<"/listing/[publicId]">): Promise<Metadata> {
  const { publicId } = await params;
  return { alternates: { canonical: `/listing/${publicId}` } };
}

export default async function ListingPage(props: PageProps<"/listing/[publicId]">) {
  const { publicId } = await props.params;
  const params = await props.searchParams;
  const s = typeof params.s === "string" ? params.s : null;

  // ---- 1. visibility first (§7.1) -----------------------------------------
  // §13.1 (D1) — not shown on the site at all → HTTP 404 with not-found.tsx's minimal page.
  if (!isPublicId(publicId)) notFound();
  const resolved = await resolveListing(publicId);
  if (!resolved.visibility.shown || resolved.item === null) notFound();
  const item = resolved.item;

  // ---- 3. the database rows behind the page -------------------------------
  const listing = await db.listings.findUniqueOrThrow({
    where: { id: item.listing_id },
    select: {
      id: true,
      price: true,
      km_declared: true,
      hand_declared: true,
      region: true,
      score: true,
      market_stats_id: true,
      dealer: { select: { name: true, dealer_type: true, region: true } },
      car: {
        select: {
          license_plate: true,
          year: true,
          hand: true,
          ownership_history: true,
          color: true,
          registry_color: true,
          test_expiry: true,
          first_registration: true,
          cancelled_at: true,
          current_owner_type: true,
          model: { select: { model: true, sub_model: true, body_type: true, engine_size: true, transmission: true, vehicle_class: true } },
          test_readings: { select: { test_date: true, km: true }, orderBy: { test_date: "asc" } },
        },
      },
    },
  });
  const car = listing.car;
  if (car.year === null) throw new Error(`listing ${listing.id}: cars.year is null — the page's name line cannot be built`);

  const norm =
    listing.market_stats_id === null
      ? null
      : await db.market_stats.findUnique({ where: { id: listing.market_stats_id }, select: { median_price: true, sample_size: true, window_days: true } });

  // The CURRENT invoice — the only place the condition read, the confidence items and the fact rows live.
  const invoice = item.candidate.breakdown as Invoice;
  const cancelled = isCancelled(invoice);
  const kmCheck: Check | null = cancelled ? null : ((invoice.checks ?? []).find((c) => c.check === "km") ?? null);
  const historyRow: Row | undefined = cancelled ? undefined : invoice.rows.find((r) => r.row === "history");
  const historyRaw = (historyRow?.raw ?? {}) as { zero_km_deal?: boolean; months_to_first_private?: number };

  // ---- 2. the verdict, only when `s` resolves ------------------------------
  let labels: Category[] = [];
  let place: number | null = null;
  let question: PageQuestion | null = null;

  if (s !== null && isPublicId(s)) {
    const loaded = await loadForAddress(s, await viewerFromCookies());
    if (loaded !== null) {
      const row = loaded.results.find((r) => r.listing_id === listing.id);
      if (row !== undefined) {
        labels = row.recommendation_categories as Category[];
        // Days 24–25 Run 1 §4.8 — THE PLACE THIS PAGE SHOWS IS THE DISPLAYED PLACE (§1), not the stored rank:
        // the same number the list shows for the same car, from the same function. loadForAddress() already
        // returns every row of the displayed run in ONE query, with the five columns §1 reads, so the whole
        // search is classified here and this listing's place is looked up in the answer.
        //   a pick            → null, and the page draws its label as it always has
        //   a ranked non-pick → its displayed place, which sits below the cards' places
        //   no price / cancelled → null: no place at all. Before this run both showed their tail rank.
        //   rank null         → absent from the map, so null, exactly as before
        place = displayedPlaces(loaded.results).get(listing.id) ?? null;
      }
      const filters = storedFilters(loaded.question.filters);
      // Run 7c §11.2 — the row is TEXT here, so the live list is read for ONE thing: the model's display
      // spelling, which is the live list's when the model is still live and the stored string otherwise.
      // The model as searched and its key went with the sheet Run 7 §1 opened over this page.
      const models = await liveModels();
      const key = modelKey(loaded.run.model_searched);
      question = {
        modelDisplay: models.find((m) => m.key === key)?.display ?? loaded.run.model_searched,
        filters,
        active: activeFilterNames(filters) as FilterName[],
        publicId: loaded.question.public_id,
      };
    }
  }

  // §7.1 — a cancelled car: "ביטול סופי" in place of the place, black, and no fair number. It wins no
  // category by definition (rules v6 §8), so there is no label to drop.
  const shownLabels = cancelled ? [] : labels;
  const shownPlace = cancelled ? null : place;
  const color = cancelled ? BLACK : pageColor(shownLabels);

  // ---- the display decisions (all of them made in src/lib/display) --------

  // Run 9 §6.3 — ONE "today" FOR THE WHOLE RENDER. The ownership axis is drawn against it ("היום" and the
  // current ownership's duration), the km rubric's test line counts its months to it, and the licence rubric
  // takes its day in Israel from it. Read once, here: two `new Date()` calls a few lines apart could fall on
  // either side of midnight and let the axis and the rubric disagree about the date.
  const now = new Date();

  const history = Array.isArray(car.ownership_history) ? (car.ownership_history as { ym: string; type: string }[]) : [];
  let axis: OwnershipAxis | null = null;
  let noHistory: NoHistoryView | null = null;
  if (history.length > 0) {
    axis = ownershipAxis({
      history,
      first_registration: car.first_registration,
      now,
      zero_km_deal: historyRaw.zero_km_deal === true, // the INVOICE's fact; never recomputed
    });
  } else {
    noHistory = noHistoryView({ first_registration: car.first_registration, current_owner_type: car.current_owner_type, hand_declared: listing.hand_declared });
  }

  const strip: RubricStrip = rubricStrip({
    km: { km_declared: listing.km_declared, test_readings: car.test_readings, km_check: kmCheck, today: now },
    hand: { hand_declared: listing.hand_declared, registry_hand: car.hand, has_registry_history: history.length > 0 },
    color: {
      color: car.color,
      registry_color: car.registry_color,
      color_mismatch: cancelled ? undefined : invoice.facts?.color_mismatch,
      color_changed_reported: !cancelled && invoice.facts?.color_changed_reported === true,
    },
    licence: { test_expiry: car.test_expiry, now },
  });

  const newPrice = item.candidate.new_price;
  const data: CarPageData = {
    brand: BRAND.name,
    backHref: question === null ? "/" : `/?s=${question.publicId}`,
    backWord: backLinkWord({ hasQuestion: question !== null, labels: shownLabels }),
    question,
    color,
    labelWords: shownLabels.map((c) => ({ word: CATEGORY_LABEL[c], color: shownLabels.length === 1 ? color : CATEGORY_COLOR[c] })),
    labels: shownLabels,
    placeWord: cancelled ? CANCELLED_WORD : shownPlace === null ? null : placeWord(shownPlace),
    place: shownPlace,
    // Run 9 §3.1 — THE TWO PARTS, never a joined string: CarTitle puts a 0.4em gap between them and the
    // comma is gone. The model spelling itself is unchanged — it is the same `models.model` as before.
    model: car.model.model ?? "",
    year: car.year,
    versionLine: versionLine({
      model: car.model.model,
      body_type: car.model.body_type,
      engine_size: car.model.engine_size,
      transmission: car.model.transmission,
      sub_model: car.model.sub_model,
      vehicle_class: car.model.vehicle_class,
    }),
    imageSrc: photoFor(car.license_plate),
    price: listing.price,
    percentOfNew: newPrice === null ? null : percentOfNewLine(listing.price, newPrice),
    // A cancelled car has no invoice rows at all, so the thin-cell question is not asked of it (§7.1).
    priceBlock: priceBlock({
      score: cancelled ? null : listing.score,
      thin_cell: !cancelled && isThinCell(item.candidate),
      median_price: norm?.median_price ?? null,
      sample_size: norm?.sample_size ?? null,
      window_days: norm?.window_days ?? null,
    }),
    // Run 9 §4.3 — the region line reads THE LISTING's own region, the very field the filters window's region chips
    // read; §4.4 — the seller line, which used to carry the dealer's name, word and region, is gone. The
    // dealer row itself is still selected above and still read by everything else that reads it.
    region: listing.region,
    strip,
    axis,
    noHistory,
    zeroKmExplanation:
      historyRaw.zero_km_deal === true && typeof historyRaw.months_to_first_private === "number" ? zeroKmExplanation(historyRaw.months_to_first_private) : null,
    whyLines: [], // §7.7 — ALWAYS empty in this run; the justification generator is Days 22–23
  };

  return <CarPageView data={data} />;
}
