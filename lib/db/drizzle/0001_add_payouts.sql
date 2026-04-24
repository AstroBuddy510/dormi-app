CREATE TABLE "payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
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
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vendor_payout_id" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_payout_id_payouts_id_fk" FOREIGN KEY ("vendor_payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_payouts_vendor_id" ON "payouts" ("vendor_id");
--> statement-breakpoint
CREATE INDEX "idx_payouts_status" ON "payouts" ("status");
--> statement-breakpoint
CREATE INDEX "idx_orders_vendor_payout_id" ON "orders" ("vendor_payout_id");
