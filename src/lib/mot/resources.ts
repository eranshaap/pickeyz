// The only place that knows how the Ministry of Transport data is laid out.
// Nothing outside src/lib/mot/ imports from here.

export const MOT_API = "https://data.gov.il/api/3/action/datastore_search";

export const RESOURCES = {
  registry:     "053cea08-09bc-40ec-8f7a-156f0677aff3", // active vehicles
  history_km:   "56063a99-8a3e-4ff4-912e-5966c0279bad", // history 1: km at last test, origin
  history_hand: "bb2355dc-9ec7-4f06-9c3f-3344672171da", // history 2: ownership rows
  cancelled:    "851ecab1-0622-4dbe-a6c7-f950cf82abf9", // final cancellation
  // Downloaded manually; used as a prospect list and for onboarding lookup, not read by the import.
  dealers:      "eb74ad8c-ffcd-43bb-949c-2244fc8a8651", // licensed dealers (file)
} as const;

export const RAW_DIR = "data/raw";