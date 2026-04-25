-- Migration 0003: double-entry ledger.
-- Creates chart_of_accounts (master account list) and ledger_entries
-- (one row per debit/credit line). Seeds the standard COA for a Ghana
-- marketplace-model grocery delivery platform.

CREATE TABLE "chart_of_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"normal_balance" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chart_of_accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint

CREATE TABLE "ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_code" text NOT NULL,
	"debit" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"credit" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"posted_at" timestamp NOT NULL,
	"description" text,
	"source_type" text NOT NULL,
	"source_id" integer,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_one_side_only" CHECK (
		("debit" >= 0 AND "credit" >= 0)
		AND NOT ("debit" > 0 AND "credit" > 0)
		AND ("debit" > 0 OR "credit" > 0)
	)
);
--> statement-breakpoint

-- Idempotency anchor: backfill / re-runs cannot double-post the same source row.
CREATE UNIQUE INDEX "ledger_entries_source_unique"
  ON "ledger_entries" ("source_type", "source_id", "account_code", "debit", "credit")
  WHERE "source_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" ("transaction_id");
--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" ("account_code");
--> statement-breakpoint
CREATE INDEX "ledger_entries_posted_at_idx" ON "ledger_entries" ("posted_at");
--> statement-breakpoint
CREATE INDEX "ledger_entries_source_lookup_idx" ON "ledger_entries" ("source_type", "source_id");
--> statement-breakpoint

-- Seed the chart of accounts. Codes are stable; names/descriptions are editable.
INSERT INTO "chart_of_accounts" ("code", "name", "type", "normal_balance", "description") VALUES
  -- ASSETS
  ('1100-CASH', 'Cash on hand', 'asset', 'debit', 'Physical cash held at the office.'),
  ('1110-MOMO-MTN', 'MoMo - MTN', 'asset', 'debit', 'MTN MoMo merchant balance.'),
  ('1111-MOMO-TELECEL', 'MoMo - Telecel', 'asset', 'debit', 'Telecel (Vodafone) Cash balance.'),
  ('1112-MOMO-AT', 'MoMo - AirtelTigo', 'asset', 'debit', 'AirtelTigo Money balance.'),
  ('1200-BANK', 'Bank - operating', 'asset', 'debit', 'Primary operating bank account.'),
  ('1300-PAYSTACK-RECV', 'Paystack receivable', 'asset', 'debit', 'Customer-paid funds in transit awaiting Paystack settlement.'),
  ('1400-FLOAT-RIDERS', 'Float - riders', 'asset', 'debit', 'Cash advances issued to riders for fuel / change.'),
  ('1410-FLOAT-AGENTS', 'Float - agents', 'asset', 'debit', 'Cash advances issued to call-centre agents.'),
  ('1500-VENDOR-ADV', 'Vendor advances', 'asset', 'debit', 'Pre-payments made to vendors.'),
  -- LIABILITIES
  ('2100-VENDOR-PAYABLE', 'Vendor payable', 'liability', 'credit', 'Goods money owed to vendors after order.'),
  ('2110-RIDER-PAYABLE', 'Rider payable', 'liability', 'credit', 'Delivery earnings owed to riders.'),
  ('2200-VAT-PAYABLE', 'VAT payable', 'liability', 'credit', 'VAT collected from customers, payable to GRA.'),
  ('2210-NHIL-PAYABLE', 'NHIL payable', 'liability', 'credit', 'NHIL collected from customers, payable to GRA.'),
  ('2220-GETFUND-PAYABLE', 'GETFund payable', 'liability', 'credit', 'GETFund Levy collected, payable to GRA.'),
  ('2300-SALARIES-PAYABLE', 'Salaries payable', 'liability', 'credit', 'Accrued employee salaries pending disbursement.'),
  ('2400-CUSTOMER-CREDITS', 'Customer credits', 'liability', 'credit', 'Refunds owed to customers.'),
  -- EQUITY
  ('3100-OWNER-CAPITAL', 'Owner''s capital', 'equity', 'credit', 'Owner contributions to the business.'),
  ('3200-RETAINED-EARNINGS', 'Retained earnings', 'equity', 'credit', 'Accumulated profits since inception.'),
  -- REVENUE
  ('4100-SERVICE-REVENUE', 'Service fee revenue', 'revenue', 'credit', 'Service fees charged to residents per order.'),
  ('4200-DELIVERY-REVENUE', 'Delivery fee revenue', 'revenue', 'credit', 'Delivery fees charged to residents per order.'),
  -- EXPENSES
  ('5100-RIDER-COST', 'Rider delivery cost', 'expense', 'debit', 'Earnings recognised to riders on delivery completion.'),
  ('5200-PAYSTACK-FEES', 'Payment processor fees', 'expense', 'debit', 'Paystack and other gateway processing fees.'),
  ('5300-SALARIES', 'Salaries & wages', 'expense', 'debit', 'Employee salary expense.'),
  ('5400-RENT', 'Rent', 'expense', 'debit', 'Office and warehouse rent.'),
  ('5410-UTILITIES', 'Utilities', 'expense', 'debit', 'Power, water, internet.'),
  ('5420-MARKETING', 'Marketing', 'expense', 'debit', 'Advertising, promotions, customer acquisition.'),
  ('5430-SOFTWARE', 'Software & subscriptions', 'expense', 'debit', 'SaaS, hosting, dev tools.'),
  ('5440-OFFICE', 'Office supplies', 'expense', 'debit', 'Stationery, consumables.'),
  ('5500-BAD-DEBT', 'Bad debt', 'expense', 'debit', 'Uncollectable receivables written off.'),
  ('5900-OTHER-OPEX', 'Other operating expense', 'expense', 'debit', 'Miscellaneous operating costs.');
