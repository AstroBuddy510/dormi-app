-- Migration 0004: audit log + period locks + ledger immutability
--
-- Creates two new tables (`audit_log`, `period_locks`) and a set of
-- PostgreSQL triggers that:
--
-- 1. Make `ledger_entries` truly immutable at the DB layer — UPDATE and
--    DELETE are blocked. Reversals must go through new offsetting journals.
--
-- 2. Block new ledger postings whose `posted_at` falls inside an active
--    period lock. App code can opt into a more friendly error first; the
--    DB trigger is the last line of defense.
--
-- 3. Auto-write `audit_log` rows for every change to the money-event
--    source tables (orders.payment_status / status, expenses, payouts,
--    payroll_payments, tax_settings) so we have a tamper-evident trail
--    even if a buggy API path bypasses application-level auditing.
--
-- Triggers read attribution from PostgreSQL session variables:
--   `app.current_user_id`, `app.current_user_role`, `app.current_user_name`
-- The API middleware sets these on every authenticated request (see
-- artifacts/api-server/src/middlewares/auth.ts). Anything that hits the
-- DB without those set (psql, backfill, manual SQL) is attributed as
-- 'system' / role 'unknown'.

CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_role" text,
	"user_name" text,
	"user_phone" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"user_agent" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX "audit_log_user_idx" ON "audit_log" ("user_id");
--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" ("action");
--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log" ("occurred_at");
--> statement-breakpoint

CREATE TABLE "period_locks" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"locked_by" integer NOT NULL,
	"locked_by_name" text NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"lock_reason" text,
	"unlocked_by" integer,
	"unlocked_by_name" text,
	"unlocked_at" timestamp,
	"unlock_reason" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "period_locks_valid_range" CHECK ("period_end" >= "period_start")
);
--> statement-breakpoint

CREATE INDEX "period_locks_active_idx" ON "period_locks" ("active");
--> statement-breakpoint
CREATE INDEX "period_locks_range_idx" ON "period_locks" ("period_start", "period_end");
--> statement-breakpoint
-- Only one ACTIVE lock per period — prevents stacking duplicates.
CREATE UNIQUE INDEX "period_locks_unique_active"
	ON "period_locks" ("period_start", "period_end")
	WHERE "active" = true;
--> statement-breakpoint

-- ============================================================
-- Helper functions
-- ============================================================

-- Read current user attribution from session vars; tolerates absence.
CREATE OR REPLACE FUNCTION current_user_attribution()
RETURNS TABLE(user_id integer, user_role text, user_name text, user_phone text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
	uid_text text;
	uid_int integer;
BEGIN
	uid_text := current_setting('app.current_user_id', true);
	BEGIN
		uid_int := uid_text::integer;
	EXCEPTION WHEN OTHERS THEN
		uid_int := NULL;
	END;

	RETURN QUERY SELECT
		uid_int,
		COALESCE(NULLIF(current_setting('app.current_user_role', true), ''), 'system'),
		COALESCE(NULLIF(current_setting('app.current_user_name', true), ''), 'system'),
		NULLIF(current_setting('app.current_user_phone', true), '');
END;
$$;
--> statement-breakpoint

-- ============================================================
-- 1. Ledger immutability — block UPDATE and DELETE
-- ============================================================
CREATE OR REPLACE FUNCTION ledger_entries_block_modification()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION
		'ledger_entries is append-only. Reversals must be posted as new offsetting journals (TG_OP=%, id=%).',
		TG_OP, COALESCE(OLD.id, NEW.id)
		USING ERRCODE = 'restrict_violation';
	RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "ledger_entries_no_update"
	BEFORE UPDATE ON "ledger_entries"
	FOR EACH ROW EXECUTE FUNCTION ledger_entries_block_modification();
--> statement-breakpoint

CREATE TRIGGER "ledger_entries_no_delete"
	BEFORE DELETE ON "ledger_entries"
	FOR EACH ROW EXECUTE FUNCTION ledger_entries_block_modification();
--> statement-breakpoint

-- ============================================================
-- 2. Period lock enforcement on ledger inserts
-- ============================================================
CREATE OR REPLACE FUNCTION ledger_entries_check_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
	lock_row RECORD;
BEGIN
	SELECT id, period_start, period_end, lock_reason, locked_by_name
	INTO lock_row
	FROM period_locks
	WHERE active = true
		AND NEW.posted_at::date BETWEEN period_start AND period_end
	LIMIT 1;

	IF FOUND THEN
		RAISE EXCEPTION
			'Cannot post journal — period % to % is locked (lock #% by %, reason: %).',
			lock_row.period_start, lock_row.period_end, lock_row.id,
			lock_row.locked_by_name, COALESCE(lock_row.lock_reason, 'no reason given')
			USING ERRCODE = 'restrict_violation';
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "ledger_entries_period_lock"
	BEFORE INSERT ON "ledger_entries"
	FOR EACH ROW EXECUTE FUNCTION ledger_entries_check_period_lock();
--> statement-breakpoint

-- ============================================================
-- 3. Auto-audit triggers on money-event source tables
-- ============================================================

-- Generic writer used by the per-table trigger functions below.
CREATE OR REPLACE FUNCTION write_audit_row(
	p_action text,
	p_entity_type text,
	p_entity_id text,
	p_before jsonb,
	p_after jsonb,
	p_metadata jsonb
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
	attr RECORD;
BEGIN
	SELECT * INTO attr FROM current_user_attribution();
	INSERT INTO audit_log (
		user_id, user_role, user_name, user_phone,
		action, entity_type, entity_id,
		before_state, after_state, metadata
	) VALUES (
		attr.user_id, attr.user_role, attr.user_name, attr.user_phone,
		p_action, p_entity_type, p_entity_id,
		p_before, p_after, COALESCE(p_metadata, '{}'::jsonb)
	);
END;
$$;
--> statement-breakpoint

-- Orders: only audit changes that move money (payment_status, status when delivered)
CREATE OR REPLACE FUNCTION audit_orders_change()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE' THEN
		IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
			PERFORM write_audit_row(
				'order_payment_status_change',
				'order',
				NEW.id::text,
				jsonb_build_object('payment_status', OLD.payment_status, 'payment_method', OLD.payment_method),
				jsonb_build_object('payment_status', NEW.payment_status, 'payment_method', NEW.payment_method),
				jsonb_build_object('subtotal', NEW.subtotal, 'service_fee', NEW.service_fee, 'delivery_fee', NEW.delivery_fee)
			);
		END IF;
		IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('delivered', 'cancelled', 'refunded') THEN
			PERFORM write_audit_row(
				'order_status_change',
				'order',
				NEW.id::text,
				jsonb_build_object('status', OLD.status),
				jsonb_build_object('status', NEW.status),
				jsonb_build_object('rider_id', NEW.rider_id)
			);
		END IF;
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "audit_orders"
	AFTER UPDATE ON "orders"
	FOR EACH ROW EXECUTE FUNCTION audit_orders_change();
--> statement-breakpoint

-- Expenses: full create/update/delete trail (delete should be rare but worth catching).
CREATE OR REPLACE FUNCTION audit_expenses_change()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		PERFORM write_audit_row('expense_create', 'expense', NEW.id::text, NULL, to_jsonb(NEW), '{}'::jsonb);
		RETURN NEW;
	ELSIF TG_OP = 'UPDATE' THEN
		PERFORM write_audit_row('expense_update', 'expense', NEW.id::text, to_jsonb(OLD), to_jsonb(NEW), '{}'::jsonb);
		RETURN NEW;
	ELSIF TG_OP = 'DELETE' THEN
		PERFORM write_audit_row('expense_delete', 'expense', OLD.id::text, to_jsonb(OLD), NULL, '{}'::jsonb);
		RETURN OLD;
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "audit_expenses"
	AFTER INSERT OR UPDATE OR DELETE ON "expenses"
	FOR EACH ROW EXECUTE FUNCTION audit_expenses_change();
--> statement-breakpoint

-- Payouts: status changes are the audit-worthy events.
CREATE OR REPLACE FUNCTION audit_payouts_change()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		PERFORM write_audit_row('payout_create', 'payout', NEW.id::text, NULL, to_jsonb(NEW), '{}'::jsonb);
		RETURN NEW;
	ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
		PERFORM write_audit_row(
			'payout_status_change',
			'payout',
			NEW.id::text,
			jsonb_build_object('status', OLD.status, 'paid_at', OLD.paid_at),
			jsonb_build_object('status', NEW.status, 'paid_at', NEW.paid_at),
			jsonb_build_object('vendor_id', NEW.vendor_id, 'total_amount', NEW.total_amount)
		);
		RETURN NEW;
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "audit_payouts"
	AFTER INSERT OR UPDATE ON "payouts"
	FOR EACH ROW EXECUTE FUNCTION audit_payouts_change();
--> statement-breakpoint

-- Payroll payments: full create/update/delete trail.
CREATE OR REPLACE FUNCTION audit_payroll_change()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		PERFORM write_audit_row('payroll_create', 'payroll_payment', NEW.id::text, NULL, to_jsonb(NEW), '{}'::jsonb);
		RETURN NEW;
	ELSIF TG_OP = 'UPDATE' THEN
		PERFORM write_audit_row('payroll_update', 'payroll_payment', NEW.id::text, to_jsonb(OLD), to_jsonb(NEW), '{}'::jsonb);
		RETURN NEW;
	ELSIF TG_OP = 'DELETE' THEN
		PERFORM write_audit_row('payroll_delete', 'payroll_payment', OLD.id::text, to_jsonb(OLD), NULL, '{}'::jsonb);
		RETURN OLD;
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "audit_payroll"
	AFTER INSERT OR UPDATE OR DELETE ON "payroll_payments"
	FOR EACH ROW EXECUTE FUNCTION audit_payroll_change();
--> statement-breakpoint

-- Tax settings: only audit changes (these drive customer-facing prices).
CREATE OR REPLACE FUNCTION audit_tax_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND (
		NEW.rate IS DISTINCT FROM OLD.rate
		OR NEW.enabled IS DISTINCT FROM OLD.enabled
		OR NEW.name IS DISTINCT FROM OLD.name
		OR NEW.description IS DISTINCT FROM OLD.description
	) THEN
		PERFORM write_audit_row(
			'tax_setting_change',
			'tax_setting',
			NEW.code,
			jsonb_build_object('rate', OLD.rate, 'enabled', OLD.enabled, 'name', OLD.name, 'description', OLD.description),
			jsonb_build_object('rate', NEW.rate, 'enabled', NEW.enabled, 'name', NEW.name, 'description', NEW.description),
			'{}'::jsonb
		);
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "audit_tax_settings"
	AFTER UPDATE ON "tax_settings"
	FOR EACH ROW EXECUTE FUNCTION audit_tax_settings_change();
