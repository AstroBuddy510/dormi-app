-- Migration 0007: rider compensation rules
--
-- Adds:
--   - riders.type ('in_house' | 'independent', default 'independent')
--   - finance_settings.rider_commission_percent (default 20.00)
--   - rider_payouts table (mirrors payouts shape for independent riders)
--   - orders.rider_payout_id (FK by convention to rider_payouts.id)
--
-- Compensation model:
--   In-house riders: full delivery fee = revenue. Paid via payroll, no
--     per-order earning. Never appear in rider_payouts.
--   Independent riders: platform takes finance_settings.rider_commission_percent
--     of the delivery fee as revenue; remainder is owed to the rider and
--     settled via the rider_payouts flow (mirror of vendor payouts).

ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'independent';
--> statement-breakpoint
ALTER TABLE "riders" ADD CONSTRAINT "riders_type_chk" CHECK ("type" IN ('in_house', 'independent'));
--> statement-breakpoint

ALTER TABLE "finance_settings" ADD COLUMN IF NOT EXISTS "rider_commission_percent" numeric(5, 2) NOT NULL DEFAULT '20.00';
--> statement-breakpoint

CREATE TABLE "rider_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"paystack_portion" numeric(12, 2) NOT NULL,
	"cash_portion" numeric(12, 2) NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp
);
--> statement-breakpoint

ALTER TABLE "rider_payouts" ADD CONSTRAINT "rider_payouts_rider_id_riders_id_fk"
	FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

CREATE INDEX "idx_rider_payouts_rider_id" ON "rider_payouts" ("rider_id");
--> statement-breakpoint
CREATE INDEX "idx_rider_payouts_status" ON "rider_payouts" ("status");
--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "rider_payout_id" integer;
--> statement-breakpoint
CREATE INDEX "idx_orders_rider_payout_id" ON "orders" ("rider_payout_id");
