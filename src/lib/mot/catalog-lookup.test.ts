// Day 19ב §4 — the one-version lookup in the ministry's online catalog: the URL it asks, the three
// answers it can get (one record, none, more than one) and the ministry that does not answer.
// No network: fetchImpl is injected.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchCatalogVersion } from "./catalog-lookup";
import { MotUnavailableError } from "./fetch";
import { CATALOG_RESOURCE_ID } from "./resources";

const MAZDA = { vehicleClass: "P", tozeretCd: "00588", degemCd: "00237", year: "2021" } as const;

type Call = { url: string };

function fakeFetch(answers: (Response | Error)[]): { impl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request) => {
    calls.push({ url: String(url) });
    const answer = answers[calls.length - 1];
    if (answer === undefined) throw new Error(`fakeFetch: no answer for call ${calls.length}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const records = (rows: unknown[]) => ok({ success: true, result: { records: rows } });

// The record as the API gives it (Run 15-discovery): numbers as numbers, text trimmed, its own _id.
const MAZDA_RECORD = {
  _id: 4211,
  sug_degem: "P",
  tozeret_cd: 588,
  degem_cd: 237,
  shnat_yitzur: 2021,
  tozar: "מאזדה",
  kinuy_mishari: "MAZDA 3",
  CO2_WLTP: 160,
  hanaa_nm: "קדמי",
};

const deps = { sleep: async () => {} };

describe("fetchCatalogVersion — the request (§4)", () => {
  it("asks the catalog resource with the four identity filters, every value a string", async () => {
    const { impl, calls } = fakeFetch([records([MAZDA_RECORD])]);
    await fetchCatalogVersion(MAZDA, { ...deps, fetchImpl: impl });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get("resource_id"), CATALOG_RESOURCE_ID);
    assert.deepEqual(JSON.parse(url.searchParams.get("filters")!), {
      sug_degem: "P",
      tozeret_cd: "00588",
      degem_cd: "00237",
      shnat_yitzur: "2021",
    });
  });

  it("numbers given without their leading zeros are asked as they were given", async () => {
    const { impl, calls } = fakeFetch([records([MAZDA_RECORD])]);
    await fetchCatalogVersion({ vehicleClass: "P", tozeretCd: 588, degemCd: 237, year: 2021 }, { ...deps, fetchImpl: impl });
    assert.deepEqual(JSON.parse(new URL(calls[0].url).searchParams.get("filters")!), {
      sug_degem: "P",
      tozeret_cd: "588",
      degem_cd: "237",
      shnat_yitzur: "2021",
    });
  });
});

describe("fetchCatalogVersion — the answers (§4)", () => {
  it("one record: found, through catalogRowFromApi — the numbers are strings and _id is gone", async () => {
    const { impl } = fakeFetch([records([MAZDA_RECORD])]);
    const answer = await fetchCatalogVersion(MAZDA, { ...deps, fetchImpl: impl });
    assert.equal(answer.kind, "found");
    if (answer.kind !== "found") return;
    assert.equal(answer.row.CO2_WLTP, "160");
    assert.equal(answer.row.tozeret_cd, "588");
    assert.equal(answer.row.degem_cd, "237");
    assert.equal(answer.row.shnat_yitzur, "2021");
    assert.equal(answer.row.kinuy_mishari, "MAZDA 3");
    assert.equal("_id" in answer.row, false);
  });

  it("no records: absent — a version that is not in the catalog", async () => {
    const { impl } = fakeFetch([records([])]);
    assert.deepEqual(await fetchCatalogVersion(MAZDA, { ...deps, fetchImpl: impl }), { kind: "absent" });
  });

  it("two records: ambiguous, with the count — not a rejection (F3f)", async () => {
    const { impl } = fakeFetch([records([MAZDA_RECORD, { ...MAZDA_RECORD, _id: 4212 }])]);
    assert.deepEqual(await fetchCatalogVersion(MAZDA, { ...deps, fetchImpl: impl }), { kind: "ambiguous", rows: 2 });
  });

  it("three records: ambiguous, with the count (F3f)", async () => {
    const { impl } = fakeFetch([
      records([MAZDA_RECORD, { ...MAZDA_RECORD, _id: 4212 }, { ...MAZDA_RECORD, _id: 4213 }]),
    ]);
    assert.deepEqual(await fetchCatalogVersion(MAZDA, { ...deps, fetchImpl: impl }), { kind: "ambiguous", rows: 3 });
  });

  it("a ministry that does not answer twice: MotUnavailableError, untouched", async () => {
    const { impl, calls } = fakeFetch([new TypeError("fetch failed"), new TypeError("fetch failed")]);
    await assert.rejects(() => fetchCatalogVersion(MAZDA, { ...deps, fetchImpl: impl }), MotUnavailableError);
    assert.equal(calls.length, 2);
  });
});
