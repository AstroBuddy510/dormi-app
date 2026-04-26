import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import {
  bankAccountsTable,
  bankStatementLinesTable,
  reconciliationRunsTable,
} from "../../../../lib/db/src/schema/index.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { ledgerBalanceForAccount } from "../lib/reconcile.js";

const router: IRouter = Router();

router.use(authenticate, authorize(["admin", "accountant"]));

const getActor = (req: any) => {
  const u = (req as any).user;
  return { id: u?.id ?? 0, name: u?.name ?? "admin" };
};

/**
 * GET /reconcile/diff?bankAccountId=X&periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD
 *   Live diff: closing balance per statement vs ledger, plus matched/unmatched counts.
 *   Used by the UI to populate the reconcile workspace before completing a run.
 */
router.get("/diff", async (req, res) => {
  try {
    const bankAccountId = parseInt(req.query.bankAccountId as string);
    const periodStart = req.query.periodStart as string;
    const periodEnd = req.query.periodEnd as string;
    if (!Number.isFinite(bankAccountId) || !periodStart || !periodEnd) {
      res.status(400).json({ error: "bad_request", message: "bankAccountId, periodStart, periodEnd required" });
      return;
    }

    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, bankAccountId));
    if (!acct) { res.status(404).json({ error: "not_found" }); return; }

    // Closing-per-statement: take the latest line in the period (preferring runningBalance, falling back to opening + sum-of-amounts).
    const lines = await db.select().from(bankStatementLinesTable)
      .where(and(
        eq(bankStatementLinesTable.bankAccountId, bankAccountId),
        sql`${bankStatementLinesTable.statementDate} >= ${periodStart}`,
        sql`${bankStatementLinesTable.statementDate} <= ${periodEnd}`,
      ))
      .orderBy(bankStatementLinesTable.statementDate, bankStatementLinesTable.id);

    let closingPerStatement: number;
    const lineWithBalance = [...lines].reverse().find(l => l.runningBalance != null);
    if (lineWithBalance) {
      closingPerStatement = Number(lineWithBalance.runningBalance);
    } else {
      const sumLines = lines.reduce((s, l) => s + Number(l.amount), 0);
      closingPerStatement = Number(acct.openingBalance ?? 0) + sumLines;
    }

    const closingPerLedger = await ledgerBalanceForAccount(bankAccountId, periodEnd);

    let matched = 0, unmatched = 0, expense = 0, income = 0, ignored = 0;
    for (const l of lines) {
      switch (l.matchStatus) {
        case "matched": matched++; break;
        case "unmatched": unmatched++; break;
        case "expense": expense++; break;
        case "income": income++; break;
        case "ignored": ignored++; break;
      }
    }

    res.json({
      bankAccountId,
      bankAccountName: acct.name,
      glAccountCode: acct.glAccountCode,
      periodStart,
      periodEnd,
      lineCount: lines.length,
      matched, unmatched, expense, income, ignored,
      closingPerStatement: closingPerStatement.toFixed(2),
      closingPerLedger: closingPerLedger.toFixed(2),
      difference: (closingPerStatement - closingPerLedger).toFixed(2),
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

/** GET /reconcile/runs?bankAccountId=X */
router.get("/runs", async (req, res) => {
  try {
    const bankAccountId = parseInt(req.query.bankAccountId as string);
    if (!Number.isFinite(bankAccountId)) {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    const rows = await db.select().from(reconciliationRunsTable)
      .where(eq(reconciliationRunsTable.bankAccountId, bankAccountId))
      .orderBy(desc(reconciliationRunsTable.createdAt))
      .limit(50);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

/** POST /reconcile/runs — body: { bankAccountId, periodStart, periodEnd, notes? } */
const startSchema = z.object({
  bankAccountId: z.number(),
  periodStart: z.string(),
  periodEnd: z.string(),
  notes: z.string().optional().nullable(),
});

router.post("/runs", async (req, res) => {
  try {
    const body = startSchema.parse(req.body);
    const actor = getActor(req);

    // Compute current diff and snapshot it onto the run
    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, body.bankAccountId));
    if (!acct) { res.status(404).json({ error: "not_found" }); return; }

    const lines = await db.select().from(bankStatementLinesTable)
      .where(and(
        eq(bankStatementLinesTable.bankAccountId, body.bankAccountId),
        sql`${bankStatementLinesTable.statementDate} >= ${body.periodStart}`,
        sql`${bankStatementLinesTable.statementDate} <= ${body.periodEnd}`,
      ));

    let matched = 0, unmatched = 0;
    for (const l of lines) {
      if (l.matchStatus === "matched" || l.matchStatus === "expense" || l.matchStatus === "income") matched++;
      else if (l.matchStatus === "unmatched") unmatched++;
    }

    const lineWithBalance = [...lines].reverse().find(l => l.runningBalance != null);
    const closingPerStatement = lineWithBalance
      ? Number(lineWithBalance.runningBalance)
      : Number(acct.openingBalance ?? 0) + lines.reduce((s, l) => s + Number(l.amount), 0);
    const closingPerLedger = await ledgerBalanceForAccount(body.bankAccountId, body.periodEnd);

    const [created] = await db.insert(reconciliationRunsTable).values({
      bankAccountId: body.bankAccountId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      openingBalance: (acct.openingBalance ?? "0.00"),
      closingPerStatement: closingPerStatement.toFixed(2),
      closingPerLedger: closingPerLedger.toFixed(2),
      difference: (closingPerStatement - closingPerLedger).toFixed(2),
      matchedCount: matched,
      unmatchedCount: unmatched,
      status: "draft",
      notes: body.notes ?? null,
      createdBy: actor.id,
      createdByName: actor.name,
    }).returning();

    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

/** POST /reconcile/runs/:id/complete — body: { notes? } */
const completeSchema = z.object({ notes: z.string().optional().nullable() });

router.post("/runs/:id/complete", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = completeSchema.parse(req.body);
    const actor = getActor(req);

    const [run] = await db.select().from(reconciliationRunsTable).where(eq(reconciliationRunsTable.id, id));
    if (!run) { res.status(404).json({ error: "not_found" }); return; }
    if (run.status === "completed") {
      res.status(400).json({ error: "already_completed" });
      return;
    }

    const [updated] = await db.update(reconciliationRunsTable).set({
      status: "completed",
      completedBy: actor.id,
      completedByName: actor.name,
      completedAt: new Date(),
      notes: body.notes ?? run.notes,
    }).where(eq(reconciliationRunsTable.id, id)).returning();

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
