// The model bar's list (BRIEF Days 15–16, Run 2b §5). LIVE models only — never the `models` catalog.
//
// The catalog holds every model the Ministry publishes; the bar must offer only what a search can answer.
// So the list is built from the LISTINGS, on the same liveness predicate the pool assembly uses
// (`delisted_at: null` — src/lib/search/assemble.ts), and a model with no live listing is simply not there.
// That is also why "the model is not with us yet" is a real answer on this screen: the bar can say it.
//
// The key is modelKey()'s — the same normalisation assemblePool() and filterCounts() match on, so the value
// the bar hands back is the value runSearch() takes.
//
// The display name is `make + " " + model` AS STORED (§5). src/lib/names.ts is not used: it normalises a
// seller's business name for dedup and maps nothing about a car, and no new naming table is introduced here.

import { db } from "@/lib/db";
import { modelKey } from "./assemble";

export type LiveModel = {
  key: string; // modelKey(model) — what the search is run with
  make: string; // the Hebrew manufacturer, as models.make stores it
  model: string; // the Latin model, as models.model stores it
  display: string; // make + " " + model
  listings: number; // live listings of this model
};

/**
 * Every (make, model) with at least one live listing, by listing count descending, then by display name.
 *
 * A live listing whose make or model is null is a stop: it cannot be offered, and dropping it would quietly
 * hide a searchable model from the only place the screen lists them.
 */
export async function liveModels(): Promise<LiveModel[]> {
  const rows = await db.listings.findMany({
    where: { delisted_at: null },
    select: { id: true, car: { select: { model: { select: { make: true, model: true } } } } },
    orderBy: { id: "asc" },
  });

  const byKey = new Map<string, LiveModel>();
  for (const l of rows) {
    const { make, model } = l.car.model;
    if (model === null) throw new Error(`listing ${l.id}: models.model is null — it cannot be offered in the model bar`);
    if (make === null) throw new Error(`listing ${l.id}: models.make is null — the model bar's display name is make + model`);
    const key = modelKey(model);
    const seen = byKey.get(key);
    if (seen === undefined) {
      byKey.set(key, { key, make, model, display: `${make} ${model}`, listings: 1 });
      continue;
    }
    // One key, two makes, would make the display name a coin toss and model_stats unreadable (it is keyed on
    // (make, model)). filterCounts() stops on the same condition; so does this.
    if (seen.make !== make) throw new Error(`model '${model}' is live under two makes ('${seen.make}' and '${make}') — the bar cannot name it`);
    seen.listings += 1;
  }

  return [...byKey.values()].sort((a, b) => b.listings - a.listings || a.display.localeCompare(b.display));
}
