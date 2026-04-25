import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import {
  ledgerEntriesTable,
  chartOfAccountsTable,
} from "../../../../lib/db/src/schema/index.js";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { accountBalances, postTransaction, type JournalLine } from "../lib/ledger.js";
import { z } from "zod/v4";

const router: IRouter = Router();

// GET /accounts — full chart of accounts (active rows only by default)
router.get("/accounts", async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const rows = await db.select().from(chartOfAccountsTable)
      .where(includeInactive ? undefined : eq(chartOfAccountsTable.active, true))
      .orderBy(chartOfAccountsTable.code);
    res.json(rows.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      normalBalance: r.normalBalance,
      description: r.description,
      active: r.active,
    })));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /entries — paginated/filterable list of ledger lines
router.get("/entries", async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) ?? "200"), 1000);
    const offset = parseInt((req.query.offset as string) ?? "0");
    const accountCode = req.query.account as string | undefined;
    const sourceType = req.query.sourceType as string | undefined;
    const sourceIdRaw = req.query.sourceId as string | undefined;
    const fromRaw = req.query.from as string | undefined;
    const toRaw = req.query.to as string | undefined;

    const conditions: any[] = [];
    if (accountCode) conditions.push(eq(ledgerEntriesTable.accountCode, accountCode));
    if (sourceType) conditions.push(eq(ledgerEntriesTable.sourceType, sourceType));
    if (sourceIdRaw) conditions.push(eq(ledgerEntriesTable.sourceId, parseInt(sourceIdRaw)));
    if (fromRaw) conditions.push(gte(ledgerEntriesTable.postedAt, new Date(fromRaw)));
    if (toRaw) conditions.push(lte(ledgerEntriesTable.postedAt, new Date(toRaw)));

    const whereExpr = conditions.length ? and(...conditions) : undefined;
    const rows = await db
      .select()
      .from(ledgerEntriesTable)
      .where(whereExpr)
      .orderBy(desc(ledgerEntriesTable.postedAt), desc(ledgerEntriesTable.id))
      .limit(limit)
      .offset(offset);

    const totalRow = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(ledgerEntriesTable)
      .where(whereExpr);

    res.json({
      total: totalRow[0]?.count ?? 0,
      limit,
      offset,
      entries: rows.map(r => ({
        id: r.id,
        transactionId: r.transactionId,
        accountCode: r.accountCode,
        debit: parseFloat(r.debit),
        credit: parseFloat(r.credit),
        currency: r.currency,
        postedAt: r.postedAt.toISOString(),
        description: r.description,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        meta: r.meta ?? {},
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /balances?from&to — account balances (signed for normal-balance side)
router.get("/balances", async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const netDr = await accountBalances({ from, to });

    const accounts = await db.select().from(chartOfAccountsTable);
    const out = accounts.map(a => {
      const net = netDr[a.code] ?? 0;
      const signed = a.normalBalance === "debit" ? net : -net;
      return {
        code: a.code,
        name: a.name,
        type: a.type,
        normalBalance: a.normalBalance,
        balance: Math.round(signed * 100) / 100,
      };
    });
    out.sort((a, b) => a.code.localeCompare(b.code));
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// POST /entries — create a manual journal entry (admin tool)
const ManualEntryBody = z.object({
  postedAt: z.string().optional(),
  description: z.string().optional(),
  lines: z.array(z.object({
    accountCode: z.string(),
    debit: z.number().optional(),
    credit: z.number().optional(),
    description: z.string().optional(),
  })).min(2),
});

router.post("/entries", async (req, res) => {
  try {
    const body = ManualEntryBody.parse(req.body);
    const result = await postTransaction({
      lines: body.lines as JournalLine[],
      sourceType: "manual",
      sourceId: null,
      postedAt: body.postedAt ? new Date(body.postedAt) : undefined,
      description: body.description,
      createdBy: "admin",
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
