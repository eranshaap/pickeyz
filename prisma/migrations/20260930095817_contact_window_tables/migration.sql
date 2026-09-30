-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "visitor_id" TEXT,
    "session_id" TEXT,
    "search_id" INTEGER,
    "car_id" INTEGER,
    "listing_id" INTEGER,
    "car_rank" INTEGER,
    "was_recommended" BOOLEAN,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_requests" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listing_id" INTEGER NOT NULL,
    "agreement_id" INTEGER,
    "kind" TEXT NOT NULL,
    "visit_at" TIMESTAMPTZ(3),
    "price_at_send" INTEGER,
    "search_result_id" INTEGER,
    "opened_event_id" TEXT,
    "buyer_name" TEXT,
    "buyer_phone" TEXT,
    "buyer_email" TEXT,
    "buyer_phone_fp" TEXT NOT NULL,
    "visitor_id" TEXT,
    "session_id" TEXT,

    CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_search_id_idx" ON "events"("search_id");

-- CreateIndex
CREATE INDEX "events_listing_id_idx" ON "events"("listing_id");

-- CreateIndex
CREATE INDEX "events_visitor_id_created_at_idx" ON "events"("visitor_id", "created_at");

-- CreateIndex
CREATE INDEX "contact_requests_listing_id_idx" ON "contact_requests"("listing_id");

-- CreateIndex
CREATE INDEX "contact_requests_buyer_phone_fp_idx" ON "contact_requests"("buyer_phone_fp");

-- CreateIndex
CREATE INDEX "contact_requests_opened_event_id_idx" ON "contact_requests"("opened_event_id");

-- CreateIndex
CREATE INDEX "contact_requests_visitor_id_created_at_idx" ON "contact_requests"("visitor_id", "created_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "searches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "dealer_commercial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_search_result_id_fkey" FOREIGN KEY ("search_result_id") REFERENCES "search_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_opened_event_id_fkey" FOREIGN KEY ("opened_event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Day 19ב: closed to Supabase's open API — row level security on, no policy (findCar-schema.md, part A).
-- Only the site's server reads and writes: it connects as the tables' owner, and row level security is not
-- applied to the owner (not forced). Invisible to Prisma's diff, like the triggers.
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_requests" ENABLE ROW LEVEL SECURITY;
