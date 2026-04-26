import { sql, and, gte, lte, eq, inArray } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import {
  ledgerEntriesTable,
  payrollPaymentsTable,
  payoutsTable,
  employeesTable,
} from "../../../../lib/db/src/schema/index.js";

/**
 * GRA tax filing builders.
 *
 * Each builder reads the canonical sources for its tax type and returns a
 * JSON breakdown the admin UI displays + the accountant can override
 * before marking the filing as `filed`. None of these builders write to the
 * DB — persistence happens via the routes layer.
 *
 * Tax-rate constants are in one place at the top so updates to GRA
 * brackets are a one-line change.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Period helpers ───────────────────────────────────────────────────────
function monthRange(year: number, month: number) {
  // Inclusive boundaries: from = first of month, to = first of next month minus 1ms.
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from, to };
}

// ── 1. VAT / NHIL / GETFund (combined Standard Rate Scheme return) ───────
//
// Reads accruals posted to 2200/2210/2220 during the month. The platform
// already books the full collected tax on every order via postOrderPayment
// (Phase 2). Output VAT (collected) is the credit balance; input VAT
// (paid on purchases — currently zero in this codebase but reserved for
// future expansion) is the debit balance.

export interface VatFiling {
  type: "vat_nhil_getfund";
  periodYear: number;
  periodMonth: number;
  output: { vat: number; nhil: number; getfund: number; total: number };
  input: { vat: number; nhil: number; getfund: number; total: number };
  net: { vat: number; nhil: number; getfund: number; total: number };
  amountPayable: number;
  notes: string;
}

export async function buildVatFiling(year: number, month: number): Promise<VatFiling> {
  const { from, to } = monthRange(year, month);
  const codes = ["2200-VAT-PAYABLE", "2210-NHIL-PAYABLE", "2220-GETFUND-PAYABLE"];
  const rows = await db
    .select({
      accountCode: ledgerEntriesTable.accountCode,
      debit: sql<string>`COALESCE(SUM(${ledgerEntriesTable.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${ledgerEntriesTable.credit}), 0)`,
    })
    .from(ledgerEntriesTable)
    .where(and(
      inArray(ledgerEntriesTable.accountCode, codes),
      gte(ledgerEntriesTable.postedAt, from),
      lte(ledgerEntriesTable.postedAt, to),
    ))
    .groupBy(ledgerEntriesTable.accountCode);
  const map = new Map(rows.map(r => [r.accountCode, { debit: Number(r.debit), credit: Number(r.credit) }]));

  const grab = (code: string) => map.get(code) ?? { debit: 0, credit: 0 };
  const v = grab("2200-VAT-PAYABLE");
  const n = grab("2210-NHIL-PAYABLE");
  const g = grab("2220-GETFUND-PAYABLE");

  const output = {
    vat: round2(v.credit),
    nhil: round2(n.credit),
    getfund: round2(g.credit),
    total: round2(v.credit + n.credit + g.credit),
  };
  const input = {
    vat: round2(v.debit),
    nhil: round2(n.debit),
    getfund: round2(g.debit),
    total: round2(v.debit + n.debit + g.debit),
  };
  const net = {
    vat: round2(output.vat - input.vat),
    nhil: round2(output.nhil - input.nhil),
    getfund: round2(output.getfund - input.getfund),
    total: round2(output.total - input.total),
  };

  return {
    type: "vat_nhil_getfund",
    periodYear: year, periodMonth: month,
    output, input, net,
    amountPayable: round2(net.total),
    notes: "Output = collected from customers; Input = paid on business purchases; Net = remittance owed to GRA.",
  };
}

// ── 2. PAYE (employee income tax withheld) ───────────────────────────────
//
// Ghana 2024 monthly resident PAYE bands. Update when GRA publishes new
// bands (typically each new fiscal year).
const PAYE_BANDS_2024_MONTHLY: { upTo: number; rate: number }[] = [
  { upTo: 490,        rate: 0 },
  { upTo: 600,        rate: 0.05 },
  { upTo: 730,        rate: 0.10 },
  { upTo: 3896.67,    rate: 0.175 },
  { upTo: 19896.67,   rate: 0.25 },
  { upTo: 49896.67,   rate: 0.30 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.35 },
];

function computePaye(monthlyGross: number): number {
  let remaining = monthlyGross;
  let lastUpper = 0;
  let tax = 0;
  for (const band of PAYE_BANDS_2024_MONTHLY) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, band.upTo - lastUpper);
    tax += slice * band.rate;
    remaining -= slice;
    lastUpper = band.upTo;
  }
  return round2(tax);
}

export interface PayeFiling {
  type: "paye";
  periodYear: number;
  periodMonth: number;
  employees: { employeeId: number; name: string; gross: number; paye: number }[];
  totals: { gross: number; paye: number };
  amountPayable: number;
  notes: string;
}

export async function buildPayeFiling(year: number, month: number): Promise<PayeFiling> {
  const { from, to } = monthRange(year, month);
  const rows = await db
    .select({
      employeeId: payrollPaymentsTable.employeeId,
      total: sql<string>`COALESCE(SUM(${payrollPaymentsTable.amount}), 0)`,
    })
    .from(payrollPaymentsTable)
    .where(and(gte(payrollPaymentsTable.paidAt, from), lte(payrollPaymentsTable.paidAt, to)))
    .groupBy(payrollPaymentsTable.employeeId);

  const ids = rows.map(r => r.employeeId);
  const emps = ids.length === 0 ? [] : await db.select().from(employeesTable).where(inArray(employeesTable.id, ids));
  const empMap = new Map(emps.map(e => [e.id, e]));

  const employees = rows.map(r => {
    const e = empMap.get(r.employeeId);
    const gross = Number(r.total);
    return {
      employeeId: r.employeeId,
      name: e?.name ?? `#${r.employeeId}`,
      gross: round2(gross),
      paye: computePaye(gross),
    };
  });

  const totals = employees.reduce((s, e) => ({ gross: s.gross + e.gross, paye: s.paye + e.paye }), { gross: 0, paye: 0 });

  return {
    type: "paye",
    periodYear: year, periodMonth: month,
    employees,
    totals: { gross: round2(totals.gross), paye: round2(totals.paye) },
    amountPayable: round2(totals.paye),
    notes: "Computed using GH 2024 monthly PAYE bands. Override per-employee values if individual circumstances (allowances, multiple sources, non-resident status) differ.",
  };
}

// ── 3. SSNIT (social security) ───────────────────────────────────────────
//
// Ghana mandatory: 18.5% of basic salary (employer 13%, employee 5.5%).
// Of the 18.5%, 13.5% goes to SSNIT (Tier 1) and 5% to a registered
// private fund (Tier 2). Both remit through the same SSNIT process.
const SSNIT_EMPLOYER_RATE = 0.13;
const SSNIT_EMPLOYEE_RATE = 0.055;
const SSNIT_TIER1_RATE = 0.135;
const SSNIT_TIER2_RATE = 0.05;

export interface SsnitFiling {
  type: "ssnit";
  periodYear: number;
  periodMonth: number;
  employees: { employeeId: number; name: string; basic: number; tier1: number; tier2: number; total: number }[];
  totals: {
    basic: number;
    employer: number;
    employee: number;
    tier1: number;
    tier2: number;
    total: number;
  };
  amountPayable: number;
  notes: string;
}

export async function buildSsnitFiling(year: number, month: number): Promise<SsnitFiling> {
  const { from, to } = monthRange(year, month);
  const rows = await db
    .select({
      employeeId: payrollPaymentsTable.employeeId,
      total: sql<string>`COALESCE(SUM(${payrollPaymentsTable.amount}), 0)`,
    })
    .from(payrollPaymentsTable)
    .where(and(gte(payrollPaymentsTable.paidAt, from), lte(payrollPaymentsTable.paidAt, to)))
    .groupBy(payrollPaymentsTable.employeeId);

  const ids = rows.map(r => r.employeeId);
  const emps = ids.length === 0 ? [] : await db.select().from(employeesTable).where(inArray(employeesTable.id, ids));
  const empMap = new Map(emps.map(e => [e.id, e]));

  const employees = rows.map(r => {
    const e = empMap.get(r.employeeId);
    const basic = Number(r.total);
    const tier1 = round2(basic * SSNIT_TIER1_RATE);
    const tier2 = round2(basic * SSNIT_TIER2_RATE);
    return {
      employeeId: r.employeeId,
      name: e?.name ?? `#${r.employeeId}`,
      basic: round2(basic),
      tier1, tier2,
      total: round2(tier1 + tier2),
    };
  });

  const totalBasic = employees.reduce((s, e) => s + e.basic, 0);
  const totals = {
    basic: round2(totalBasic),
    employer: round2(totalBasic * SSNIT_EMPLOYER_RATE),
    employee: round2(totalBasic * SSNIT_EMPLOYEE_RATE),
    tier1: round2(totalBasic * SSNIT_TIER1_RATE),
    tier2: round2(totalBasic * SSNIT_TIER2_RATE),
    total: round2(totalBasic * (SSNIT_TIER1_RATE + SSNIT_TIER2_RATE)),
  };

  return {
    type: "ssnit",
    periodYear: year, periodMonth: month,
    employees,
    totals,
    amountPayable: totals.total,
    notes: "18.5% total: employer 13% + employee 5.5%. Tier 1 (SSNIT) = 13.5%, Tier 2 (registered fund) = 5%. Bands assume monthly basic salaries; adjust if your employees have allowances or multiple income components.",
  };
}

// ── 4. Withholding Tax (track-only) ──────────────────────────────────────
//
// Ghana WHT rates vary by service type (5% for most services, 7.5% for
// management/technical fees, 10–20% for non-residents). Phase 6 ships in
// "track only" mode: we surface payouts that would be subject to WHT so
// admin sees exposure, but don't change posting. Threshold heuristic:
// any single payout above GH₵2,000 triggers a 5% WHT line.
const WHT_THRESHOLD = 2000;
const WHT_DEFAULT_RATE = 0.05;

export interface WhtFiling {
  type: "wht";
  periodYear: number;
  periodMonth: number;
  payouts: { payoutId: number; vendorId: number; totalAmount: number; whtAmount: number; whtRate: number; paidAt: string | null }[];
  totals: { grossPaid: number; estimatedWht: number; payoutCount: number };
  amountPayable: number;
  notes: string;
}

export async function buildWhtFiling(year: number, month: number): Promise<WhtFiling> {
  const { from, to } = monthRange(year, month);
  const rows = await db
    .select()
    .from(payoutsTable)
    .where(and(
      eq(payoutsTable.status, "paid"),
      gte(payoutsTable.paidAt, from),
      lte(payoutsTable.paidAt, to),
    ));

  const payouts = rows.map(p => {
    const total = Number(p.totalAmount);
    const subject = total >= WHT_THRESHOLD;
    const rate = subject ? WHT_DEFAULT_RATE : 0;
    const wht = round2(total * rate);
    return {
      payoutId: p.id,
      vendorId: p.vendorId,
      totalAmount: round2(total),
      whtAmount: wht,
      whtRate: rate * 100,
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    };
  });

  const totals = payouts.reduce((s, p) => ({
    grossPaid: s.grossPaid + p.totalAmount,
    estimatedWht: s.estimatedWht + p.whtAmount,
    payoutCount: s.payoutCount + 1,
  }), { grossPaid: 0, estimatedWht: 0, payoutCount: 0 });

  return {
    type: "wht",
    periodYear: year, periodMonth: month,
    payouts,
    totals: {
      grossPaid: round2(totals.grossPaid),
      estimatedWht: round2(totals.estimatedWht),
      payoutCount: totals.payoutCount,
    },
    amountPayable: round2(totals.estimatedWht),
    notes: `Track-only: payouts ≥ GH₵${WHT_THRESHOLD} are flagged at ${WHT_DEFAULT_RATE * 100}% (general services rate). Non-resident, technical-services, and royalty rates differ — adjust per-payout before filing.`,
  };
}
