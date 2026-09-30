// BRIEF Day 19b Run 11a §1.6 — the phone's fingerprint. SERVER ONLY (node:crypto): never import this from
// a client component, or the browser bundle stops building.
//
// contact_requests.buyer_phone and buyer_name are emptied after six months; buyer_phone_fp
// stays for ever, and the counting rules ("the same person on the same car = one lead") work on it. So the
// fingerprint has to be stable for ever and must not let anyone walk back from it to a number: a keyed
// HMAC over the NORMALISED digits, with a secret that never leaves the server.
//
// Normalised, not raw: "+972 52-765-4321" and "052-7654321" are one person, and two fingerprints for one
// person would split the very count this column exists to make.

import { createHmac } from "node:crypto";

export const PHONE_SECRET_ENV = "CONTACT_PHONE_SECRET";

/** HMAC-SHA256 of the normalised digits under the secret, as 64 lowercase hex characters. */
export function phoneFingerprint(phoneDigits: string, secret: string): string {
  return createHmac("sha256", secret).update(phoneDigits).digest("hex");
}

/**
 * The secret, read AT THE POINT OF USE and never at module load — the src/lib/db.ts convention. A missing
 * variable fails the one send that needed it, loudly, and nothing else on the site.
 */
export function phoneSecret(): string {
  const secret = process.env[PHONE_SECRET_ENV];
  if (!secret) throw new Error(`${PHONE_SECRET_ENV} is not set`);
  return secret;
}
