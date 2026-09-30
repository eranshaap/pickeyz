// BRIEF Day 19b Run 11a §1.4 — how long a sent request keeps the page's button in its "sent" state.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CALLBACK_MEMORY_DAYS, requestInForce, type RememberedRequest } from "./memory";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// 2026-09-23, Israel summer time (UTC+3).
const MORNING = new Date("2026-09-23T07:30:00Z"); // 10:30
const LATE = new Date("2026-09-23T20:30:00Z"); // 23:30 the SAME Israel day
const visit = (visit_at: Date): RememberedRequest => ({ kind: "visit", visit_at, created_at: new Date("2026-09-20T09:00:00Z") });
const callback = (created_at: Date): RememberedRequest => ({ kind: "callback", visit_at: null, created_at });

describe("requestInForce() — a visit (§1.4)", () => {
  it("a visit TODAY holds at any hour of today, before and after the meeting", () => {
    const today11 = new Date("2026-09-23T08:00:00Z"); // 11:00 Israel
    assert.equal(requestInForce(visit(today11), MORNING), true);
    assert.equal(requestInForce(visit(today11), LATE), true);
  });

  it("a visit still ahead holds", () => {
    assert.equal(requestInForce(visit(new Date("2026-09-30T08:00:00Z")), MORNING), true);
  });

  it("yesterday's visit does not hold", () => {
    assert.equal(requestInForce(visit(new Date("2026-09-22T08:00:00Z")), MORNING), false);
  });

  it("a visit row with no instant remembers nothing", () => {
    assert.equal(requestInForce({ kind: "visit", visit_at: null, created_at: MORNING }, MORNING), false);
  });

  it("the day is Israel's: a visit at 23:30 Israel is still today when now is 00:30 UTC of the next date", () => {
    // 2026-09-23T20:30Z is 23:30 on 23/09 in Israel; 2026-09-23T21:30Z is already 00:30 on 24/09 there.
    assert.equal(requestInForce(visit(LATE), new Date("2026-09-23T20:45:00Z")), true);
    assert.equal(requestInForce(visit(LATE), new Date("2026-09-23T21:30:00Z")), false);
  });
});

describe("requestInForce() — a callback (§1.4)", () => {
  it("holds for fourteen days from the send", () => {
    assert.equal(CALLBACK_MEMORY_DAYS, 14);
    assert.equal(requestInForce(callback(new Date(MORNING.getTime() - (13 * DAY + 23 * HOUR))), MORNING), true);
  });

  it("does not hold a minute past fourteen days", () => {
    assert.equal(requestInForce(callback(new Date(MORNING.getTime() - (14 * DAY + 60 * 1000))), MORNING), false);
  });

  it("a callback sent a moment ago holds", () => {
    assert.equal(requestInForce(callback(MORNING), MORNING), true);
  });

  it("a callback is never judged on its visit_at, even when one somehow sits there", () => {
    const stale = new Date("2020-01-01T00:00:00Z");
    assert.equal(requestInForce({ kind: "callback", visit_at: stale, created_at: MORNING }, MORNING), true);
  });
});
