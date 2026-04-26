import { sql, and, gte, lte, eq, asc, inArray } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import {
  ledgerEntriesTable,
  chartOfAccountsTable,
  bankAccountsTable,
} from "../../../../lib/db/src/schema/index.js";

/**
 * Financial reporting engines: P&L, Balance Sheet, Cash Flow (direct),
 * Trial Balance, GL Detail.
 *
 * Reports read from `ledger_entries` only — never from source tables.
 * That's the entire point of having a ledger: a single source of truth
 * that already incorporates every business event after the posting
 * helpers + backfill have done their work.
 *
 * Account-code conventions (set in lib/ledger.ts):
 *   1xxx  Assets       (debit-normal)
 *     11xx Cash & MoMo (1100-CASH, 1110-MOMO-MTN, 1111-MOMO-TELECEL, 1112-MOMO-AT)
 *     12xx Bank        (1200-BANK)
 *     13xx Receivables (1300-PAYSTACK-RECV)
 *   2xxx  Liabilities  (credit-normal)
 *     21xx Payables    (2100-VENDOR-PAYABLE, 2110-RIDER-PAYABLE)
 *     22xx Tax payable (2200-VAT-PAYABLE, 2210-NHIL-PAYABLE, 2220-GETFUND-PAYABLE)
 *     23xx Salaries    (2300-SALARIES-PAYABLE)
 *   3xxx  Equity       (credit-normal)
 *   4xxx  Revenue      (credit-normal — increases on credit)
 *     4100 Service revenue, 4200 Delivery revenue
 *   5xxx  Direct costs (debit-normal)
 *     5100 Rider cost, 5200 Paystack fees, 5300 Salaries
 *   6xxx  Operating expenses (debit-normal)
 *     6900 Cash short/over (variance)
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => round2(n).toFixed(2);

// ── Period helpers ───────────────────────────────────────────────────────

export interface DateRange { from: string; to: string; }

export function priorPeriod(range: DateRange): DateRange {
  // Same length window immediately preceding `from`.
  const start = new Date(range.from + "T00:00:00Z");
  const end = new Date(range.to + "T00:00:00Z");
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const priorEnd = new Date(start);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - days);
  return {
    from: priorStart.toISOString().slice(0, 10),
    to: priorEnd.toISOString().slice(0, 10),
  };
}

// ── Core query: per-account net for a period ─────────────────────────────

interface AccountTotals {
  accountCode: string;
  name: string;
  type: string;
  normalBalance: string;
  debit: number;
  credit: number;
  net: number; // debit - credit
}

/** Sum debits/credits per account_code over a date range, joined with chart_of_accounts. */
async function totalsByAccount(range: DateRange | null): Promise<AccountTotals[]> {
  const where = range
    ? and(
        gte(ledgerEntriesTable.postedAt, new Date(range.from + "T00:00:00Z")),
        lte(ledgerEntriesTable.postedAt, new Date(range.to + "T23:59:59Z")),
      )
    : undefined;

  const rows = await db
    .select({
      accountCode: ledgerEntriesTable.accountCode,
      debit: sql<string>`COALESCE(SUM(${ledgerEntriesTable.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${ledgerEntriesTable.credit}), 0)`,
    })
    .from(ledgerEntriesTable)
    .where(where ?? sql`true`)
    .groupBy(ledgerEntriesTable.accountCode);

  // Join chart-of-accounts metadata
  const codes = rows.map(r => r.accountCode);
  const accounts = codes.length === 0
    ? []
    : await db.select().from(chartOfAccountsTable).where(inArray(chartOfAccountsTable.code, codes));
  const accountMap = new Map(accounts.map(a => [a.code, a]));

  return rows.map(r => {
    const a = accountMap.get(r.accountCode);
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    return {
      accountCode: r.accountCode,
      name: a?.name ?? r.accountCode,
      type: a?.type ?? "unknown",
      normalBalance: a?.normalBalance ?? "debit",
      debit,
      credit,
      net: round2(debit - credit),
    };
  });
}

/**
 * Cumulative totals for every account up to and including `asOf`.
 * Used by the balance sheet (asset/liability/equity snapshot).
 */
async function cumulativeTotals(asOf: string): Promise<AccountTotals[]> {
  return totalsByAccount({ from: "1900-01-01", to: asOf });
}

// ── 1. P&L (Income Statement) ────────────────────────────────────────────

export interface PnlLine {
  accountCode: string;
  name: string;
  current: number;
  prior: number;
  delta: number;
}

export interface PnlSection {
  heading: string;
  lines: PnlLine[];
  total: { current: number; prior: number; delta: number };
}

export interface PnlReport {
  range: DateRange;
  priorRange: DateRange;
  revenue: PnlSection;
  directCosts: PnlSection;
  grossProfit: { current: number; prior: number; delta: number };
  operatingExpenses: PnlSection;
  netIncome: { current: number; prior: number; delta: number };
}

export async function buildPnl(range: DateRange): Promise<PnlReport> {
  const prior = priorPeriod(range);
  const [cur, prv] = await Promise.all([totalsByAccount(range), totalsByAccount(prior)]);

  const buildSection = (heading: string, predicate: (a: AccountTotals) => boolean, sign: 1 | -1): PnlSection => {
    const codes = new Set([...cur, ...prv].filter(predicate).map(a => a.accountCode));
    const lines: PnlLine[] = Array.from(codes).sort().map(code => {
      const c = cur.find(a => a.accountCode === code);
      const p = prv.find(a => a.accountCode === code);
      // For credit-normal (revenue/liability), value = credit - debit. For debit-normal, value = debit - credit.
      const cv = c ? round2(sign === 1 ? -c.net : c.net) : 0;
      const pv = p ? round2(sign === 1 ? -p.net : p.net) : 0;
      return {
        accountCode: code,
        name: c?.name ?? p?.name ?? code,
        current: cv,
        prior: pv,
        delta: round2(cv - pv),
      };
    });
    const total = lines.reduce((s, l) => ({
      current: round2(s.current + l.current),
      prior: round2(s.prior + l.prior),
      delta: round2(s.delta + l.delta),
    }), { current: 0, prior: 0, delta: 0 });
    return { heading, lines, total };
  };

  // Revenue: account_code starts with "4" (credit-normal: value = credit - debit, so sign=1)
  const revenue = buildSection("Revenue", a => a.accountCode.startsWith("4"), 1);
  // Direct costs: account_code starts with "5" (debit-normal)
  const directCosts = buildSection("Direct Costs", a => a.accountCode.startsWith("5"), -1);
  // Operating expenses: account_code starts with "6" (debit-normal)
  const operatingExpenses = buildSection("Operating Expenses", a => a.accountCode.startsWith("6"), -1);

  const grossProfit = {
    current: round2(revenue.total.current - directCosts.total.current),
    prior: round2(revenue.total.prior - directCosts.total.prior),
    delta: 0,
  };
  grossProfit.delta = round2(grossProfit.current - grossProfit.prior);

  const netIncome = {
    current: round2(grossProfit.current - operatingExpenses.total.current),
    prior: round2(grossProfit.prior - operatingExpenses.total.prior),
    delta: 0,
  };
  netIncome.delta = round2(netIncome.current - netIncome.prior);

  return { range, priorRange: prior, revenue, directCosts, grossProfit, operatingExpenses, netIncome };
}

// ── 2. Balance Sheet ─────────────────────────────────────────────────────

export interface BsLine { accountCode: string; name: string; current: number; prior: number; delta: number; }
export interface BsSection { heading: string; lines: BsLine[]; total: { current: number; prior: number; delta: number; }; }
export interface BalanceSheetReport {
  asOf: string;
  priorAsOf: string;
  assets: BsSection;
  liabilities: BsSection;
  equity: BsSection;
  totalLiabAndEquity: { current: number; prior: number; delta: number };
  retainedEarnings: { current: number; prior: number; delta: number };
  balanceCheck: { current: number; prior: number };
}

/** Prior asOf = same day previous year. Simpler than computing "prior period end". */
function priorAsOf(asOf: string): string {
  const d = new Date(asOf + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export async function buildBalanceSheet(asOf: string): Promise<BalanceSheetReport> {
  const prior = priorAsOf(asOf);
  const [cur, prv] = await Promise.all([cumulativeTotals(asOf), cumulativeTotals(prior)]);

  const sectionFor = (heading: string, predicate: (a: AccountTotals) => boolean, normalDebit: boolean): BsSection => {
    const codes = new Set([...cur, ...prv].filter(predicate).map(a => a.accountCode));
    const lines: BsLine[] = Array.from(codes).sort().map(code => {
      const c = cur.find(a => a.accountCode === code);
      const p = prv.find(a => a.accountCode === code);
      const cv = c ? round2(normalDebit ? c.net : -c.net) : 0;
      const pv = p ? round2(normalDebit ? p.net : -p.net) : 0;
      return { accountCode: code, name: c?.name ?? p?.name ?? code, current: cv, prior: pv, delta: round2(cv - pv) };
    });
    const total = lines.reduce((s, l) => ({
      current: round2(s.current + l.current),
      prior: round2(s.prior + l.prior),
      delta: round2(s.delta + l.delta),
    }), { current: 0, prior: 0, delta: 0 });
    return { heading, lines, total };
  };

  const assets = sectionFor("Assets", a => a.accountCode.startsWith("1"), true);
  const liabilities = sectionFor("Liabilities", a => a.accountCode.startsWith("2"), false);

  // Equity sums any 3xxx accounts plus computed retained earnings (revenue - costs - opex)
  const equity = sectionFor("Equity (book)", a => a.accountCode.startsWith("3"), false);

  const allRevenueCur = cur.filter(a => a.accountCode.startsWith("4")).reduce((s, a) => s + (-a.net), 0);
  const allRevenuePrv = prv.filter(a => a.accountCode.startsWith("4")).reduce((s, a) => s + (-a.net), 0);
  const allCostsOpexCur = cur.filter(a => a.accountCode.startsWith("5") || a.accountCode.startsWith("6")).reduce((s, a) => s + a.net, 0);
  const allCostsOpexPrv = prv.filter(a => a.accountCode.startsWith("5") || a.accountCode.startsWith("6")).reduce((s, a) => s + a.net, 0);

  const retained = {
    current: round2(allRevenueCur - allCostsOpexCur),
    prior: round2(allRevenuePrv - allCostsOpexPrv),
    delta: 0,
  };
  retained.delta = round2(retained.current - retained.prior);

  // Inject retained earnings as a virtual line in the equity section
  equity.lines.push({
    accountCode: "3900-RETAINED",
    name: "Retained earnings (calculated)",
    current: retained.current,
    prior: retained.prior,
    delta: retained.delta,
  });
  equity.total = {
    current: round2(equity.total.current + retained.current),
    prior: round2(equity.total.prior + retained.prior),
    delta: round2(equity.total.delta + retained.delta),
  };

  const totalLiabAndEquity = {
    current: round2(liabilities.total.current + equity.total.current),
    prior: round2(liabilities.total.prior + equity.total.prior),
    delta: round2(liabilities.total.delta + equity.total.delta),
  };

  return {
    asOf,
    priorAsOf: prior,
    assets,
    liabilities,
    equity,
    totalLiabAndEquity,
    retainedEarnings: retained,
    balanceCheck: {
      current: round2(assets.total.current - totalLiabAndEquity.current),
      prior: round2(assets.total.prior - totalLiabAndEquity.prior),
    },
  };
}

// ── 3. Cash Flow (direct method) ─────────────────────────────────────────

export interface CashCategoryLine {
  accountCode: string;
  name: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashFlowReport {
  range: DateRange;
  priorRange: DateRange;
  // Cash channels (1100-1112, 1200, 1300) — their net change for the period
  channels: { accountCode: string; name: string; openingBalance: number; closingBalance: number; netChange: number; priorNetChange: number; }[];
  // What drove the inflows/outflows, broken down by counterparty account
  inflowsByCategory: CashCategoryLine[];
  outflowsByCategory: CashCategoryLine[];
  totals: {
    netCashChange: number; priorNetCashChange: number;
    totalInflow: number; totalOutflow: number;
  };
}

/** "Cash" for direct CF includes all asset accounts that represent liquid balances. */
const CASH_PREFIXES = ["1100", "1110", "1111", "1112", "1200", "1300"];
const isCashCode = (code: string) => CASH_PREFIXES.some(p => code.startsWith(p));

export async function buildCashFlow(range: DateRange): Promise<CashFlowReport> {
  const prior = priorPeriod(range);
  // Channel balances: opening = cumulative through day-before-from; closing = cumulative through to.
  const fromMinusOne = (() => {
    const d = new Date(range.from + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const [opening, closing, periodTotals, priorTotals] = await Promise.all([
    cumulativeTotals(fromMinusOne),
    cumulativeTotals(range.to),
    totalsByAccount(range),
    totalsByAccount(prior),
  ]);

  const channelCodes = Array.from(new Set([
    ...opening, ...closing, ...periodTotals, ...priorTotals,
  ].filter(a => isCashCode(a.accountCode)).map(a => a.accountCode))).sort();

  const channels = channelCodes.map(code => {
    const o = opening.find(a => a.accountCode === code);
    const c = closing.find(a => a.accountCode === code);
    const cur = periodTotals.find(a => a.accountCode === code);
    const prv = priorTotals.find(a => a.accountCode === code);
    return {
      accountCode: code,
      name: c?.name ?? o?.name ?? code,
      openingBalance: round2(o?.net ?? 0),
      closingBalance: round2(c?.net ?? 0),
      netChange: round2(cur?.net ?? 0),
      priorNetChange: round2(prv?.net ?? 0),
    };
  });

  // For the direct CF body, we need the OFFSETTING accounts touched on every
  // ledger transaction that hit a cash channel during the period. Pull all
  // transaction_ids that touched a cash channel, then sum their non-cash
  // legs grouped by counterpart account_code.
  const touchedTxs = await db
    .selectDistinct({ tx: ledgerEntriesTable.transactionId })
    .from(ledgerEntriesTable)
    .where(and(
      gte(ledgerEntriesTable.postedAt, new Date(range.from + "T00:00:00Z")),
      lte(ledgerEntriesTable.postedAt, new Date(range.to + "T23:59:59Z")),
      sql`(${ledgerEntriesTable.accountCode} LIKE '1100%' OR ${ledgerEntriesTable.accountCode} LIKE '1110%' OR ${ledgerEntriesTable.accountCode} LIKE '1111%' OR ${ledgerEntriesTable.accountCode} LIKE '1112%' OR ${ledgerEntriesTable.accountCode} LIKE '1200%' OR ${ledgerEntriesTable.accountCode} LIKE '1300%')`,
    ));
  const txIds = touchedTxs.map(r => r.tx);

  const counterRows = txIds.length === 0 ? [] : await db
    .select({
      accountCode: ledgerEntriesTable.accountCode,
      debit: sql<string>`COALESCE(SUM(${ledgerEntriesTable.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${ledgerEntriesTable.credit}), 0)`,
    })
    .from(ledgerEntriesTable)
    .where(and(
      inArray(ledgerEntriesTable.transactionId, txIds),
      sql`NOT (${ledgerEntriesTable.accountCode} LIKE '1100%' OR ${ledgerEntriesTable.accountCode} LIKE '1110%' OR ${ledgerEntriesTable.accountCode} LIKE '1111%' OR ${ledgerEntriesTable.accountCode} LIKE '1112%' OR ${ledgerEntriesTable.accountCode} LIKE '1200%' OR ${ledgerEntriesTable.accountCode} LIKE '1300%')`,
    ))
    .groupBy(ledgerEntriesTable.accountCode);

  const counterCodes = counterRows.map(r => r.accountCode);
  const counterAccounts = counterCodes.length === 0 ? [] : await db.select().from(chartOfAccountsTable).where(inArray(chartOfAccountsTable.code, counterCodes));
  const cnMap = new Map(counterAccounts.map(a => [a.code, a]));

  const inflows: CashCategoryLine[] = [];
  const outflows: CashCategoryLine[] = [];
  for (const r of counterRows) {
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    // When a non-cash account is CREDITED in a cash-touching tx, cash is going IN
    // (the matching debit hit cash). Conversely, debit on a non-cash account = cash going OUT.
    const inflow = round2(credit);
    const outflow = round2(debit);
    const a = cnMap.get(r.accountCode);
    const line: CashCategoryLine = {
      accountCode: r.accountCode,
      name: a?.name ?? r.accountCode,
      inflow,
      outflow,
      net: round2(inflow - outflow),
    };
    if (inflow > 0) inflows.push(line);
    if (outflow > 0) outflows.push({ ...line, inflow: 0 }); // dedupe so same account with both sides shows twice (rare)
  }
  inflows.sort((a, b) => b.inflow - a.inflow);
  outflows.sort((a, b) => b.outflow - a.outflow);

  const totalInflow = round2(inflows.reduce((s, l) => s + l.inflow, 0));
  const totalOutflow = round2(outflows.reduce((s, l) => s + l.outflow, 0));
  const netCashChange = round2(channels.reduce((s, c) => s + c.netChange, 0));
  const priorNetCashChange = round2(channels.reduce((s, c) => s + c.priorNetChange, 0));

  return {
    range,
    priorRange: prior,
    channels,
    inflowsByCategory: inflows,
    outflowsByCategory: outflows,
    totals: { netCashChange, priorNetCashChange, totalInflow, totalOutflow },
  };
}

// ── 4. Trial Balance ─────────────────────────────────────────────────────

export interface TrialBalanceLine {
  accountCode: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
}
export interface TrialBalanceReport {
  asOf: string;
  lines: TrialBalanceLine[];
  totals: { debit: number; credit: number; difference: number };
}

export async function buildTrialBalance(asOf: string): Promise<TrialBalanceReport> {
  const cum = await cumulativeTotals(asOf);
  // Each account's TB row: positive net → debit, negative net → credit.
  const lines: TrialBalanceLine[] = cum
    .filter(a => Math.abs(a.net) >= 0.005)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
    .map(a => ({
      accountCode: a.accountCode,
      name: a.name,
      type: a.type,
      debit: a.net > 0 ? round2(a.net) : 0,
      credit: a.net < 0 ? round2(-a.net) : 0,
    }));
  const totals = lines.reduce((s, l) => ({
    debit: round2(s.debit + l.debit),
    credit: round2(s.credit + l.credit),
    difference: 0,
  }), { debit: 0, credit: 0, difference: 0 });
  totals.difference = round2(totals.debit - totals.credit);
  return { asOf, lines, totals };
}

// ── 5. GL Detail ─────────────────────────────────────────────────────────

export interface GlDetailRow {
  id: number;
  transactionId: string;
  postedAt: string;
  description: string | null;
  sourceType: string;
  sourceId: number | null;
  debit: number;
  credit: number;
  runningBalance: number;
}
export interface GlDetailReport {
  accountCode: string;
  accountName: string;
  range: DateRange;
  openingBalance: number;
  closingBalance: number;
  rows: GlDetailRow[];
}

export async function buildGlDetail(accountCode: string, range: DateRange): Promise<GlDetailReport> {
  const [acct] = await db.select().from(chartOfAccountsTable).where(eq(chartOfAccountsTable.code, accountCode)).limit(1);
  // Opening = cumulative through day-before-from
  const fromMinusOne = (() => {
    const d = new Date(range.from + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const opening = await cumulativeTotals(fromMinusOne);
  const openingBalance = round2(opening.find(a => a.accountCode === accountCode)?.net ?? 0);

  const lines = await db
    .select()
    .from(ledgerEntriesTable)
    .where(and(
      eq(ledgerEntriesTable.accountCode, accountCode),
      gte(ledgerEntriesTable.postedAt, new Date(range.from + "T00:00:00Z")),
      lte(ledgerEntriesTable.postedAt, new Date(range.to + "T23:59:59Z")),
    ))
    .orderBy(asc(ledgerEntriesTable.postedAt), asc(ledgerEntriesTable.id));

  let running = openingBalance;
  const rows: GlDetailRow[] = lines.map(l => {
    const debit = Number(l.debit);
    const credit = Number(l.credit);
    running = round2(running + debit - credit);
    return {
      id: l.id,
      transactionId: l.transactionId,
      postedAt: l.postedAt.toISOString(),
      description: l.description,
      sourceType: l.sourceType,
      sourceId: l.sourceId,
      debit,
      credit,
      runningBalance: running,
    };
  });

  return {
    accountCode,
    accountName: acct?.name ?? accountCode,
    range,
    openingBalance,
    closingBalance: running,
    rows,
  };
}
