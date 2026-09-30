// BRIEF Day 19b Run 11a §1.5 — the event id, made in the BROWSER.
//
// PURE: no node:*, no next/*, no @/lib/db.
//
// events.id is not a database default (prisma/schema.prisma): the window knows the id of its own
// contact_opened row at the moment it opens, so the request it later sends can point at that row without
// waiting for a round trip, and a retried write of the same event creates no second row.
//
// crypto.randomUUID() exists only on a SECURE origin -- https, or localhost. The phone check over the home
// network is plain http against the laptop's LAN address, where randomUUID is simply absent while
// getRandomValues is not, so the fallback below is not a curiosity: it is the path that runs on the phone.

export const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True when the value has the shape of an event id. Says nothing about whether a row with it exists. */
export function isEventId(s: unknown): s is string {
  return typeof s === "string" && EVENT_ID_PATTERN.test(s);
}

export type RandomSource = { randomUUID?: () => string; getRandomValues: (a: Uint8Array) => Uint8Array };

/** A fresh version-4 id: the platform's when it has one, otherwise one built from 16 random bytes. */
export function newEventId(source: RandomSource = globalThis.crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();

  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
