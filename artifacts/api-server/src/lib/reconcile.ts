import { and, eq, gte, lte, sql, isNull, ne } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import {
  bankStatementLinesTable,
  ledgerEntriesTable,
  bankAccountsTable,
} from "../../../../lib/db/src/schema/index.js";

/**
 * Bank reconciliation matching engine.
 *
 * Strict policy:
 *   - Auto-match only when reference + amount + date(±2d) all match.
 *   - One-to-one: a statement line matches exactly one ledger transaction;
 *     a transaction is only auto-matched if it has no prior match.
 *   - Refs are normalised (uppercase, alnum-only) before comparison so
 *     casing/spacing differences don't block matches.
 *   - Anything that doesn't pass the strict bar stays 'unmatched' for
 *     manual review. We DO NOT auto-classify or guess.
 *
 * Suggestion mode (used by the UI):
 *   - When admin opens an unmatched line, we score nearby ledger entries
 *     and return the top 5 candidates with reasons (amount match, ref
 *     similarity, date proximity). Admin clicks to confirm.
 */

const DATE_WINDOW_DAYS = 2;

/** Normalise a reference for comparison: upper, alnum-only. */
function normaliseRef(ref: string | null | undefined): string {
  return (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function dateAddDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isoDate(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Sum of debits for a transaction posted to a particular account_code. */
async function netForAccount(transactionId: string, accountCode: string): Promise<number> {
  const rows = await db
    .select({
      debit: sql<string>`SUM(${ledgerEntriesTable.debit})`,
      credit: sql<string>`SUM(${ledgerEntriesTable.credit})`,
    })
    .from(ledgerEntriesTable)
    .where(and(
      eq(ledgerEntriesTable.transactionId, transactionId),
      eq(ledgerEntriesTable.accountCode, accountCode),
    ));
  const r = rows[0];
  if (!r) return 0;
  // Bank-account perspective: a debit to the GL = inflow on the bank statement
  // (cash arrived); a credit = outflow. We compare against the statement
  // amount sign convention (positive = inflow, negative = outflow).
  return Number(r.debit ?? 0) - Number(r.credit ?? 0);
}

export interface MatchCandidate {
  transactionId: string;
  postedAt: string;
  description: string | null;
  netToAccount: number;
  meta: Record<string, unknown>;
  score: number;       // 0..100
  reasons: string[];
  alreadyMatched: boolean;
}

export interface MatchResult {
  bestCandidate: MatchCandidate | null;
  candidates: MatchCandidate[];
  autoMatched: boolean;
}

/**
 * Find candidates for a single statement line. Used by both auto-match and
 * manual-review modes.
 */
export async function findMatchCandidates(opts: {
  bankAccountId: number;
  statementDate: Date | string;
  amount: number; // signed (positive = inflow)
  reference: string | null | undefined;
  description: string | null | undefined;
}): Promise<MatchResult> {
  const account = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, opts.bankAccountId)).limit(1);
  const acct = account[0];
  if (!acct) {
    return { bestCandidate: null, candidates: [], autoMatched: false };
  }

  const stmtDate = typeof opts.statementDate === "string" ? new Date(opts.statementDate) : opts.statementDate;
  const fromDate = dateAddDays(stmtDate, -DATE_WINDOW_DAYS);
  const toDate = dateAddDays(stmtDate, DATE_WINDOW_DAYS);
  const refNorm = normaliseRef(opts.reference);

  // Pull ALL ledger transactions touching this account in the date window.
  // Group by transaction_id, sum debits/credits → net to this account.
  const grouped = await db
    .select({
      transactionId: ledgerEntriesTable.transactionId,
      postedAt: sql<string>`MIN(${ledgerEntriesTable.postedAt})`,
      description: sql<string>`MIN(${ledgerEntriesTable.description})`,
      debitSum: sql<string>`SUM(${ledgerEntriesTable.debit})`,
      creditSum: sql<string>`SUM(${ledgerEntriesTable.credit})`,
      meta: sql<Record<string, unknown>>`(SELECT meta FROM ${ledgerEntriesTable} le2 WHERE le2.transaction_id = ${ledgerEntriesTable.transactionId} AND le2.account_code = ${acct.glAccountCode} LIMIT 1)`,
    })
    .from(ledgerEntriesTable)
    .where(and(
      eq(ledgerEntriesTable.accountCode, acct.glAccountCode),
      gte(ledgerEntriesTable.postedAt, fromDate),
      lte(ledgerEntriesTable.postedAt, dateAddDays(toDate, 1)),
    ))
    .groupBy(ledgerEntriesTable.transactionId);

  // Find which of those transactions already have a matched statement line
  const txIds = grouped.map(g => g.transactionId);
  const alreadyMatched = txIds.length === 0
    ? new Set<string>()
    : new Set(
        (await db
          .select({ tx: bankStatementLinesTable.matchedTransactionId })
          .from(bankStatementLinesTable)
          .where(and(
            eq(bankStatementLinesTable.matchStatus, "matched"),
            sql`${bankStatementLinesTable.matchedTransactionId} = ANY(${txIds})`,
          ))
        ).map(r => r.tx).filter((x): x is string => Boolean(x))
      );

  const candidates: MatchCandidate[] = grouped.map(g => {
    const net = Number(g.debitSum ?? 0) - Number(g.creditSum ?? 0);
    const reasons: string[] = [];
    let score = 0;

    // Amount match: closest weight (45 pts).
    const amountDiff = Math.abs(net - opts.amount);
    if (amountDiff < 0.005) {
      score += 45;
      reasons.push("amount exact match");
    } else if (amountDiff < 1) {
      score += 25;
      reasons.push(`amount within ±₵1 (diff ₵${amountDiff.toFixed(2)})`);
    } else if (amountDiff < 10) {
      score += 5;
      reasons.push(`amount within ±₵10 (diff ₵${amountDiff.toFixed(2)})`);
    } else {
      reasons.push(`amount differs by ₵${amountDiff.toFixed(2)}`);
    }

    // Date proximity (15 pts max)
    const txDate = new Date(g.postedAt);
    const daysApart = Math.abs((stmtDate.getTime() - txDate.getTime()) / 86_400_000);
    if (daysApart < 0.5) {
      score += 15;
      reasons.push("same day");
    } else if (daysApart < 1.5) {
      score += 10;
      reasons.push("±1 day");
    } else {
      score += 5;
      reasons.push(`${Math.round(daysApart)} days apart`);
    }

    // Reference match (40 pts max — high signal in Ghana payments)
    const metaRefs: string[] = [];
    const meta = g.meta || {};
    for (const key of ["paystackRef", "reference", "ref", "transactionRef", "narration"]) {
      const v = (meta as Record<string, unknown>)[key];
      if (typeof v === "string" && v.length > 0) metaRefs.push(v);
    }
    if (typeof g.description === "string") metaRefs.push(g.description);
    const txRefs = metaRefs.map(normaliseRef).filter(s => s.length >= 4);
    if (refNorm.length >= 4) {
      const exact = txRefs.some(r => r === refNorm);
      const contained = txRefs.some(r => r.includes(refNorm) || refNorm.includes(r));
      if (exact) {
        score += 40;
        reasons.push("reference exact match");
      } else if (contained) {
        score += 20;
        reasons.push("reference partial match");
      }
    }

    return {
      transactionId: g.transactionId,
      postedAt: g.postedAt,
      description: g.description ?? null,
      netToAccount: net,
      meta: meta as Record<string, unknown>,
      score,
      reasons,
      alreadyMatched: alreadyMatched.has(g.transactionId),
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 5);

  // Auto-match decision: best candidate must be ≥ 95 (amount-exact + ref-exact + same/±1 day)
  // AND not already matched to another statement line.
  const best = candidates[0];
  const autoMatched = !!best && best.score >= 95 && !best.alreadyMatched;
  return { bestCandidate: best ?? null, candidates: top, autoMatched };
}

/**
 * Run auto-matching across all unmatched lines for a given bank_account.
 * Returns counts. UI calls this after import or via "Run auto-match" button.
 */
export async function autoMatchUnmatched(bankAccountId: number, actor: { id: number; name: string }): Promise<{ matched: number; scanned: number }> {
  const lines = await db
    .select()
    .from(bankStatementLinesTable)
    .where(and(
      eq(bankStatementLinesTable.bankAccountId, bankAccountId),
      eq(bankStatementLinesTable.matchStatus, "unmatched"),
    ));

  let matched = 0;
  for (const line of lines) {
    const result = await findMatchCandidates({
      bankAccountId,
      statementDate: line.statementDate,
      amount: Number(line.amount),
      reference: line.reference,
      description: line.description,
    });
    if (result.autoMatched && result.bestCandidate) {
      await db.update(bankStatementLinesTable)
        .set({
          matchStatus: "matched",
          matchedTransactionId: result.bestCandidate.transactionId,
          matchedAt: new Date(),
          matchedBy: actor.id,
          matchedByName: actor.name,
          matchNote: `Auto-matched (score ${result.bestCandidate.score}: ${result.bestCandidate.reasons.join(", ")})`,
        })
        .where(eq(bankStatementLinesTable.id, line.id));
      matched++;
    }
  }
  return { matched, scanned: lines.length };
}

/**
 * Compute current ledger balance for a bank_account at a cutoff date.
 * `asOf` is exclusive of the day-after to keep semantics simple — the
 * caller should pass the inclusive period end and we'll add 1 day internally.
 */
export async function ledgerBalanceForAccount(bankAccountId: number, asOf: Date | string): Promise<number> {
  const account = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, bankAccountId)).limit(1);
  const acct = account[0];
  if (!acct) return 0;
  const cutoff = typeof asOf === "string" ? new Date(asOf) : asOf;
  const exclusive = dateAddDays(cutoff, 1);

  const rows = await db
    .select({
      debit: sql<string>`COALESCE(SUM(${ledgerEntriesTable.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${ledgerEntriesTable.credit}), 0)`,
    })
    .from(ledgerEntriesTable)
    .where(and(
      eq(ledgerEntriesTable.accountCode, acct.glAccountCode),
      lte(ledgerEntriesTable.postedAt, exclusive),
    ));
  const r = rows[0]!;
  // Bank/asset perspective: debits raise balance, credits lower.
  return Number(r.debit) - Number(r.credit) + Number(acct.openingBalance ?? 0);
}

export { isoDate };
