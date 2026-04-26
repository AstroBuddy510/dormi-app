import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import {
  bankAccountsTable,
  bankStatementLinesTable,
  bankStatementImportsTable,
  ledgerEntriesTable,
} from "../../../../lib/db/src/schema/index.js";
import { authenticate, authorize } from "../middlewares/auth.js";

type Actor = { id: number; name: string };
const getActor = (req: any): Actor => {
  const u = (req as any).user;
  return { id: u?.id ?? 0, name: u?.name ?? "admin" };
};
import { parseStatementCsv, checksumCsv } from "../lib/csvParsers.js";
import { autoMatchUnmatched, findMatchCandidates } from "../lib/reconcile.js";
import { postExpense } from "../lib/ledger.js";

const router: IRouter = Router();

router.use(authenticate, authorize(["admin", "accountant"]));

// GET /statements/lines?bankAccountId=X&matchStatus=unmatched&from=...&to=...
router.get("/lines", async (req, res) => {
  try {
    const bankAccountId = parseInt(req.query.bankAccountId as string);
    if (!Number.isFinite(bankAccountId)) {
      res.status(400).json({ error: "bad_request", message: "bankAccountId required" });
      return;
    }
    const matchStatus = req.query.matchStatus as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || "200"), 500);
    const offset = parseInt((req.query.offset as string) || "0");

    const filters: any[] = [eq(bankStatementLinesTable.bankAccountId, bankAccountId)];
    if (matchStatus && ["unmatched", "matched", "expense", "income", "ignored"].includes(matchStatus)) {
      filters.push(eq(bankStatementLinesTable.matchStatus, matchStatus));
    }
    if (from) filters.push(sql`${bankStatementLinesTable.statementDate} >= ${from}`);
    if (to) filters.push(sql`${bankStatementLinesTable.statementDate} <= ${to}`);

    const rows = await db
      .select()
      .from(bankStatementLinesTable)
      .where(and(...filters))
      .orderBy(desc(bankStatementLinesTable.statementDate), desc(bankStatementLinesTable.id))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(bankStatementLinesTable)
      .where(and(...filters));

    res.json({ lines: rows, total, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// POST /statements/import — body: { bankAccountId, csv, fileName? }
const importSchema = z.object({
  bankAccountId: z.number(),
  csv: z.string().min(1),
  fileName: z.string().optional().nullable(),
});

router.post("/import", async (req, res) => {
  try {
    const body = importSchema.parse(req.body);
    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, body.bankAccountId));
    if (!acct) {
      res.status(404).json({ error: "not_found", message: "Bank account not found" });
      return;
    }
    const checksum = checksumCsv(body.csv);
    // Duplicate detection
    const dupe = await db.select().from(bankStatementImportsTable)
      .where(and(eq(bankStatementImportsTable.bankAccountId, body.bankAccountId), eq(bankStatementImportsTable.fileChecksum, checksum)))
      .limit(1);
    if (dupe.length > 0) {
      res.status(409).json({
        error: "duplicate",
        message: "This file appears to have been imported already.",
        existingImportId: dupe[0].id,
      });
      return;
    }

    const parsed = parseStatementCsv(body.csv);
    if (parsed.lines.length === 0) {
      res.status(400).json({
        error: "parse_failed",
        message: "Could not parse any lines from this file.",
        warnings: parsed.warnings,
        format: parsed.format,
      });
      return;
    }

    // Determine period range
    const dates = parsed.lines.map(l => l.statementDate).sort();
    const periodStart = dates[0];
    const periodEnd = dates[dates.length - 1];

    const actorId = getActor(req).id;
    const actorName = getActor(req).name;

    // Insert import record
    const [imp] = await db.insert(bankStatementImportsTable).values({
      bankAccountId: body.bankAccountId,
      source: "csv",
      fileName: body.fileName ?? null,
      fileChecksum: checksum,
      detectedFormat: parsed.format,
      periodStart,
      periodEnd,
      lineCount: parsed.lines.length,
      status: "pending",
      importedBy: actorId,
      importedByName: actorName,
      metadata: { warnings: parsed.warnings },
    }).returning();

    // Insert all lines
    await db.insert(bankStatementLinesTable).values(
      parsed.lines.map(l => ({
        bankAccountId: body.bankAccountId,
        importId: imp.id,
        statementDate: l.statementDate,
        valueDate: l.valueDate ?? null,
        description: l.description,
        reference: l.reference,
        amount: l.amount.toFixed(2),
        runningBalance: l.runningBalance != null ? l.runningBalance.toFixed(2) : null,
        currency: acct.currency,
        source: "csv" as const,
        rawPayload: l.rawPayload,
        matchStatus: "unmatched" as const,
      }))
    );

    // Mark import complete
    await db.update(bankStatementImportsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(bankStatementImportsTable.id, imp.id));

    // Run auto-match pass
    const matchResult = await autoMatchUnmatched(body.bankAccountId, { id: actorId, name: actorName });

    res.status(201).json({
      importId: imp.id,
      format: parsed.format,
      lineCount: parsed.lines.length,
      autoMatched: matchResult.matched,
      warnings: parsed.warnings,
    });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// GET /statements/imports?bankAccountId=X
router.get("/imports", async (req, res) => {
  try {
    const bankAccountId = parseInt(req.query.bankAccountId as string);
    if (!Number.isFinite(bankAccountId)) {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    const rows = await db.select().from(bankStatementImportsTable)
      .where(eq(bankStatementImportsTable.bankAccountId, bankAccountId))
      .orderBy(desc(bankStatementImportsTable.startedAt))
      .limit(100);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /statements/lines/:id/candidates — match suggestions for one line
router.get("/lines/:id/candidates", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [line] = await db.select().from(bankStatementLinesTable).where(eq(bankStatementLinesTable.id, id));
    if (!line) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const result = await findMatchCandidates({
      bankAccountId: line.bankAccountId,
      statementDate: line.statementDate,
      amount: Number(line.amount),
      reference: line.reference,
      description: line.description,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// POST /statements/lines/:id/match — manual match { transactionId, note? }
const matchSchema = z.object({
  transactionId: z.string().min(1),
  note: z.string().optional().nullable(),
});

router.post("/lines/:id/match", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = matchSchema.parse(req.body);
    const [line] = await db.select().from(bankStatementLinesTable).where(eq(bankStatementLinesTable.id, id));
    if (!line) { res.status(404).json({ error: "not_found" }); return; }

    // Sanity check: transaction exists
    const [tx] = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.transactionId, body.transactionId)).limit(1);
    if (!tx) {
      res.status(400).json({ error: "bad_request", message: "transaction not found" });
      return;
    }

    const [updated] = await db.update(bankStatementLinesTable).set({
      matchStatus: "matched",
      matchedTransactionId: body.transactionId,
      matchedAt: new Date(),
      matchedBy: getActor(req).id,
      matchedByName: getActor(req).name,
      matchNote: body.note ?? "Manually matched",
    }).where(eq(bankStatementLinesTable.id, id)).returning();

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// POST /statements/lines/:id/unmatch
router.post("/lines/:id/unmatch", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(bankStatementLinesTable).set({
      matchStatus: "unmatched",
      matchedTransactionId: null,
      matchedSourceType: null,
      matchedSourceId: null,
      matchedAt: null,
      matchedBy: null,
      matchedByName: null,
      matchNote: `Unmatched by ${getActor(req).name}`,
    }).where(eq(bankStatementLinesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// POST /statements/lines/:id/classify-as-expense — { expenseAccountCode, description? }
// Posts an expense ledger transaction and links the line to it.
const classifySchema = z.object({
  expenseAccountCode: z.string().min(1),
  description: z.string().optional().nullable(),
});

router.post("/lines/:id/classify-as-expense", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = classifySchema.parse(req.body);
    const [line] = await db.select().from(bankStatementLinesTable).where(eq(bankStatementLinesTable.id, id));
    if (!line) { res.status(404).json({ error: "not_found" }); return; }
    if (Number(line.amount) >= 0) {
      res.status(400).json({ error: "bad_request", message: "Only outflows can be classified as expense (use 'income' for inflows)." });
      return;
    }
    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, line.bankAccountId));
    if (!acct) { res.status(404).json({ error: "not_found" }); return; }

    // postExpense expects a paidFrom enum: cash | momo-mtn | momo-telecel | momo-at | bank.
    // Paystack receivables can't be classified as expense (they're a receivable);
    // expenses pulled from Paystack must first settle to bank, then classify off bank.
    const paidFromMap: Record<string, "cash" | "momo-mtn" | "momo-telecel" | "momo-at" | "bank"> = {
      "1100-CASH": "cash",
      "1110-MOMO-MTN": "momo-mtn",
      "1111-MOMO-TELECEL": "momo-telecel",
      "1112-MOMO-AT": "momo-at",
      "1200-BANK": "bank",
    };
    const paidFrom = paidFromMap[acct.glAccountCode];
    if (!paidFrom) {
      res.status(400).json({
        error: "bad_request",
        message: `Cannot classify expense from gl_account_code ${acct.glAccountCode}. Only Cash, MoMo, and Bank accounts are supported as expense sources.`,
      });
      return;
    }

    const posted = await postExpense({
      expenseId: -line.id, // negative source id = ad-hoc reconcile classification
      amount: Math.abs(Number(line.amount)),
      paidFrom,
      expenseAccountCode: body.expenseAccountCode,
      description: body.description ?? line.description,
      postedAt: new Date(line.statementDate),
      createdBy: getActor(req).name,
    });

    const [updated] = await db.update(bankStatementLinesTable).set({
      matchStatus: "expense",
      matchedTransactionId: posted.transactionId,
      matchedSourceType: "expense",
      matchedAt: new Date(),
      matchedBy: getActor(req).id,
      matchedByName: getActor(req).name,
      matchNote: `Classified as expense to ${body.expenseAccountCode}`,
    }).where(eq(bankStatementLinesTable.id, id)).returning();

    res.json({ line: updated, transactionId: posted.transactionId });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// POST /statements/lines/:id/ignore
const ignoreSchema = z.object({ reason: z.string().optional().nullable() });

router.post("/lines/:id/ignore", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = ignoreSchema.parse(req.body);
    const [updated] = await db.update(bankStatementLinesTable).set({
      matchStatus: "ignored",
      matchedAt: new Date(),
      matchedBy: getActor(req).id,
      matchedByName: getActor(req).name,
      matchNote: body.reason ?? "Ignored",
    }).where(eq(bankStatementLinesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// POST /statements/auto-match — body: { bankAccountId } — re-run auto-matching across all unmatched lines
router.post("/auto-match", async (req, res) => {
  try {
    const bankAccountId = z.number().parse(req.body?.bankAccountId);
    const result = await autoMatchUnmatched(bankAccountId, {
      id: getActor(req).id,
      name: getActor(req).name,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// POST /statements/sync-paystack — body: { bankAccountId, from, to }
// Stub: requires a Paystack secret key in env. When PAYSTACK_SECRET_KEY is set,
// fetches /transaction (or /settlement) for the period and writes lines.
const syncSchema = z.object({
  bankAccountId: z.number(),
  from: z.string(), // YYYY-MM-DD
  to: z.string(),
});

router.post("/sync-paystack", async (req, res) => {
  try {
    const body = syncSchema.parse(req.body);
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      res.status(503).json({
        error: "not_configured",
        message: "PAYSTACK_SECRET_KEY env var not set. Configure it in Vercel to enable API sync.",
      });
      return;
    }
    const url = `https://api.paystack.co/transaction?from=${encodeURIComponent(body.from)}&to=${encodeURIComponent(body.to)}&perPage=100`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    if (!resp.ok) {
      const text = await resp.text();
      res.status(502).json({ error: "paystack_error", message: text });
      return;
    }
    const json = (await resp.json()) as any;
    const txs: any[] = json?.data ?? [];
    const successful = txs.filter(t => t?.status === "success");

    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, body.bankAccountId));
    if (!acct) { res.status(404).json({ error: "not_found" }); return; }

    const actorId = getActor(req).id;
    const actorName = getActor(req).name;

    const [imp] = await db.insert(bankStatementImportsTable).values({
      bankAccountId: body.bankAccountId,
      source: "paystack_api",
      detectedFormat: "paystack",
      periodStart: body.from,
      periodEnd: body.to,
      lineCount: successful.length,
      status: "pending",
      importedBy: actorId,
      importedByName: actorName,
      metadata: { fetched: txs.length, successful: successful.length },
    }).returning();

    if (successful.length > 0) {
      await db.insert(bankStatementLinesTable).values(
        successful.map(t => ({
          bankAccountId: body.bankAccountId,
          importId: imp.id,
          statementDate: (t.paid_at ?? t.created_at ?? body.to).slice(0, 10),
          valueDate: null,
          description: t.customer?.email ? `Paystack — ${t.customer.email}` : `Paystack ${t.reference}`,
          reference: String(t.reference ?? ""),
          amount: ((Number(t.amount ?? 0)) / 100).toFixed(2), // kobo→GHS
          runningBalance: null,
          currency: acct.currency,
          source: "paystack_api" as const,
          rawPayload: t,
          matchStatus: "unmatched" as const,
        }))
      );
    }

    await db.update(bankStatementImportsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(bankStatementImportsTable.id, imp.id));

    const matchResult = await autoMatchUnmatched(body.bankAccountId, { id: actorId, name: actorName });

    res.json({
      importId: imp.id,
      fetched: txs.length,
      inserted: successful.length,
      autoMatched: matchResult.matched,
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

export default router;
