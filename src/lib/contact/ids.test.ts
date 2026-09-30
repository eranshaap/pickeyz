// BRIEF Day 19b Run 11a §1.5 — the event id, from the platform and from the fallback the phone takes.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EVENT_ID_PATTERN, isEventId, newEventId, type RandomSource } from "./ids";

/** A source WITHOUT randomUUID — exactly what a page served over plain http sees. */
const NO_UUID: RandomSource = { getRandomValues: (a) => globalThis.crypto.getRandomValues(a) };

describe("newEventId() (§1.5)", () => {
  it("the default source gives an id of the right shape", () => {
    assert.match(newEventId(), EVENT_ID_PATTERN);
  });

  it("a source without randomUUID gives one too, with version 4 and the right variant", () => {
    const id = newEventId(NO_UUID);
    assert.match(id, EVENT_ID_PATTERN);
    assert.equal(id[14], "4");
    assert.ok(["8", "9", "a", "b"].includes(id[19]), `variant digit was ${JSON.stringify(id[19])}`);
  });

  it("a thousand fallback ids are all distinct", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(newEventId(NO_UUID));
    assert.equal(seen.size, 1000);
  });
});

describe("isEventId() (§1.5)", () => {
  it("accepts an id from either source", () => {
    assert.equal(isEventId(newEventId()), true);
    assert.equal(isEventId(newEventId(NO_UUID)), true);
  });

  it("refuses what is not one", () => {
    for (const v of ["", "abc", "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz", 12345, null, undefined, {}]) {
      assert.equal(isEventId(v), false, JSON.stringify(v));
    }
  });

  it("refuses an UPPERCASE id — the column stores the lowercase form this library makes", () => {
    assert.equal(isEventId(newEventId(NO_UUID).toUpperCase()), false);
  });
});
