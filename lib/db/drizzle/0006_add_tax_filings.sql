-- Migration 0006: GRA tax filings
--
-- Adds:
--   - tax_filings table — one row per (type, period) GRA return:
--     VAT/NHIL/GETFund, PAYE, SSNIT, WHT.
--   - wht_amount + wht_rate columns on payouts (track-only mode for now —
--     no auto-deduction; admin sees exposure on each payout).
--   - Three new chart_of_accounts entries for the additional tax payables.

CREATE TABLE "tax_filings" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"computed_amounts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"amount_payable" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"filing_reference" text,
	"gra_receipt_number" text,
	"filed_at" timestamp,
	"filed_by" integer,
	"filed_by_name" text,
	"paid_at" timestamp,
	"paid_by" integer,
	"paid_by_name" text,
	"paid_from_bank_account_id" integer,
	"remittance_transaction_id" text,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tax_filings_type_chk" CHECK ("type" IN ('vat_nhil_getfund', 'paye', 'ssnit', 'wht')),
	CONSTRAINT "tax_filings_status_chk" CHECK ("status" IN ('draft', 'filed', 'paid', 'cancelled')),
	CONSTRAINT "tax_filings_period_chk" CHECK ("period_month" >= 1 AND "period_month" <= 12)
);
--> statement-breakpoint

CREATE INDEX "tax_filings_type_idx" ON "tax_filings" ("type");
--> statement-breakpoint
CREATE INDEX "tax_filings_period_idx" ON "tax_filings" ("period_year", "period_month");
--> statement-breakpoint
CREATE INDEX "tax_filings_status_idx" ON "tax_filings" ("status");
--> statement-breakpoint
-- Only one non-cancelled filing per (type, period). Re-files use a new row with the previous cancelled.
CREATE UNIQUE INDEX "tax_filings_unique_active"
	ON "tax_filings" ("type", "period_year", "period_month")
	WHERE "status" != 'cancelled';
--> statement-breakpoint

ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "wht_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "wht_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint

INSERT INTO "chart_of_accounts" ("code", "name", "type", "normal_balance", "description") VALUES
	('2230-WHT-PAYABLE', 'Withholding Tax Payable', 'liability', 'credit',
		'Withholding tax (5–20%) deducted from supplier payments, held until remitted to GRA on the monthly WHT return.'),
	('2240-PAYE-PAYABLE', 'PAYE Payable', 'liability', 'credit',
		'Pay-As-You-Earn withheld from employee salaries, held until remitted to GRA by the 15th of the following month.'),
	('2250-SSNIT-PAYABLE', 'SSNIT Payable', 'liability', 'credit',
		'Tier 1 (13.5%) and Tier 2 (5%) social security contributions, held until remitted by the 14th of the following month.')
ON CONFLICT ("code") DO NOTHING;
