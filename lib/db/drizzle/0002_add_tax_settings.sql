-- Migration 0002: admin-controlled tax & levies engine
-- Creates tax_settings table, seeds VAT / NHIL / GETFund rows (all DISABLED
-- by default), and adds per-order tax breakdown columns to `orders`.

CREATE TABLE "tax_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"rate" numeric(6, 4) DEFAULT '0.0000' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tax_settings_code_unique" UNIQUE("code")
);
--> statement-breakpoint

-- Seed Ghana 2026 tax rows. Rates pre-populated, but every row is DISABLED
-- so early customers see no tax until the admin explicitly turns each on.
INSERT INTO "tax_settings" ("code", "name", "rate", "enabled", "description") VALUES
  ('VAT', 'VAT', '0.1500', false, 'Value Added Tax (15%) on platform revenue.'),
  ('NHIL', 'NHIL', '0.0250', false, 'National Health Insurance Levy (2.5%) on platform revenue.'),
  ('GETFUND', 'GETFund Levy', '0.0250', false, 'Ghana Education Trust Fund Levy (2.5%) on platform revenue.');
--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN "tax_base" numeric(10, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vat_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "nhil_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "getfund_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;
