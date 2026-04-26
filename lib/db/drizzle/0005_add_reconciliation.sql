-- Migration 0005: bank reconciliation
--
-- Adds five new tables for Phase 4:
--   - bank_accounts          : registry of every external money channel
--   - bank_statement_imports : audit of each upload/sync batch
--   - bank_statement_lines   : every line of every imported statement
--   - reconciliation_runs    : period-bounded reconciliation closes
--   - cash_float_counts      : daily cash count submissions
--
-- Also seeds:
--   - chart_of_accounts row for "6900-CASH-SHORT-OVER" (variance account)
--   - bank_accounts rows for existing GL channels (Paystack receivable,
--     MTN/Telecel/AT MoMo, Bank, Cash) so day-1 imports have somewhere to land.

CREATE TABLE "bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"provider" text,
	"account_number" text,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"gl_account_code" text NOT NULL,
	"owner_type" text,
	"owner_id" integer,
	"owner_name" text,
	"opening_balance" text DEFAULT '0.00' NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_type_chk" CHECK ("type" IN ('paystack', 'momo', 'bank', 'cash_float'))
);
--> statement-breakpoint

CREATE INDEX "bank_accounts_type_idx" ON "bank_accounts" ("type");
--> statement-breakpoint
CREATE INDEX "bank_accounts_gl_idx" ON "bank_accounts" ("gl_account_code");
--> statement-breakpoint
CREATE INDEX "bank_accounts_active_idx" ON "bank_accounts" ("is_active");
--> statement-breakpoint
CREATE INDEX "bank_accounts_owner_idx" ON "bank_accounts" ("owner_type", "owner_id");
--> statement-breakpoint

CREATE TABLE "bank_statement_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_account_id" integer NOT NULL,
	"source" text NOT NULL,
	"file_name" text,
	"file_checksum" text,
	"detected_format" text,
	"period_start" text,
	"period_end" text,
	"line_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"imported_by" integer NOT NULL,
	"imported_by_name" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "bank_statement_imports_source_chk" CHECK ("source" IN ('csv', 'paystack_api')),
	CONSTRAINT "bank_statement_imports_status_chk" CHECK ("status" IN ('pending', 'completed', 'failed'))
);
--> statement-breakpoint

ALTER TABLE "bank_statement_imports"
	ADD CONSTRAINT "bank_statement_imports_account_fk"
	FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id")
	ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

CREATE INDEX "bank_statement_imports_account_idx" ON "bank_statement_imports" ("bank_account_id");
--> statement-breakpoint
CREATE INDEX "bank_statement_imports_started_idx" ON "bank_statement_imports" ("started_at");
--> statement-breakpoint
-- Same checksum on same account = exact duplicate of an earlier upload.
CREATE UNIQUE INDEX "bank_statement_imports_unique_checksum"
	ON "bank_statement_imports" ("bank_account_id", "file_checksum")
	WHERE "file_checksum" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE "bank_statement_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_account_id" integer NOT NULL,
	"import_id" integer,
	"statement_date" date NOT NULL,
	"value_date" date,
	"description" text NOT NULL,
	"reference" text,
	"amount" numeric(14, 2) NOT NULL,
	"running_balance" numeric(14, 2),
	"currency" text DEFAULT 'GHS' NOT NULL,
	"source" text NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"matched_transaction_id" text,
	"matched_source_type" text,
	"matched_source_id" integer,
	"matched_at" timestamp,
	"matched_by" integer,
	"matched_by_name" text,
	"match_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_lines_source_chk" CHECK ("source" IN ('csv', 'paystack_api', 'manual')),
	CONSTRAINT "bank_statement_lines_match_chk" CHECK ("match_status" IN ('unmatched', 'matched', 'expense', 'income', 'ignored'))
);
--> statement-breakpoint

ALTER TABLE "bank_statement_lines"
	ADD CONSTRAINT "bank_statement_lines_account_fk"
	FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id")
	ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE "bank_statement_lines"
	ADD CONSTRAINT "bank_statement_lines_import_fk"
	FOREIGN KEY ("import_id") REFERENCES "public"."bank_statement_imports"("id")
	ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint

CREATE INDEX "bank_statement_lines_account_idx" ON "bank_statement_lines" ("bank_account_id");
--> statement-breakpoint
CREATE INDEX "bank_statement_lines_match_status_idx" ON "bank_statement_lines" ("match_status");
--> statement-breakpoint
CREATE INDEX "bank_statement_lines_date_idx" ON "bank_statement_lines" ("statement_date");
--> statement-breakpoint
CREATE INDEX "bank_statement_lines_amount_idx" ON "bank_statement_lines" ("amount");
--> statement-breakpoint
CREATE INDEX "bank_statement_lines_reference_idx" ON "bank_statement_lines" ("reference");
--> statement-breakpoint
CREATE INDEX "bank_statement_lines_matched_tx_idx" ON "bank_statement_lines" ("matched_transaction_id");
--> statement-breakpoint
CREATE INDEX "bank_statement_lines_import_idx" ON "bank_statement_lines" ("import_id");
--> statement-breakpoint

CREATE TABLE "reconciliation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_account_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"opening_balance" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"closing_per_statement" numeric(14, 2) NOT NULL,
	"closing_per_ledger" numeric(14, 2) NOT NULL,
	"difference" numeric(14, 2) NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"unmatched_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_by" integer,
	"completed_by_name" text,
	"completed_at" timestamp,
	CONSTRAINT "reconciliation_runs_period_chk" CHECK ("period_end" >= "period_start"),
	CONSTRAINT "reconciliation_runs_status_chk" CHECK ("status" IN ('draft', 'completed'))
);
--> statement-breakpoint

ALTER TABLE "reconciliation_runs"
	ADD CONSTRAINT "reconciliation_runs_account_fk"
	FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id")
	ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

CREATE INDEX "reconciliation_runs_account_idx" ON "reconciliation_runs" ("bank_account_id");
--> statement-breakpoint
CREATE INDEX "reconciliation_runs_status_idx" ON "reconciliation_runs" ("status");
--> statement-breakpoint
CREATE INDEX "reconciliation_runs_period_idx" ON "reconciliation_runs" ("period_start", "period_end");
--> statement-breakpoint

CREATE TABLE "cash_float_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_account_id" integer NOT NULL,
	"count_date" date NOT NULL,
	"expected_balance" numeric(14, 2) NOT NULL,
	"declared_balance" numeric(14, 2) NOT NULL,
	"discrepancy" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"reason" text,
	"adjustment_transaction_id" text,
	"submitted_by" integer NOT NULL,
	"submitted_by_name" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_float_counts_status_chk" CHECK ("status" IN ('submitted', 'posted', 'voided'))
);
--> statement-breakpoint

ALTER TABLE "cash_float_counts"
	ADD CONSTRAINT "cash_float_counts_account_fk"
	FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id")
	ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

CREATE INDEX "cash_float_counts_account_idx" ON "cash_float_counts" ("bank_account_id");
--> statement-breakpoint
CREATE INDEX "cash_float_counts_date_idx" ON "cash_float_counts" ("count_date");
--> statement-breakpoint
-- Only one count per (account, date) — re-submissions update or void+recreate.
CREATE UNIQUE INDEX "cash_float_counts_unique_per_day"
	ON "cash_float_counts" ("bank_account_id", "count_date")
	WHERE "status" != 'voided';
--> statement-breakpoint

-- ============================================================
-- Seed: cash short/over GL account
-- ============================================================
INSERT INTO "chart_of_accounts" ("code", "name", "type", "normal_balance", "description")
VALUES ('6900-CASH-SHORT-OVER', 'Cash Short / Over', 'expense', 'debit',
	'Variance account for cash float discrepancies. Shortages debit (loss); overages credit (recovery).')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- ============================================================
-- Seed: registry rows for the channels already in the ledger
-- (only if the table is empty — re-runs are no-ops)
-- ============================================================
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM "bank_accounts") THEN
		INSERT INTO "bank_accounts" ("name", "type", "provider", "gl_account_code", "owner_type", "owner_name", "notes")
		VALUES
			('Paystack Settlement', 'paystack', 'Paystack', '1300-PAYSTACK-RECV', 'office', 'Dormi HQ',
				'Receivable from Paystack pending settlement to bank.'),
			('MTN MoMo Wallet', 'momo', 'MTN MoMo', '1110-MOMO-MTN', 'office', 'Dormi HQ',
				'Mobile money merchant wallet for MTN.'),
			('Telecel Cash Wallet', 'momo', 'Telecel Cash', '1111-MOMO-TELECEL', 'office', 'Dormi HQ',
				'Mobile money merchant wallet for Telecel (Vodafone).'),
			('AirtelTigo Money Wallet', 'momo', 'AirtelTigo Money', '1112-MOMO-AT', 'office', 'Dormi HQ',
				'Mobile money merchant wallet for AirtelTigo.'),
			('Business Bank Account', 'bank', 'GCB', '1200-BANK', 'office', 'Dormi HQ',
				'Primary business bank account. Edit provider/number once known.'),
			('Office Cash Drawer', 'cash_float', 'Office', '1100-CASH', 'office', 'Dormi HQ',
				'Physical cash held at HQ.');
	END IF;
END $$;
