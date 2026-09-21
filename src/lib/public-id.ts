// Day 19 (Run 6a) — the public id: the id of a listing or a search in every address the site shows
// (/listing/<public_id>, /?s=<public_id>). Random, 10 characters of [a-z0-9]; it never changes and
// carries no meaning — the serial id and the licence plate never appear in an address.
//
// SERVER-ONLY: it imports node:crypto. Never import this from a client component.
//
// This is the ONE place an id is minted. No retry-on-collision logic anywhere: with 36^10 ids a
// collision is not a practical event at our scale, and the unique index makes one fail loudly.

import { randomInt } from "node:crypto";

export const PUBLIC_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const PUBLIC_ID_LENGTH = 10;

/** The ONE place a public id is minted — listings.public_id and searches.public_id. */
export function newPublicId(): string {
  let id = "";
  for (let i = 0; i < PUBLIC_ID_LENGTH; i += 1) {
    id += PUBLIC_ID_ALPHABET[randomInt(PUBLIC_ID_ALPHABET.length)];
  }
  return id;
}

/** True when the value has the shape of a public id (10 chars of [a-z0-9]). Says nothing about whether a row with it exists. */
export function isPublicId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{10}$/.test(value);
}
