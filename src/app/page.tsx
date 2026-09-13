// The search screen's route (BRIEF Days 15–16, Run 2b §5). ONE route, "/" — the opening screen and the
// results are the same page, told apart by client state (§0.4). The URL carries no question in this run: a
// refresh returns to the opening screen, and shareable search URLs are a later.md line.
//
// Dynamic, never prerendered: the model bar offers LIVE models, and a build-time snapshot of the live
// listings would be a list that ages silently. The page therefore loads the models on the server on every
// request and hands them to the client screen — which is also why the bar has something to show before any
// JavaScript has run.
//
// Day 15's listings-count page is gone; nothing from it is kept.

import SearchScreen from "@/components/search/SearchScreen";
import { liveModels } from "@/lib/search/models";

export const dynamic = "force-dynamic";

export default async function Home() {
  const models = await liveModels();
  return <SearchScreen models={models} />;
}
