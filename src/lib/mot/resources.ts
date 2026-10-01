// The only place that knows how the Ministry of Transport data is laid out.
// Nothing outside src/lib/mot/ imports from here.

export const MOT_API = "https://data.gov.il/api/3/action/datastore_search";

export const RESOURCES = {
  registry:     "053cea08-09bc-40ec-8f7a-156f0677aff3", // active vehicles
  history_km:   "56063a99-8a3e-4ff4-912e-5966c0279bad", // history 1: km at last test, origin
  history_hand: "bb2355dc-9ec7-4f06-9c3f-3344672171da", // history 2: ownership rows
  cancelled:    "851ecab1-0622-4dbe-a6c7-f950cf82abf9", // final cancellation
  // "כלי רכב לא פעילים עם קוד דגם" (rechev_le_pail_with_degem): ~603K vehicles, updated daily,
  // same fields as the active registry record. A plate sitting here is off the road (expired
  // registration), not cancelled. The variant without a model code
  // (6f6acd03-f351-4a8f-8ecf-df792f4f573a) is deliberately not used: a car without a model
  // code cannot be placed in `models` anyway.
  inactive:     "f6efe89a-fb3d-43a4-bb61-9bf12a9b9099", // inactive vehicles, with degem code
  // Downloaded manually; used as a prospect list and for onboarding lookup, not read by the import.
  dealers:      "eb74ad8c-ffcd-43bb-949c-2244fc8a8651", // licensed dealers (file)
} as const;

// The models catalog itself (WLTP), the same table as data/raw/catalog.csv: package
// "degem-rechev-wltp", 94 fields in the file's own order, updated daily. Queried one version at a
// time by the four identity fields (sug_degem, tozeret_cd, degem_cd, shnat_yitzur) — see
// catalog-lookup.ts. Deliberately NOT in RESOURCES: that map is the plate-based resources only.
export const CATALOG_RESOURCE_ID = "142afde2-6228-49f9-8a29-9b6c3a0cbe40";

export const RAW_DIR = "data/raw";