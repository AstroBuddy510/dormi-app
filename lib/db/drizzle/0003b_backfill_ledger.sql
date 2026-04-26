-- Backfill 0003b: post historical journals into the ledger.
-- Idempotent: NOT EXISTS guards mean re-running is safe.
-- Mirrors artifacts/api-server/scripts/backfill-ledger.ts (and src/lib/ledger.ts)
-- exactly: same source_type names, same account codes, same descriptions.

BEGIN;

-- ============================================================
-- 1. Orders (paid → order_payment journals)
-- ============================================================
WITH paid_orders AS MATERIALIZED (
  SELECT
    o.id,
    o.subtotal::numeric        AS subtotal,
    o.service_fee::numeric     AS sf,
    o.delivery_fee::numeric    AS df,
    o.vat_amount::numeric      AS vat,
    o.nhil_amount::numeric     AS nhil,
    o.getfund_amount::numeric  AS gf,
    (o.subtotal::numeric + o.service_fee::numeric + o.delivery_fee::numeric +
     o.vat_amount::numeric + o.nhil_amount::numeric + o.getfund_amount::numeric) AS gross,
    CASE WHEN o.payment_method = 'paystack'
         THEN '1300-PAYSTACK-RECV'
         ELSE '1100-CASH'
    END AS recv_acct,
    COALESCE(o.delivered_at, o.created_at) AS posted_at,
    gen_random_uuid() AS txn,
    'Order #' || o.id || ' customer payment' AS descr
  FROM orders o
  WHERE o.payment_status = 'paid'
    AND NOT EXISTS (
      SELECT 1 FROM ledger_entries le
      WHERE le.source_type = 'order_payment' AND le.source_id = o.id
    )
)
INSERT INTO ledger_entries
  (transaction_id, account_code, debit, credit, currency, posted_at, description, source_type, source_id, meta, created_by)
SELECT txn, recv_acct,             gross,    0, 'GHS', posted_at, descr, 'order_payment', id, '{}'::jsonb, 'backfill' FROM paid_orders WHERE gross    > 0
UNION ALL
SELECT txn, '2100-VENDOR-PAYABLE', 0, subtotal, 'GHS', posted_at, descr, 'order_payment', id, '{}'::jsonb, 'backfill' FROM paid_orders WHERE subtotal > 0
UNION ALL
SELECT txn, '4100-SERVICE-REVENUE',0, sf,       'GHS', posted_at, descr, 'order_payment', id, '{}'::jsonb, 'backfill' FROM paid_orders WHERE sf       > 0
UNION ALL
SELECT txn, '4200-DELIVERY-REVENUE',0,df,       'GHS', posted_at, descr, 'order_payment', id, '{}'::jsonb, 'backfill' FROM paid_orders WHERE df       > 0
UNION ALL
SELECT txn, '2200-VAT-PAYABLE',    0, vat,      'GHS', posted_at, descr, 'order_payment', id, '{}'::jsonb, 'backfill' FROM paid_orders WHERE vat      > 0
UNION ALL
SELECT txn, '2210-NHIL-PAYABLE',   0, nhil,     'GHS', posted_at, descr, 'order_payment', id, '{}'::jsonb, 'backfill' FROM paid_orders WHERE nhil     > 0
UNION ALL
SELECT txn, '2220-GETFUND-PAYABLE',0, gf,       'GHS', posted_at, descr, 'order_payment', id, '{}'::jsonb, 'backfill' FROM paid_orders WHERE gf       > 0;

-- ============================================================
-- 2. Orders (delivered with rider → rider_earning journals)
-- ============================================================
WITH delivered_orders AS MATERIALIZED (
  SELECT
    o.id, o.rider_id,
    o.delivery_fee::numeric AS df,
    COALESCE(o.delivered_at, o.created_at) AS posted_at,
    gen_random_uuid() AS txn,
    'Rider #' || o.rider_id || ' earning on Order #' || o.id AS descr
  FROM orders o
  WHERE o.status = 'delivered'
    AND o.rider_id IS NOT NULL
    AND o.delivery_fee::numeric > 0
    AND NOT EXISTS (
      SELECT 1 FROM ledger_entries le
      WHERE le.source_type = 'rider_earning' AND le.source_id = o.id
    )
)
INSERT INTO ledger_entries
  (transaction_id, account_code, debit, credit, currency, posted_at, description, source_type, source_id, meta, created_by)
SELECT txn, '5100-RIDER-COST',    df, 0, 'GHS', posted_at, descr, 'rider_earning', id, jsonb_build_object('riderId', rider_id), 'backfill' FROM delivered_orders
UNION ALL
SELECT txn, '2110-RIDER-PAYABLE', 0, df, 'GHS', posted_at, descr, 'rider_earning', id, jsonb_build_object('riderId', rider_id), 'backfill' FROM delivered_orders;

-- ============================================================
-- 3. Expenses → expense journals (paid from bank)
-- ============================================================
WITH backfill_expenses AS MATERIALIZED (
  SELECT
    e.id,
    e.amount::numeric AS amt,
    e.expense_date::timestamp AS posted_at,
    e.type || COALESCE(' — ' || e.notes, '') AS descr,
    CASE
      WHEN LOWER(e.category) LIKE '%rent%' OR LOWER(e.type) LIKE '%rent%'
        THEN '5400-RENT'
      WHEN LOWER(e.category) LIKE '%util%' OR LOWER(e.type) LIKE '%util%'
        OR LOWER(e.type) LIKE '%power%' OR LOWER(e.type) LIKE '%water%' OR LOWER(e.type) LIKE '%internet%'
        THEN '5410-UTILITIES'
      WHEN LOWER(e.category) LIKE '%market%' OR LOWER(e.type) LIKE '%market%'
        OR LOWER(e.type) LIKE '%ad%' OR LOWER(e.type) LIKE '%promo%'
        THEN '5420-MARKETING'
      WHEN LOWER(e.category) LIKE '%software%' OR LOWER(e.category) LIKE '%saas%'
        OR LOWER(e.type) LIKE '%subscription%' OR LOWER(e.type) LIKE '%hosting%'
        THEN '5430-SOFTWARE'
      WHEN LOWER(e.category) LIKE '%office%' OR LOWER(e.category) LIKE '%supply%' OR LOWER(e.category) LIKE '%supplies%'
        THEN '5440-OFFICE'
      WHEN LOWER(e.category) LIKE '%payroll%' OR LOWER(e.category) LIKE '%salar%' OR LOWER(e.type) LIKE '%salar%'
        THEN '5300-SALARIES'
      ELSE '5900-OTHER-OPEX'
    END AS expense_acct,
    gen_random_uuid() AS txn
  FROM expenses e
  WHERE e.amount::numeric > 0
    AND NOT EXISTS (
      SELECT 1 FROM ledger_entries le
      WHERE le.source_type = 'expense' AND le.source_id = e.id
    )
)
INSERT INTO ledger_entries
  (transaction_id, account_code, debit, credit, currency, posted_at, description, source_type, source_id, meta, created_by)
SELECT txn, expense_acct, amt, 0, 'GHS', posted_at, descr, 'expense', id, '{}'::jsonb, 'backfill' FROM backfill_expenses
UNION ALL
SELECT txn, '1200-BANK',   0, amt, 'GHS', posted_at, descr, 'expense', id, '{}'::jsonb, 'backfill' FROM backfill_expenses;

-- ============================================================
-- 4. Vendor payouts (paid only) → vendor_payout journals (paid from bank)
-- ============================================================
WITH paid_payouts AS MATERIALIZED (
  SELECT
    p.id, p.vendor_id,
    p.total_amount::numeric AS amt,
    COALESCE(p.paid_at, p.requested_at) AS posted_at,
    gen_random_uuid() AS txn,
    'Vendor #' || p.vendor_id || ' payout' AS descr
  FROM payouts p
  WHERE p.status = 'paid'
    AND p.total_amount::numeric > 0
    AND NOT EXISTS (
      SELECT 1 FROM ledger_entries le
      WHERE le.source_type = 'vendor_payout' AND le.source_id = p.id
    )
)
INSERT INTO ledger_entries
  (transaction_id, account_code, debit, credit, currency, posted_at, description, source_type, source_id, meta, created_by)
SELECT txn, '2100-VENDOR-PAYABLE', amt, 0, 'GHS', posted_at, descr, 'vendor_payout', id, jsonb_build_object('vendorId', vendor_id), 'backfill' FROM paid_payouts
UNION ALL
SELECT txn, '1200-BANK',           0, amt, 'GHS', posted_at, descr, 'vendor_payout', id, jsonb_build_object('vendorId', vendor_id), 'backfill' FROM paid_payouts;

-- ============================================================
-- 5a. Payroll accrual (DR Salaries / CR Salaries payable)
-- ============================================================
WITH payroll_accrual AS MATERIALIZED (
  SELECT
    pp.id, pp.amount::numeric AS amt, pp.paid_at AS posted_at,
    gen_random_uuid() AS txn,
    'Payroll run #' || pp.id || ' accrual' AS descr
  FROM payroll_payments pp
  WHERE pp.amount::numeric > 0
    AND NOT EXISTS (
      SELECT 1 FROM ledger_entries le
      WHERE le.source_type = 'payroll_accrual' AND le.source_id = pp.id
    )
)
INSERT INTO ledger_entries
  (transaction_id, account_code, debit, credit, currency, posted_at, description, source_type, source_id, meta, created_by)
SELECT txn, '5300-SALARIES',         amt, 0, 'GHS', posted_at, descr, 'payroll_accrual', id, '{}'::jsonb, 'backfill' FROM payroll_accrual
UNION ALL
SELECT txn, '2300-SALARIES-PAYABLE', 0, amt, 'GHS', posted_at, descr, 'payroll_accrual', id, '{}'::jsonb, 'backfill' FROM payroll_accrual;

-- ============================================================
-- 5b. Payroll disbursement (DR Salaries payable / CR receiving)
-- ============================================================
WITH payroll_disb AS MATERIALIZED (
  SELECT
    pp.id, pp.amount::numeric AS amt, pp.paid_at AS posted_at,
    gen_random_uuid() AS txn,
    'Salary disbursement #' || pp.id AS descr,
    CASE
      WHEN LOWER(pp.payment_method) LIKE '%cash%' THEN '1100-CASH'
      WHEN LOWER(pp.payment_method) LIKE '%mtn%' THEN '1110-MOMO-MTN'
      WHEN LOWER(pp.payment_method) LIKE '%telecel%' OR LOWER(pp.payment_method) LIKE '%vodafone%' THEN '1111-MOMO-TELECEL'
      WHEN LOWER(pp.payment_method) LIKE '%airtel%' OR LOWER(pp.payment_method) LIKE '%tigo%' OR LOWER(pp.payment_method) = 'at' THEN '1112-MOMO-AT'
      ELSE '1200-BANK'
    END AS recv_acct
  FROM payroll_payments pp
  WHERE pp.amount::numeric > 0
    AND NOT EXISTS (
      SELECT 1 FROM ledger_entries le
      WHERE le.source_type = 'payroll_disbursement' AND le.source_id = pp.id
    )
)
INSERT INTO ledger_entries
  (transaction_id, account_code, debit, credit, currency, posted_at, description, source_type, source_id, meta, created_by)
SELECT txn, '2300-SALARIES-PAYABLE', amt, 0, 'GHS', posted_at, descr, 'payroll_disbursement', id, '{}'::jsonb, 'backfill' FROM payroll_disb
UNION ALL
SELECT txn, recv_acct,               0, amt, 'GHS', posted_at, descr, 'payroll_disbursement', id, '{}'::jsonb, 'backfill' FROM payroll_disb;

COMMIT;
