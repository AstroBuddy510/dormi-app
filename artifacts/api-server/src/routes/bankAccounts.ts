import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import {
  bankAccountsTable,
  bankStatementLinesTable,
  chartOfAccountsTable,
} from "../../../../lib/db/src/schema/index.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { ledgerBalanceForAccount } from "../lib/reconcile.js";

const router: IRouter = Router();

router.use(authenticate, authorize(["admin", "accountant"]));

// GET /bank-accounts — list with stats (line counts, ledger balance)
router.get("/", async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const baseQuery = includeInactive
      ? db.select().from(bankAccountsTable).orderBy(bankAccountsTable.id)
      : db.select().from(bankAccountsTable).where(eq(bankAccountsTable.isActive, true)).orderBy(bankAccountsTable.id);
    const accounts = await baseQuery;

    // Pull line counts per account in one round-trip
    const counts = await db
      .select({
        bankAccountId: bankStatementLinesTable.bankAccountId,
        total: sql<number>`COUNT(*)::int`,
        unmatched: sql<number>`SUM(CASE WHEN ${bankStatementLinesTable.matchStatus} = 'unmatched' THEN 1 ELSE 0 END)::int`,
      })
      .from(bankStatementLinesTable)
      .groupBy(bankStatementLinesTable.bankAccountId);
    const countMap = new Map(counts.map(c => [c.bankAccountId, c]));

    const today = new Date();
    const enriched = await Promise.all(accounts.map(async a => ({
      ...a,
      lineCount: countMap.get(a.id)?.total ?? 0,
      unmatchedCount: countMap.get(a.id)?.unmatched ?? 0,
      ledgerBalance: await ledgerBalanceForAccount(a.id, today),
    })));
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /bank-accounts/gl-codes — list of available chart_of_accounts entries for the dropdown
router.get("/gl-codes", async (_req, res) => {
  try {
    const rows = await db.select({
      code: chartOfAccountsTable.code,
      name: chartOfAccountsTable.name,
      type: chartOfAccountsTable.type,
    }).from(chartOfAccountsTable).where(eq(chartOfAccountsTable.active, true)).orderBy(chartOfAccountsTable.code);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /bank-accounts/:id — single account detail
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id));
    if (!acct) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({
      ...acct,
      ledgerBalance: await ledgerBalanceForAccount(id, new Date()),
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// POST /bank-accounts — create
const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["paystack", "momo", "bank", "cash_float"]),
  provider: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  glAccountCode: z.string().min(1),
  ownerType: z.enum(["rider", "agent", "office"]).optional().nullable(),
  ownerId: z.number().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  openingBalance: z.string().optional().default("0.00"),
  notes: z.string().optional().nullable(),
});

router.post("/", async (req, res) => {
  try {
    const body = createSchema.parse(req.body);
    const [created] = await db.insert(bankAccountsTable).values(body).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// PATCH /bank-accounts/:id — update
const patchSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = patchSchema.parse(req.body);
    const [updated] = await db.update(bankAccountsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(bankAccountsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
