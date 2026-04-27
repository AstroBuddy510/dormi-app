import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import { ledgerEntriesTable, type LedgerSourceType } from "../../../../lib/db/src/schema/index.js";
import { writeAudit } from "./audit.js";
import { findActiveLockForDate } from "./periodLocks.js";

/**
 * Double-entry posting helpers.
 *
 * Every money event in the platform funnels through `postTransaction`, which
 * validates that debits == credits before inserting. Each helper below is a
 * small façade that constructs the correct journal lines for a specific
 * event type and delegates to `postTransaction`.
 *
 * Idempotency: helpers that wrap a discrete source row (orders.id,
 * expenses.id, etc.) call `findExisting` first — if any ledger lines already
 * reference that (sourceType, sourceId), we return the existing transactionId
 * and skip posting. This makes the backfill safe to re-run, and the
 * production hot-path safe against retries.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => round2(n).toFixed(2);

export interface JournalLine {
  accountCode: string;
  // Use one OR the other, never both. Sign-positive amounts only.
  debit?: number;
  credit?: number;
  description?: string;
}

export interface PostTransactionInput {
  lines: JournalLine[];
  sourceType: LedgerSourceType;
  sourceId?: number | null;
  postedAt?: Date;
  description?: string;
  meta?: Record<string, unknown>;
  createdBy?: string;
}

export interface PostedTransaction {
  transactionId: string;
  alreadyPosted: boolean;
}

async function findExisting(sourceType: LedgerSourceType, sourceId: number): Promise<string | null> {
  const rows = await db
    .select({ tx: ledgerEntriesTable.transactionId })
    .from(ledgerEntriesTable)
    .where(and(eq(ledgerEntriesTable.sourceType, sourceType), eq(ledgerEntriesTable.sourceId, sourceId)))
    .limit(1);
  return rows[0]?.tx ?? null;
}

/**
 * Post a balanced journal. Throws if debits != credits or if no lines.
 */
export async function postTransaction(input: PostTransactionInput): Promise<PostedTransaction> {
  const { lines, sourceType, sourceId, postedAt, description, meta, createdBy } = input;
  if (!lines.length) throw new Error("postTransaction: no lines provided");

  if (sourceId != null) {
    const existing = await findExisting(sourceType, sourceId);
    if (existing) return { transactionId: existing, alreadyPosted: true };
  }

  // Validate balance.
  let totalDr = 0;
  let totalCr = 0;
  for (const l of lines) {
    const dr = round2(l.debit ?? 0);
    const cr = round2(l.credit ?? 0);
    if (dr < 0 || cr < 0) throw new Error("postTransaction: negative amounts not allowed");
    if (dr > 0 && cr > 0) throw new Error("postTransaction: a line cannot have both debit and credit");
    if (dr === 0 && cr === 0) throw new Error("postTransaction: a line must have a debit or credit");
    totalDr += dr;
    totalCr += cr;
  }
  if (Math.abs(totalDr - totalCr) > 0.005) {
    throw new Error(`postTransaction: unbalanced — debits ${totalDr.toFixed(2)} ≠ credits ${totalCr.toFixed(2)}`);
  }

  const transactionId = randomUUID();
  const when = postedAt ?? new Date();

  // App-level period-lock check first: gives the API a friendly error before
  // hitting the DB trigger fallback in 0004_add_audit_and_locks.sql.
  const lock = await findActiveLockForDate(when);
  if (lock) {
    throw new Error(
      `Period locked: cannot post journal dated ${when.toISOString().slice(0,10)} — ` +
      `lock #${lock.id} covers ${lock.periodStart} to ${lock.periodEnd} ` +
      `(by ${lock.lockedByName}${lock.lockReason ? `: ${lock.lockReason}` : ""}).`
    );
  }

  await db.insert(ledgerEntriesTable).values(
    lines.map(l => ({
      transactionId,
      accountCode: l.accountCode,
      debit: money(l.debit ?? 0),
      credit: money(l.credit ?? 0),
      currency: "GHS",
      postedAt: when,
      description: l.description ?? description ?? null,
      sourceType,
      sourceId: sourceId ?? null,
      meta: meta ?? {},
      createdBy: createdBy ?? "system",
    })),
  );

  // Audit the posting itself. Source-table changes are caught by DB triggers
  // — this captures the journal-level event with full line context.
  void writeAudit({
    userName: createdBy ?? "system",
    action: "ledger_post",
    entityType: "ledger_journal",
    entityId: transactionId,
    after: {
      sourceType,
      sourceId: sourceId ?? null,
      postedAt: when.toISOString(),
      description: description ?? null,
      lines: lines.map(l => ({
        accountCode: l.accountCode,
        debit: round2(l.debit ?? 0),
        credit: round2(l.credit ?? 0),
      })),
      total: round2(totalDr),
    },
    metadata: meta ?? {},
  });

  return { transactionId, alreadyPosted: false };
}

// ============================================================================
// Event-specific posting helpers
// ============================================================================

export interface OrderPaymentInput {
  orderId: number;
  subtotal: number;     // goods (passes through to vendor)
  serviceFee: number;
  deliveryFee: number;
  vatAmount: number;
  nhilAmount: number;
  getfundAmount: number;
  receivedInto: "paystack" | "cash" | "momo-mtn" | "momo-telecel" | "momo-at" | "bank";
  postedAt?: Date;
  meta?: Record<string, unknown>;
  createdBy?: string;
}

const RECEIVING_ACCOUNTS = {
  "paystack": "1300-PAYSTACK-RECV",
  "cash": "1100-CASH",
  "momo-mtn": "1110-MOMO-MTN",
  "momo-telecel": "1111-MOMO-TELECEL",
  "momo-at": "1112-MOMO-AT",
  "bank": "1200-BANK",
} as const;

/**
 * Customer pays for an order. Net-revenue marketplace model:
 *   DR  receiving account  (subtotal + service + delivery + taxes)
 *   CR  Vendor payable     (subtotal — flow-through)
 *   CR  Service revenue    (service fee)
 *   CR  Delivery revenue   (delivery fee)
 *   CR  VAT / NHIL / GETFund payable (each enabled tax)
 */
export async function postOrderPayment(input: OrderPaymentInput) {
  const { orderId, subtotal, serviceFee, deliveryFee, vatAmount, nhilAmount, getfundAmount } = input;
  const grossReceived = round2(subtotal + serviceFee + deliveryFee + vatAmount + nhilAmount + getfundAmount);
  const lines: JournalLine[] = [
    { accountCode: RECEIVING_ACCOUNTS[input.receivedInto], debit: grossReceived },
  ];
  if (subtotal > 0) lines.push({ accountCode: "2100-VENDOR-PAYABLE", credit: round2(subtotal) });
  if (serviceFee > 0) lines.push({ accountCode: "4100-SERVICE-REVENUE", credit: round2(serviceFee) });
  if (deliveryFee > 0) lines.push({ accountCode: "4200-DELIVERY-REVENUE", credit: round2(deliveryFee) });
  if (vatAmount > 0) lines.push({ accountCode: "2200-VAT-PAYABLE", credit: round2(vatAmount) });
  if (nhilAmount > 0) lines.push({ accountCode: "2210-NHIL-PAYABLE", credit: round2(nhilAmount) });
  if (getfundAmount > 0) lines.push({ accountCode: "2220-GETFUND-PAYABLE", credit: round2(getfundAmount) });

  return postTransaction({
    lines,
    sourceType: "order_payment",
    sourceId: orderId,
    postedAt: input.postedAt,
    description: `Order #${orderId} customer payment`,
    meta: input.meta,
    createdBy: input.createdBy,
  });
}

/**
 * Recognise rider earnings on delivery completion (matching principle).
 *
 * Compensation depends on rider type:
 *   in_house    — salaried; platform keeps the full delivery_fee as revenue
 *                 (already credited to 4200-DELIVERY-REVENUE in postOrderPayment).
 *                 Returns null without posting anything.
 *   independent — gig worker; platform takes commissionPercent of the fee as
 *                 revenue, the remainder is owed to the rider:
 *                   DR 5100-RIDER-COST     (delivery_fee × (1 − pct/100))
 *                   CR 2110-RIDER-PAYABLE  (delivery_fee × (1 − pct/100))
 *                 Net delivery revenue then = delivery_fee × pct/100.
 */
export interface RiderEarningInput {
  orderId: number;
  riderId: number;
  riderType: "in_house" | "independent";
  /** Full delivery fee charged to the customer. */
  amount: number;
  /** Global rider commission % (0..100). Required only for independent riders. */
  commissionPercent?: number;
  postedAt?: Date;
  createdBy?: string;
}

export async function postRiderEarning(input: RiderEarningInput) {
  if (input.amount <= 0) return null;
  if (input.riderType === "in_house") return null; // salaried — platform keeps full fee
  const pct = Math.max(0, Math.min(100, input.commissionPercent ?? 20));
  const riderShare = round2(input.amount * (100 - pct) / 100);
  if (riderShare <= 0) return null;
  return postTransaction({
    lines: [
      { accountCode: "5100-RIDER-COST", debit: riderShare },
      { accountCode: "2110-RIDER-PAYABLE", credit: riderShare },
    ],
    sourceType: "rider_earning",
    sourceId: input.orderId,
    postedAt: input.postedAt,
    description: `Rider #${input.riderId} earning on Order #${input.orderId} (independent, ${pct}% commission)`,
    meta: { riderId: input.riderId, riderType: input.riderType, commissionPercent: pct, deliveryFee: input.amount, riderShare },
    createdBy: input.createdBy,
  });
}

/**
 * Pay the rider their accumulated payable.
 *   DR  Rider payable
 *   CR  Cash / MoMo / Bank
 */
export interface RiderPayoutInput {
  payoutId: number;
  riderId: number;
  amount: number;
  paidFrom: "cash" | "momo-mtn" | "momo-telecel" | "momo-at" | "bank";
  postedAt?: Date;
  createdBy?: string;
}

export async function postRiderPayout(input: RiderPayoutInput) {
  return postTransaction({
    lines: [
      { accountCode: "2110-RIDER-PAYABLE", debit: round2(input.amount) },
      { accountCode: RECEIVING_ACCOUNTS[input.paidFrom], credit: round2(input.amount) },
    ],
    sourceType: "rider_payout",
    sourceId: input.payoutId,
    postedAt: input.postedAt,
    description: `Rider #${input.riderId} payout`,
    meta: { riderId: input.riderId },
    createdBy: input.createdBy,
  });
}

/**
 * Pay vendor against accrued payable.
 *   DR  Vendor payable
 *   CR  Cash / MoMo / Bank
 */
export interface VendorPayoutInput {
  payoutId: number;
  vendorId: number;
  amount: number;
  paidFrom: "cash" | "momo-mtn" | "momo-telecel" | "momo-at" | "bank";
  postedAt?: Date;
  createdBy?: string;
}

export async function postVendorPayout(input: VendorPayoutInput) {
  return postTransaction({
    lines: [
      { accountCode: "2100-VENDOR-PAYABLE", debit: round2(input.amount) },
      { accountCode: RECEIVING_ACCOUNTS[input.paidFrom], credit: round2(input.amount) },
    ],
    sourceType: "vendor_payout",
    sourceId: input.payoutId,
    postedAt: input.postedAt,
    description: `Vendor #${input.vendorId} payout`,
    meta: { vendorId: input.vendorId },
    createdBy: input.createdBy,
  });
}

/**
 * Record an operating expense.
 *   DR  Expense account
 *   CR  Cash / Bank / MoMo (paid) — or Accounts payable (later)
 */
export interface ExpenseInput {
  expenseId: number;
  expenseAccountCode: string; // e.g. "5400-RENT"
  amount: number;
  paidFrom: "cash" | "momo-mtn" | "momo-telecel" | "momo-at" | "bank";
  postedAt?: Date;
  description?: string;
  createdBy?: string;
}

export async function postExpense(input: ExpenseInput) {
  return postTransaction({
    lines: [
      { accountCode: input.expenseAccountCode, debit: round2(input.amount) },
      { accountCode: RECEIVING_ACCOUNTS[input.paidFrom], credit: round2(input.amount) },
    ],
    sourceType: "expense",
    sourceId: input.expenseId,
    postedAt: input.postedAt,
    description: input.description ?? `Expense #${input.expenseId}`,
    createdBy: input.createdBy,
  });
}

/**
 * Accrue payroll on the run date (matching principle).
 *   DR  Salaries & wages
 *   CR  Salaries payable
 */
export interface PayrollAccrualInput {
  payrollId: number;
  amount: number;
  postedAt?: Date;
  createdBy?: string;
}

export async function postPayrollAccrual(input: PayrollAccrualInput) {
  return postTransaction({
    lines: [
      { accountCode: "5300-SALARIES", debit: round2(input.amount) },
      { accountCode: "2300-SALARIES-PAYABLE", credit: round2(input.amount) },
    ],
    sourceType: "payroll_accrual",
    sourceId: input.payrollId,
    postedAt: input.postedAt,
    description: `Payroll run #${input.payrollId} accrual`,
    createdBy: input.createdBy,
  });
}

/**
 * Pay salaries.
 *   DR  Salaries payable
 *   CR  Cash / Bank / MoMo
 */
export interface PayrollDisbursementInput {
  payrollPaymentId: number;
  amount: number;
  paidFrom: "cash" | "momo-mtn" | "momo-telecel" | "momo-at" | "bank";
  postedAt?: Date;
  createdBy?: string;
}

export async function postPayrollDisbursement(input: PayrollDisbursementInput) {
  return postTransaction({
    lines: [
      { accountCode: "2300-SALARIES-PAYABLE", debit: round2(input.amount) },
      { accountCode: RECEIVING_ACCOUNTS[input.paidFrom], credit: round2(input.amount) },
    ],
    sourceType: "payroll_disbursement",
    sourceId: input.payrollPaymentId,
    postedAt: input.postedAt,
    description: `Salary disbursement #${input.payrollPaymentId}`,
    createdBy: input.createdBy,
  });
}

/**
 * Paystack settlement to the bank account, less Paystack fee.
 * Manual entry from the daily settlement report.
 *   DR  Bank
 *   DR  Paystack fees expense
 *   CR  Paystack receivable
 */
export interface BankSettlementInput {
  settlementId: number;     // typically expenses.id or a synthetic id
  grossAmount: number;
  feeAmount: number;
  netAmount: number;        // grossAmount - feeAmount
  postedAt?: Date;
  createdBy?: string;
}

export async function postBankSettlement(input: BankSettlementInput) {
  return postTransaction({
    lines: [
      { accountCode: "1200-BANK", debit: round2(input.netAmount) },
      { accountCode: "5200-PAYSTACK-FEES", debit: round2(input.feeAmount) },
      { accountCode: "1300-PAYSTACK-RECV", credit: round2(input.grossAmount) },
    ],
    sourceType: "bank_settlement",
    sourceId: input.settlementId,
    postedAt: input.postedAt,
    description: `Paystack settlement #${input.settlementId}`,
    createdBy: input.createdBy,
  });
}

/**
 * Tax remittance to GRA.
 *   DR  Tax payable
 *   CR  Bank
 */
export interface TaxRemittanceInput {
  remittanceId: number;
  taxCode: "VAT" | "NHIL" | "GETFUND";
  amount: number;
  postedAt?: Date;
  createdBy?: string;
}

const TAX_PAYABLE_ACCOUNT: Record<TaxRemittanceInput["taxCode"], string> = {
  "VAT": "2200-VAT-PAYABLE",
  "NHIL": "2210-NHIL-PAYABLE",
  "GETFUND": "2220-GETFUND-PAYABLE",
};

export async function postTaxRemittance(input: TaxRemittanceInput) {
  return postTransaction({
    lines: [
      { accountCode: TAX_PAYABLE_ACCOUNT[input.taxCode], debit: round2(input.amount) },
      { accountCode: "1200-BANK", credit: round2(input.amount) },
    ],
    sourceType: "tax_remittance",
    sourceId: input.remittanceId,
    postedAt: input.postedAt,
    description: `${input.taxCode} remittance to GRA`,
    createdBy: input.createdBy,
  });
}

/**
 * Aggregate balance per account between two dates (inclusive of `from`,
 * inclusive of `to`). Returns a record mapping account code → balance,
 * already signed for the account's normal balance side (asset/expense
 * normal-debit returns positive when debit > credit; liability/equity/revenue
 * normal-credit returns positive when credit > debit).
 */
export async function accountBalances(opts: { from?: Date; to?: Date } = {}): Promise<Record<string, number>> {
  const conditions = [] as any[];
  if (opts.from) conditions.push(sql`${ledgerEntriesTable.postedAt} >= ${opts.from}`);
  if (opts.to) conditions.push(sql`${ledgerEntriesTable.postedAt} <= ${opts.to}`);
  const whereClause = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const result = await db.execute(sql`
    SELECT account_code,
           COALESCE(SUM(debit::numeric - credit::numeric), 0)::numeric AS net_dr
    FROM ${ledgerEntriesTable}
    ${whereClause}
    GROUP BY account_code
  `);

  const out: Record<string, number> = {};
  for (const row of (result as any).rows ?? result) {
    out[row.account_code] = parseFloat(row.net_dr);
  }
  return out;
}
