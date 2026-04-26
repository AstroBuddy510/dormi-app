import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import {
  bankAccountsTable,
  cashFloatCountsTable,
} from "../../../../lib/db/src/schema/index.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { ledgerBalanceForAccount } from "../lib/reconcile.js";
import { postTransaction } from "../lib/ledger.js";

const router: IRouter = Router();

router.use(authenticate, authorize(["admin", "accountant"]));

const getActor = (req: any) => {
  const u = (req as any).user;
  return { id: u?.id ?? 0, name: u?.name ?? "admin" };
};

/** GET /cash-floats — list all cash_float bank_accounts with current expected balance */
router.get("/", async (_req, res) => {
  try {
    const accts = await db.select().from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.type, "cash_float"), eq(bankAccountsTable.isActive, true)))
      .orderBy(bankAccountsTable.id);
    const today = new Date();
    const rows = await Promise.all(accts.map(async a => ({
      ...a,
      expectedBalance: await ledgerBalanceForAccount(a.id, today),
    })));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

/** GET /cash-floats/:bankAccountId/counts — historical counts for one float */
router.get("/:bankAccountId/counts", async (req, res) => {
  try {
    const bankAccountId = parseInt(req.params.bankAccountId);
    const rows = await db.select().from(cashFloatCountsTable)
      .where(eq(cashFloatCountsTable.bankAccountId, bankAccountId))
      .orderBy(desc(cashFloatCountsTable.countDate))
      .limit(100);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

/**
 * POST /cash-floats/counts — submit a count.
 *   { bankAccountId, countDate, declaredBalance, reason?, postAdjustment }
 * If postAdjustment === true and discrepancy != 0, posts an adjustment journal:
 *   shortage (declared < expected) → DR 6900-CASH-SHORT-OVER, CR <float gl>
 *   surplus  (declared > expected) → DR <float gl>,           CR 6900-CASH-SHORT-OVER
 */
const submitSchema = z.object({
  bankAccountId: z.number(),
  countDate: z.string(),
  declaredBalance: z.number(),
  reason: z.string().optional().nullable(),
  postAdjustment: z.boolean().default(false),
});

router.post("/counts", async (req, res) => {
  try {
    const body = submitSchema.parse(req.body);
    const actor = getActor(req);

    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, body.bankAccountId));
    if (!acct) { res.status(404).json({ error: "not_found" }); return; }
    if (acct.type !== "cash_float") {
      res.status(400).json({ error: "bad_request", message: "Only cash_float accounts can be counted." });
      return;
    }

    const expected = await ledgerBalanceForAccount(body.bankAccountId, body.countDate);
    const discrepancy = body.declaredBalance - expected;

    let adjustmentTxId: string | null = null;
    if (body.postAdjustment && Math.abs(discrepancy) >= 0.005) {
      // Post adjustment journal — variance hits 6900-CASH-SHORT-OVER.
      const lines = discrepancy < 0
        // Shortage: cash missing → expense up, float down
        ? [
            { accountCode: "6900-CASH-SHORT-OVER", debit: Math.abs(discrepancy) },
            { accountCode: acct.glAccountCode, credit: Math.abs(discrepancy) },
          ]
        // Surplus: extra cash → float up, recovery down
        : [
            { accountCode: acct.glAccountCode, debit: discrepancy },
            { accountCode: "6900-CASH-SHORT-OVER", credit: discrepancy },
          ];
      const posted = await postTransaction({
        lines,
        sourceType: "manual",
        sourceId: null,
        postedAt: new Date(body.countDate),
        description: `Cash float ${discrepancy < 0 ? "shortage" : "surplus"} — ${acct.name}`,
        meta: { source: "cash-float-count", bankAccountId: body.bankAccountId, reason: body.reason ?? null },
        createdBy: actor.name,
      });
      adjustmentTxId = posted.transactionId;
    }

    const [created] = await db.insert(cashFloatCountsTable).values({
      bankAccountId: body.bankAccountId,
      countDate: body.countDate,
      expectedBalance: expected.toFixed(2),
      declaredBalance: body.declaredBalance.toFixed(2),
      discrepancy: discrepancy.toFixed(2),
      status: adjustmentTxId ? "posted" : "submitted",
      reason: body.reason ?? null,
      adjustmentTransactionId: adjustmentTxId,
      submittedBy: actor.id,
      submittedByName: actor.name,
    }).returning();

    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
