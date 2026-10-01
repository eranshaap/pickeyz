// Day 19ב §3.4 — the one door to the ministry: one GET, one retry after MOT_RETRY_PAUSE_MS, and
// then MotUnavailableError. Every failure kind counts as a failed attempt, and the abort signal of
// MOT_TIMEOUT_MS rides on the request. No network here: fetchImpl and sleep are injected.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MOT_RETRY_PAUSE_MS } from "./constants";
import { MotUnavailableError, fetchRowsFresh, motGet, samplePlates, type MotDeps } from "./fetch";

const URL = "https://data.gov.il/api/3/action/datastore_search?resource_id=x";

type Call = { url: string; init?: RequestInit };

// A fetch that answers the given answers in order; an Error answer is a rejected fetch.
function fakeFetch(answers: (Response | Error)[]): { impl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const answer = answers[calls.length - 1];
    if (answer === undefined) throw new Error(`fakeFetch: no answer for call ${calls.length}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const text = (body: string, status = 200): Response => new Response(body, { status });

const good = { success: true, result: { records: [{ mispar_rechev: 12345678 }] } };

// The pauses the helper asked for, and no real waiting.
function spySleep(): { sleep: NonNullable<MotDeps["sleep"]>; pauses: number[] } {
  const pauses: number[] = [];
  return { sleep: async (ms: number) => void pauses.push(ms), pauses };
}

describe("motGet — the happy path (§3.2)", () => {
  it("a good answer on the first attempt: one call, no pause, body and raw text", async () => {
    const { impl, calls } = fakeFetch([ok(good)]);
    const { sleep, pauses } = spySleep();
    const { body, text: raw } = await motGet<{ mispar_rechev: number }>(URL, { fetchImpl: impl, sleep });
    assert.equal(calls.length, 1);
    assert.deepEqual(pauses, []);
    assert.deepEqual(body.result?.records, good.result.records);
    assert.equal(raw, JSON.stringify(good));
  });

  it("the request carries our User-Agent and an abort signal", async () => {
    const { impl, calls } = fakeFetch([ok(good)]);
    await motGet(URL, { fetchImpl: impl, sleep: async () => {} });
    const init = calls[0].init!;
    assert.equal((init.headers as Record<string, string>)["User-Agent"], "vehicle-research-script/0.1");
    assert.ok(init.signal instanceof AbortSignal, "an AbortSignal is passed to fetchImpl");
    assert.equal(init.signal!.aborted, false);
  });

  it("the signal is already aborted when the timeout has passed", async () => {
    const { impl, calls } = fakeFetch([ok(good)]);
    await motGet(URL, { fetchImpl: impl, sleep: async () => {}, timeoutMs: 0 });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(calls[0].init!.signal!.aborted, true);
  });
});

describe("motGet — one retry (§3.2)", () => {
  it("a failed first attempt then a good one: two calls, one pause of MOT_RETRY_PAUSE_MS", async () => {
    const { impl, calls } = fakeFetch([text("<html>down</html>", 503), ok(good)]);
    const { sleep, pauses } = spySleep();
    const { body } = await motGet<{ mispar_rechev: number }>(URL, { fetchImpl: impl, sleep });
    assert.equal(calls.length, 2);
    assert.deepEqual(pauses, [MOT_RETRY_PAUSE_MS]);
    assert.deepEqual(body.result?.records, good.result.records);
  });

  it("the injected retryPauseMs is the one waited", async () => {
    const { impl } = fakeFetch([ok({ success: false }), ok(good)]);
    const { sleep, pauses } = spySleep();
    await motGet(URL, { fetchImpl: impl, sleep, retryPauseMs: 42 });
    assert.deepEqual(pauses, [42]);
  });

  it("two failures: MotUnavailableError after exactly two calls, naming both", async () => {
    const { impl, calls } = fakeFetch([ok({ success: false }), text("nope", 500)]);
    const { sleep, pauses } = spySleep();
    await assert.rejects(
      () => motGet(URL, { fetchImpl: impl, sleep }),
      (e: Error) => {
        assert.ok(e instanceof MotUnavailableError, "MotUnavailableError");
        assert.equal(e.name, "MotUnavailableError");
        assert.match(e.message, /success=false/);
        assert.match(e.message, /non-JSON body \(HTTP 500\)/);
        assert.ok(e.message.includes(URL));
        return true;
      },
    );
    assert.equal(calls.length, 2);
    assert.deepEqual(pauses, [MOT_RETRY_PAUSE_MS]);
  });
});

describe("motGet — every kind of failure is a failed attempt (§3.2)", () => {
  const kinds: [string, Response | Error][] = [
    ["a rejected fetch (network)", new TypeError("fetch failed")],
    ["an abort", Object.assign(new Error("This operation was aborted"), { name: "AbortError" })],
    ["status 500", text("server error", 500)],
    ["a non-JSON body", text("<html>hello</html>", 200)],
    ["success: false", ok({ success: false, error: { message: "bad filter" } })],
  ];

  for (const [name, failure] of kinds) {
    it(`${name}: retried once, then MotUnavailableError`, async () => {
      const { impl, calls } = fakeFetch([failure, failure]);
      const { sleep, pauses } = spySleep();
      await assert.rejects(() => motGet(URL, { fetchImpl: impl, sleep }), MotUnavailableError);
      assert.equal(calls.length, 2);
      assert.deepEqual(pauses, [MOT_RETRY_PAUSE_MS]);
    });

    it(`${name}: a good retry still answers`, async () => {
      const { impl, calls } = fakeFetch([failure, ok(good)]);
      const { body } = await motGet<{ mispar_rechev: number }>(URL, { fetchImpl: impl, sleep: async () => {} });
      assert.equal(calls.length, 2);
      assert.deepEqual(body.result?.records, good.result.records);
    });
  }
});

describe("the plate callers go through motGet (§3.3)", () => {
  it("fetchRowsFresh returns the records and the raw text, and asks the right resource", async () => {
    const { impl, calls } = fakeFetch([ok(good)]);
    const out = await fetchRowsFresh<{ mispar_rechev: number }>("registry", "12345678", {
      fetchImpl: impl,
      sleep: async () => {},
    });
    assert.deepEqual(out.records, good.result.records);
    assert.equal(out.text, JSON.stringify(good));
    assert.ok(calls[0].url.includes("053cea08-09bc-40ec-8f7a-156f0677aff3"));
    assert.ok(calls[0].url.includes(encodeURIComponent(JSON.stringify({ mispar_rechev: 12345678 }))));
  });

  it("fetchRowsFresh fails with MotUnavailableError after one retry", async () => {
    const { impl, calls } = fakeFetch([text("down", 503), text("down", 503)]);
    await assert.rejects(
      () => fetchRowsFresh("history_km", "12345678", { fetchImpl: impl, sleep: async () => {} }),
      MotUnavailableError,
    );
    assert.equal(calls.length, 2);
  });

  it("samplePlates returns the plates as strings", async () => {
    const { impl, calls } = fakeFetch([ok({ success: true, result: { records: [{ mispar_rechev: 1 }, { mispar_rechev: 2 }] } })]);
    const plates = await samplePlates({ tozeret_cd: 588 }, 2, { fetchImpl: impl, sleep: async () => {} });
    assert.deepEqual(plates, ["1", "2"]);
    assert.ok(calls[0].url.includes("limit=2"));
  });
});
