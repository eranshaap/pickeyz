"use server";

// The contact window's server actions (BRIEF Day 19b Run 11a §2.2). Two of them, and nothing else crosses
// the wire from the window.
//
//   recordContactEvent()  one `events` row — the measurement. Fire-and-forget from the window: it never
//                         delays or blocks opening, typing or sending, and a rejection is ignored there.
//   sendContactRequest()  the lead itself: one `contact_requests` row, or a typed outcome that is not one.
//
// THE SHAPE OF src/app/actions/search.ts: one object argument, a plain Promise. A real FAILURE THROWS —
// the window shows SEND_FAILED and keeps everything typed. An outcome that is not a failure (the hourly
// limit, a car that went off the site, a bot) is RETURNED, typed, because the window draws each of them
// differently. No redirect, no revalidatePath: the page behind the window does not change.
//
// NO NAME OR PHONE EVER APPEARS IN A LOG LINE. The buyer's two fields live in one closed table with their
// own deletion rule (findCar-schema.md §D19); a log line carries the listing's public id, the kind and the
// row id, and nothing else.
//
// NO RULE IS DECIDED HERE THAT THE LIBRARY ALREADY HOLDS: the slot check is schedule.ts's, the two
// fields are validate.ts's, the fingerprint is fingerprint.ts's, and "is this listing still shown" is the
// very rule that gives a reader the not-found page — resolveListing(), called again at the send.

import { isEventId } from "@/lib/contact/ids";
import { phoneFingerprint, phoneSecret } from "@/lib/contact/fingerprint";
import { visitSlotValid } from "@/lib/contact/schedule";
import { countRequestsSince, insertEvent, insertRequest, openAgreementId, openingListingId, searchResultListingId } from "@/lib/contact/store";
import { normalizePhone, validateForm } from "@/lib/contact/validate";
import { db } from "@/lib/db";
import { isPublicId } from "@/lib/public-id";
import { resolveListing } from "@/lib/search/visibility";
import { searchIdentity } from "@/lib/search/visitor";

// ---------------------------------------------------------------------------
// the measurement
// ---------------------------------------------------------------------------

const EVENT_TYPES = ["contact_opened", "contact_form_started", "contact_form_error", "contact_closed"] as const;

/** How much `details` may carry. Beyond it the row is stored with no details at all, rather than refused. */
const DETAILS_MAX_CHARS = 1000;

export type ContactEventInput = {
  id: string;
  event_type: "contact_opened" | "contact_form_started" | "contact_form_error" | "contact_closed";
  listing_id: number;
  car_id: number;
  search_id: number | null;
  car_rank: number | null;
  was_recommended: boolean | null;
  details: Record<string, unknown> | null;
};

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const isIntOrNull = (n: unknown): n is number | null => n === null || isInt(n);

/**
 * One event row. Its id comes from the BROWSER, so a retried call writes no second row (store.ts).
 *
 * Anything invalid throws: the window ignores the rejection, and measurement never stops anything. No log
 * line — four of these can arrive from one opening, and they are counted in the table, not in the logs.
 */
export async function recordContactEvent(input: ContactEventInput): Promise<void> {
  if (!isEventId(input.id)) throw new Error("invalid event");
  if (!(EVENT_TYPES as readonly string[]).includes(input.event_type)) throw new Error("invalid event");
  if (!isInt(input.listing_id) || !isInt(input.car_id)) throw new Error("invalid event");
  if (!isIntOrNull(input.search_id) || !isIntOrNull(input.car_rank)) throw new Error("invalid event");
  if (!(input.was_recommended === null || typeof input.was_recommended === "boolean")) throw new Error("invalid event");

  // A details value that is not a plain object is a tampered call; one that is merely too long is stored
  // as null, because an oversized blob is a measurement problem and never a reason to lose the row.
  let details: Record<string, unknown> | null = null;
  if (input.details !== null) {
    if (typeof input.details !== "object" || Array.isArray(input.details)) throw new Error("invalid event");
    details = JSON.stringify(input.details).length < DETAILS_MAX_CHARS ? input.details : null;
  }

  const identity = await searchIdentity();
  await insertEvent({
    id: input.id,
    event_type: input.event_type,
    visitor_id: identity.visitor_id,
    session_id: identity.session_id,
    search_id: input.search_id,
    car_id: input.car_id,
    listing_id: input.listing_id,
    car_rank: input.car_rank,
    was_recommended: input.was_recommended,
    details,
  });
}

// ---------------------------------------------------------------------------
// the send
// ---------------------------------------------------------------------------

/** Up to five requests an hour from one browser; the sixth is blocked. */
const HOURLY_LIMIT = 5;
const HOUR_MS = 60 * 60 * 1000;

export type SendInput = {
  listing_public_id: string;
  search_result_id: number | null;
  opened_event_id: string | null;
  kind: "visit" | "callback";
  /** The chosen slot as an ISO instant; null for a callback. */
  visit_at: string | null;
  name: string;
  phone: string;
  honeypot: string;
};

export type SendResult =
  | {
      status: "sent";
      request_id: number;
      kind: "visit" | "callback";
      visit_at: string | null;
      name: string;
      /** The normalised digits — what the confirmation reads back, through displayPhone(). */
      phone: string;
      created_at: string;
    }
  | { status: "too_many" }
  | { status: "gone" }
  | { status: "dropped" };

/**
 * One request from the window. The steps are the document's, in the document's order: the bot first (it is
 * told nothing), then the fields, then the limit, then the re-check of the car, then the row.
 */
export async function sendContactRequest(input: SendInput): Promise<SendResult> {
  // 1. The address itself. Only a tampered call arrives with anything else.
  if (!isPublicId(input.listing_public_id)) throw new Error("invalid request");
  const publicId = input.listing_public_id;

  // 2. The hidden field. A filled one is a bot: dropped silently, with no message and no row — telling a
  //    bot it was caught is telling it how to pass next time.
  if (input.honeypot.trim() !== "") {
    console.log(`[contact] dropped | ${publicId}`);
    return { status: "dropped" };
  }

  // 3. The two fields, through the library the window itself validated with. The day and the hour are
  //    not sent and not judged here; the chosen slot is judged as an instant, by the anti-tamper check.
  const errors = validateForm({ kind: "callback", day: null, hour: null, name: input.name, phone: input.phone });
  if (Object.keys(errors).length > 0) throw new Error("invalid request");

  // 4. One `now` for the whole send: the limit's hour, the agreement in force and the slot check are all
  //    measured against the same instant.
  const now = new Date();
  let visitAt: Date | null = null;
  if (input.kind === "visit") {
    if (input.visit_at === null) throw new Error("invalid request");
    visitAt = new Date(input.visit_at);
    if (Number.isNaN(visitAt.getTime())) throw new Error("invalid request");
    if (!visitSlotValid(visitAt, now)) throw new Error("invalid request");
  } else if (input.visit_at !== null) {
    throw new Error("invalid request");
  }

  // A Server Function may mint the two cookies, so a buyer who lands straight on a shared link and sends
  // gets a visitor_id here — which is what makes the page's button remember them afterwards.
  const identity = await searchIdentity();

  // 5. The hourly limit, counted on the browser and not on the phone: it is a flood guard, not a lead rule.
  if ((await countRequestsSince(identity.visitor_id, new Date(now.getTime() - HOUR_MS))) >= HOURLY_LIMIT) {
    console.log(`[contact] too_many | ${publicId}`);
    return { status: "too_many" };
  }

  // 6. The car, re-checked at the moment of the send by the very rule that gives a reader the not-found
  //    page: the window may have been open for a while, and a listing that went off the site takes no
  //    more requests. Nothing is stored.
  const resolved = await resolveListing(publicId);
  if (!resolved.visibility.shown || resolved.item === null) {
    console.log(`[contact] gone | ${publicId} | ${resolved.visibility.shown ? "no_pool_item" : resolved.visibility.reason}`);
    return { status: "gone" };
  }
  const item = resolved.item;

  // 7. The price AT THIS MOMENT, and the agreement in force at it. Both are copied into the row because
  //    both change, and the lead has to be readable later against what it actually was.
  const listing = await db.listings.findUniqueOrThrow({ where: { id: item.listing_id }, select: { price: true, dealer_id: true } });
  const agreement_id = await openAgreementId(listing.dealer_id, now);

  // 8. The two pointers, each kept only when it belongs to THIS listing. One that does not is not an error
  //    and never stops the send — measurement never stops a send, so it simply becomes null.
  const search_result_id =
    input.search_result_id !== null && (await searchResultListingId(input.search_result_id)) === item.listing_id ? input.search_result_id : null;
  const opened_event_id =
    input.opened_event_id !== null && isEventId(input.opened_event_id) && (await openingListingId(input.opened_event_id)) === item.listing_id
      ? input.opened_event_id
      : null;

  // 9. The buyer. The phone is stored as digits, and its fingerprint — the value that outlives the two
  //    fields' deletion — is taken over those same digits. The secret is read HERE: a missing one fails
  //    this send, loudly, and nothing else on the site.
  const buyer_phone = normalizePhone(input.phone);
  const buyer_phone_fp = phoneFingerprint(buyer_phone, phoneSecret());
  const buyer_name = input.name.trim();

  // 10. One insert, no transaction — there is nothing for it to be atomic with.
  const written = await insertRequest({
    listing_id: item.listing_id,
    agreement_id,
    kind: input.kind,
    visit_at: visitAt,
    price_at_send: listing.price,
    search_result_id,
    opened_event_id,
    buyer_name,
    buyer_phone,
    buyer_phone_fp,
    visitor_id: identity.visitor_id,
    session_id: identity.session_id,
  });

  console.log(`[contact] sent | ${publicId} | ${input.kind} | request ${written.id}`);
  return {
    status: "sent",
    request_id: written.id,
    kind: input.kind,
    visit_at: visitAt === null ? null : visitAt.toISOString(),
    name: buyer_name,
    phone: buyer_phone,
    created_at: written.created_at.toISOString(),
  };
}
