// BRIEF Day 19b Run 11a §1.1 — the days and the hours. Every instant here is FIXED: a test that reads the
// clock passes in the morning and fails on a Friday evening, which is the one thing this file is for.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  CLOSE_HOUR,
  dayOptions,
  FRIDAY_CLOSE_HOUR,
  hoursFor,
  israelInstant,
  israelNow,
  OPEN_HOUR,
  visitSlotValid,
  weekdayOf,
  WINDOW_DAYS,
} from "./schedule";

// 2026-09-23 is a Wednesday, 2026-09-25 a Friday, 2026-09-26 a Saturday. Israel is on summer time (UTC+3).
const WED_10_30 = new Date("2026-09-23T07:30:00Z");
const WED_18_10 = new Date("2026-09-23T15:10:00Z");

describe("israelNow() reads the Israel wall clock, never the machine's (§1.1)", () => {
  it("a UTC instant becomes its Israel day, hour and minute", () => {
    assert.deepEqual(israelNow(WED_10_30), { day: "2026-09-23", hour: 10, minute: 30 });
  });

  it("an instant late in the UTC evening is already the next day in Israel", () => {
    assert.deepEqual(israelNow(new Date("2026-09-23T21:30:00Z")), { day: "2026-09-24", hour: 0, minute: 30 });
  });
});

describe("weekdayOf() and addDays() (§1.1)", () => {
  it("a date-only string carries its calendar weekday", () => {
    assert.equal(weekdayOf("2026-09-23"), 3);
    assert.equal(weekdayOf("2026-09-25"), 5);
    assert.equal(weekdayOf("2026-09-26"), 6);
  });

  it("addDays walks forwards and backwards across a month boundary", () => {
    assert.equal(addDays("2026-09-23", 13), "2026-10-06");
    assert.equal(addDays("2026-10-01", -1), "2026-09-30");
    assert.equal(addDays("2026-09-23", 0), "2026-09-23");
  });
});

describe("hoursFor() — the whole hours of one day (§1.1)", () => {
  const morning = { day: "2026-09-23", hour: 10, minute: 30 };

  it("a Wednesday at 10:30 offers 11..18 today: the 10:00 slot has BEGUN, so it has passed", () => {
    assert.deepEqual(hoursFor("2026-09-23", morning), [11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it("an ordinary day that is not today offers the whole 9..18", () => {
    assert.deepEqual(hoursFor("2026-09-24", morning), [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    assert.equal(OPEN_HOUR, 9);
    assert.equal(CLOSE_HOUR, 18);
  });

  it("a Friday ends at 15:00", () => {
    assert.deepEqual(hoursFor("2026-09-25", morning), [9, 10, 11, 12, 13, 14, 15]);
    assert.equal(FRIDAY_CLOSE_HOUR, 15);
  });

  it("a Saturday has no hours at all", () => {
    assert.deepEqual(hoursFor("2026-09-26", morning), []);
  });

  it("today after the last slot has begun has nothing left", () => {
    assert.deepEqual(hoursFor("2026-09-23", { day: "2026-09-23", hour: 18, minute: 10 }), []);
  });
});

describe("dayOptions() — the window's row (§1.1)", () => {
  it("a plain morning gives WINDOW_DAYS entries, the last being today + 13", () => {
    const days = dayOptions(WED_10_30);
    assert.equal(days.length, WINDOW_DAYS);
    assert.equal(days[0].day, "2026-09-23");
    assert.equal(days[days.length - 1].day, addDays("2026-09-23", WINDOW_DAYS - 1));
    assert.equal(days[days.length - 1].day, "2026-10-06");
  });

  it("today's own entry carries only the hours that have not begun", () => {
    assert.deepEqual(dayOptions(WED_10_30)[0], {
      day: "2026-09-23",
      weekday: 3,
      closed: false,
      hours: [11, 12, 13, 14, 15, 16, 17, 18],
    });
  });

  it("at 18:10 today is DROPPED and the row starts tomorrow, so it holds one entry fewer", () => {
    const days = dayOptions(WED_18_10);
    assert.equal(days[0].day, "2026-09-24");
    assert.equal(days.length, WINDOW_DAYS - 1);
    assert.equal(days[days.length - 1].day, "2026-10-06");
  });

  it("Saturday stays in the row, closed and hourless", () => {
    const saturday = dayOptions(WED_10_30).find((d) => d.day === "2026-09-26");
    assert.deepEqual(saturday, { day: "2026-09-26", weekday: 6, closed: true, hours: [] });
  });

  it("the Friday inside the row ends at 15:00 and is not closed", () => {
    const friday = dayOptions(WED_10_30).find((d) => d.day === "2026-09-25");
    assert.deepEqual(friday, { day: "2026-09-25", weekday: 5, closed: false, hours: [9, 10, 11, 12, 13, 14, 15] });
  });
});

describe("israelInstant() — the hour in Israel, across both clock changes (§1.1)", () => {
  it("winter, UTC+2: 12:00 on 2026-03-26 is 10:00Z", () => {
    assert.equal(israelInstant("2026-03-26", 12).toISOString(), "2026-03-26T10:00:00.000Z");
  });

  it("summer time begins on 2026-03-27: 12:00 that day is 09:00Z", () => {
    assert.equal(israelInstant("2026-03-27", 12).toISOString(), "2026-03-27T09:00:00.000Z");
  });

  it("still summer on 2026-10-24: 12:00 is 09:00Z", () => {
    assert.equal(israelInstant("2026-10-24", 12).toISOString(), "2026-10-24T09:00:00.000Z");
  });

  it("winter time returns on 2026-10-25: 12:00 that day is 10:00Z", () => {
    assert.equal(israelInstant("2026-10-25", 12).toISOString(), "2026-10-25T10:00:00.000Z");
  });

  it("what goes in comes back out: israelNow() of the instant is the day and hour asked for", () => {
    for (const day of ["2026-03-26", "2026-03-27", "2026-09-23", "2026-10-24", "2026-10-25"]) {
      for (const hour of [9, 12, 18]) {
        assert.deepEqual(israelNow(israelInstant(day, hour)), { day, hour, minute: 0 });
      }
    }
  });
});

describe("visitSlotValid() — the server's anti-tamper check (§1.1)", () => {
  it("an ordinary slot inside the window passes", () => {
    assert.equal(visitSlotValid(israelInstant("2026-09-24", 11), WED_10_30), true);
  });

  it("a Saturday is refused", () => {
    assert.equal(visitSlotValid(israelInstant("2026-09-26", 11), WED_10_30), false);
  });

  it("16:00 on a Friday is refused", () => {
    assert.equal(visitSlotValid(israelInstant("2026-09-25", 16), WED_10_30), false);
    assert.equal(visitSlotValid(israelInstant("2026-09-25", 15), WED_10_30), true);
  });

  it("a slot that is not on the hour is refused", () => {
    const halfPast = new Date(israelInstant("2026-09-24", 10).getTime() + 30 * 60 * 1000);
    assert.equal(visitSlotValid(halfPast, WED_10_30), false);
  });

  it("two days ago is refused; yesterday is still inside the span", () => {
    assert.equal(visitSlotValid(israelInstant("2026-09-21", 11), WED_10_30), false);
    assert.equal(visitSlotValid(israelInstant("2026-09-22", 11), WED_10_30), true);
  });

  it("today + 14 is refused; today + 13 is the last day accepted", () => {
    assert.equal(visitSlotValid(israelInstant("2026-10-07", 11), WED_10_30), false);
    assert.equal(visitSlotValid(israelInstant("2026-10-06", 11), WED_10_30), true);
  });

  it("a slot that BEGAN while the form was being filled is accepted: today's 10:00 checked at 10:05", () => {
    assert.equal(visitSlotValid(israelInstant("2026-09-23", 10), new Date("2026-09-23T07:05:00Z")), true);
  });

  it("an hour outside the day's range is refused at both ends", () => {
    assert.equal(visitSlotValid(israelInstant("2026-09-24", 8), WED_10_30), false);
    assert.equal(visitSlotValid(israelInstant("2026-09-24", 19), WED_10_30), false);
  });
});
