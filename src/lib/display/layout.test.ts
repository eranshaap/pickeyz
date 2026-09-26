// BRIEF Run 2 (Days 24–25) §6.3 — the layout numbers, pinned to the CSS that actually draws them. Pure: no
// database, no clock, no DOM — one file read.
//
// WHY A TEST AND NOT A COMMENT. Two of these numbers exist twice by necessity: the boundary is a media query
// in src/app/globals.css and a number in layout.ts, and the container is a Tailwind class literal and a number
// beside it. Tailwind cannot be handed a computed class name and a media query cannot read a TypeScript
// constant, so the duplication cannot be removed — it can only be watched. These three cases are the watch.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DESKTOP_MIN_WIDTH_PX, RESULTS_CONTAINER_CLASS, RESULTS_CONTAINER_PADDING_PX, RESULTS_CONTAINER_PX, RESULTS_CONTENT_PX } from "./layout";

/** The stylesheet as it ships. Read from the project root, which is where `npm test` runs. */
const globals = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

describe("the phone/desktop boundary (§1.1, §1.2)", () => {
  it("globals.css declares --breakpoint-md exactly once, in rem, and it is DESKTOP_MIN_WIDTH_PX", () => {
    const hits = [...globals.matchAll(/--breakpoint-md:\s*([0-9.]+)rem\s*;/g)];
    assert.equal(hits.length, 1, "exactly one --breakpoint-md declaration, written in rem");
    assert.equal(Number(hits[0][1]) * 16, DESKTOP_MIN_WIDTH_PX);
  });

  it("no other breakpoint is declared", () => {
    const all = [...globals.matchAll(/--breakpoint-[a-z0-9-]+:/g)].map((m) => m[0]);
    assert.deepEqual(all, ["--breakpoint-md:"]);
  });
});

describe("the results screen's container (§2.1)", () => {
  it("RESULTS_CONTAINER_CLASS carries the container's width and its desktop padding", () => {
    assert.ok(RESULTS_CONTAINER_CLASS.includes(`max-w-[${RESULTS_CONTAINER_PX}px]`), RESULTS_CONTAINER_CLASS);
    assert.ok(RESULTS_CONTAINER_CLASS.includes("md:px-12"), RESULTS_CONTAINER_CLASS);
    assert.equal(12 * 4, RESULTS_CONTAINER_PADDING_PX); // Tailwind's spacing step is 4px
  });

  it("the content width is the container less its two paddings", () => {
    assert.equal(RESULTS_CONTENT_PX, RESULTS_CONTAINER_PX - 2 * RESULTS_CONTAINER_PADDING_PX);
  });
});
