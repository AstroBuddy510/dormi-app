import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import {
  taxFilingsTable, bankAccountsTable,
} from "../../../../lib/db/src/schema/index.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import {
  buildVatFiling, buildPayeFiling, buildSsnitFiling, buildWhtFiling,
} from "../lib/taxFilings.js";
import { postTransaction } from "../lib/ledger.js";

const router: IRouter = Router();

router.use(authenticate, authorize(["admin", "accountant"]));

const getActor = (req: any) => {
  const u = (req as any).user;
  return { id: u?.id ?? 0, name: u?.name ?? "admin" };
};

const filingTypes = ["vat_nhil_getfund", "paye", "ssnit", "wht"] as const;
type FilingType = typeof filingTypes[number];

/** Compute a draft filing (read-only, doesn't persist). */
async function buildDraft(type: FilingType, year: number, month: number) {
  switch (type) {
    case "vat_nhil_getfund": return buildVatFiling(year, month);
    case "paye":             return buildPayeFiling(year, month);
    case "ssnit":            return buildSsnitFiling(year, month);
    case "wht":              return buildWhtFiling(year, month);
  }
}

/** Map tax type → liability account_code that gets cleared on payment. */
const PAYABLE_ACCOUNT: Record<FilingType, string[]> = {
  vat_nhil_getfund: ["2200-VAT-PAYABLE", "2210-NHIL-PAYABLE", "2220-GETFUND-PAYABLE"],
  paye:             ["2240-PAYE-PAYABLE"],
  ssnit:            ["2250-SSNIT-PAYABLE"],
  wht:              ["2230-WHT-PAYABLE"],
};

const PAID_FROM_BY_GL: Record<string, "cash" | "momo-mtn" | "momo-telecel" | "momo-at" | "bank"> = {
  "1100-CASH": "cash",
  "1110-MOMO-MTN": "momo-mtn",
  "1111-MOMO-TELECEL": "momo-telecel",
  "1112-MOMO-AT": "momo-at",
  "1200-BANK": "bank",
};

// GET /tax-filings — list with filters
router.get("/", async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const filters: any[] = [];
    if (type && filingTypes.includes(type as any)) filters.push(eq(taxFilingsTable.type, type));
    if (status) filters.push(eq(taxFilingsTable.status, status));
    if (year) filters.push(eq(taxFilingsTable.periodYear, year));
    const rows = await db.select().from(taxFilingsTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(taxFilingsTable.periodYear), desc(taxFilingsTable.periodMonth), desc(taxFilingsTable.id))
      .limit(200);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /tax-filings/draft?type=...&year=...&month=... — live computed draft (no persistence)
router.get("/draft", async (req, res) => {
  try {
    const type = req.query.type as FilingType;
    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string);
    if (!filingTypes.includes(type) || !Number.isFinite(year) || !Number.isFinite(month)) {
      res.status(400).json({ error: "bad_request", message: "type, year, month required" });
      return;
    }
    res.json(await buildDraft(type, year, month));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// POST /tax-filings — save a draft (persist computed values)
const createSchema = z.object({
  type: z.enum(filingTypes),
  periodYear: z.number(),
  periodMonth: z.number().min(1).max(12),
  computedAmounts: z.record(z.string(), z.any()).optional(),
  amountPayable: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional().nullable(),
});

router.post("/", async (req, res) => {
  try {
    const body = createSchema.parse(req.body);
    const actor = getActor(req);
    // If the caller didn't pass computedAmounts, generate them
    let computed = body.computedAmounts as any;
    let payable = body.amountPayable !== undefined ? Number(body.amountPayable) : 0;
    if (!computed) {
      const draft = await buildDraft(body.type, body.periodYear, body.periodMonth);
      computed = draft;
      payable = draft.amountPayable;
    }
    const [created] = await db.insert(taxFilingsTable).values({
      type: body.type,
      periodYear: body.periodYear,
      periodMonth: body.periodMonth,
      computedAmounts: computed,
      amountPayable: payable.toFixed(2),
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

// PATCH /tax-filings/:id — update editable fields while in draft
const patchSchema = z.object({
  computedAmounts: z.record(z.string(), z.any()).optional(),
  amountPayable: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional().nullable(),
  filingReference: z.string().optional().nullable(),
  graReceiptNumber: z.string().optional().nullable(),
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = patchSchema.parse(req.body);
    const [existing] = await db.select().from(taxFilingsTable).where(eq(taxFilingsTable.id, id));
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    if (existing.status === "paid" || existing.status === "cancelled") {
      res.status(400).json({ error: "bad_request", message: `Cannot edit a ${existing.status} filing.` });
      return;
    }
    const update: any = { updatedAt: new Date() };
    if (body.computedAmounts !== undefined) update.computedAmounts = body.computedAmounts;
    if (body.amountPayable !== undefined) update.amountPayable = Number(body.amountPayable).toFixed(2);
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.filingReference !== undefined) update.filingReference = body.filingReference;
    if (body.graReceiptNumber !== undefined) update.graReceiptNumber = body.graReceiptNumber;
    const [updated] = await db.update(taxFilingsTable).set(update).where(eq(taxFilingsTable.id, id)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// POST /tax-filings/:id/mark-filed — body: { filingReference?, graReceiptNumber? }
const markFiledSchema = z.object({
  filingReference: z.string().optional().nullable(),
  graReceiptNumber: z.string().optional().nullable(),
});

router.post("/:id/mark-filed", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = markFiledSchema.parse(req.body);
    const actor = getActor(req);
    const [filing] = await db.select().from(taxFilingsTable).where(eq(taxFilingsTable.id, id));
    if (!filing) { res.status(404).json({ error: "not_found" }); return; }
    if (filing.status !== "draft") {
      res.status(400).json({ error: "bad_request", message: `Cannot mark ${filing.status} filing as filed.` });
      return;
    }
    const [updated] = await db.update(taxFilingsTable).set({
      status: "filed",
      filedAt: new Date(),
      filedBy: actor.id,
      filedByName: actor.name,
      filingReference: body.filingReference ?? filing.filingReference,
      graReceiptNumber: body.graReceiptNumber ?? filing.graReceiptNumber,
      updatedAt: new Date(),
    }).where(eq(taxFilingsTable.id, id)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// POST /tax-filings/:id/mark-paid — body: { paidFromBankAccountId, amountPaid? }
// Posts a tax_remittance ledger entry: DR each payable account by its share,
// CR the cash channel by the total.
const markPaidSchema = z.object({
  paidFromBankAccountId: z.number(),
  amountPaid: z.union([z.number(), z.string()]).optional(),
  graReceiptNumber: z.string().optional().nullable(),
});

router.post("/:id/mark-paid", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = markPaidSchema.parse(req.body);
    const actor = getActor(req);

    const [filing] = await db.select().from(taxFilingsTable).where(eq(taxFilingsTable.id, id));
    if (!filing) { res.status(404).json({ error: "not_found" }); return; }
    if (filing.status !== "filed" && filing.status !== "draft") {
      res.status(400).json({ error: "bad_request", message: `Cannot mark ${filing.status} filing as paid.` });
      return;
    }

    const [bank] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, body.paidFromBankAccountId));
    if (!bank) { res.status(400).json({ error: "bad_request", message: "Bank account not found" }); return; }
    const cashAccountCode = bank.glAccountCode;

    const total = Number(body.amountPaid ?? filing.amountPayable);
    if (total <= 0) {
      res.status(400).json({ error: "bad_request", message: "Amount must be positive" });
      return;
    }

    // Build the journal lines:
    // For VAT/NHIL/GETFund the breakdown lives in computed_amounts.net.{vat,nhil,getfund}.
    // For PAYE/SSNIT/WHT it's a single payable account.
    const debitLines: { accountCode: string; debit: number }[] = [];
    if (filing.type === "vat_nhil_getfund") {
      const ca = filing.computedAmounts as any;
      const v = Number(ca?.net?.vat ?? 0);
      const n = Number(ca?.net?.nhil ?? 0);
      const g = Number(ca?.net?.getfund ?? 0);
      const computedTotal = v + n + g;
      // Scale each portion proportionally so total matches `total` (handles overrides + rounding).
      const scale = computedTotal > 0 ? total / computedTotal : 0;
      if (v > 0) debitLines.push({ accountCode: "2200-VAT-PAYABLE",     debit: Math.round(v * scale * 100) / 100 });
      if (n > 0) debitLines.push({ accountCode: "2210-NHIL-PAYABLE",    debit: Math.round(n * scale * 100) / 100 });
      if (g > 0) debitLines.push({ accountCode: "2220-GETFUND-PAYABLE", debit: Math.round(g * scale * 100) / 100 });
    } else {
      const code = PAYABLE_ACCOUNT[filing.type as FilingType][0];
      debitLines.push({ accountCode: code, debit: total });
    }

    // Reconcile rounding: ensure debits sum exactly to total. Adjust the largest line if needed.
    const debitSum = Math.round(debitLines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
    const drift = Math.round((total - debitSum) * 100) / 100;
    if (Math.abs(drift) > 0 && debitLines.length > 0) {
      let largest = debitLines[0];
      for (const l of debitLines) if (l.debit > largest.debit) largest = l;
      largest.debit = Math.round((largest.debit + drift) * 100) / 100;
    }

    const lines = [
      ...debitLines,
      { accountCode: cashAccountCode, credit: total },
    ];

    const posted = await postTransaction({
      lines,
      sourceType: "tax_remittance",
      sourceId: filing.id,
      postedAt: new Date(),
      description: `${filing.type.replace(/_/g, " ").toUpperCase()} remittance — ${filing.periodYear}-${String(filing.periodMonth).padStart(2, "0")}`,
      meta: {
        filingId: filing.id,
        type: filing.type,
        periodYear: filing.periodYear,
        periodMonth: filing.periodMonth,
        graReceiptNumber: body.graReceiptNumber ?? filing.graReceiptNumber,
      },
      createdBy: actor.name,
    });

    const [updated] = await db.update(taxFilingsTable).set({
      status: "paid",
      paidAt: new Date(),
      paidBy: actor.id,
      paidByName: actor.name,
      paidFromBankAccountId: body.paidFromBankAccountId,
      remittanceTransactionId: posted.transactionId,
      amountPaid: total.toFixed(2),
      graReceiptNumber: body.graReceiptNumber ?? filing.graReceiptNumber,
      updatedAt: new Date(),
    }).where(eq(taxFilingsTable.id, id)).returning();

    res.json({ filing: updated, transactionId: posted.transactionId });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// POST /tax-filings/:id/cancel — soft cancel a draft/filed (allows re-filing)
router.post("/:id/cancel", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [filing] = await db.select().from(taxFilingsTable).where(eq(taxFilingsTable.id, id));
    if (!filing) { res.status(404).json({ error: "not_found" }); return; }
    if (filing.status === "paid") {
      res.status(400).json({ error: "bad_request", message: "Cannot cancel a paid filing — would orphan its remittance journal. Post a corrective entry instead." });
      return;
    }
    const [updated] = await db.update(taxFilingsTable).set({
      status: "cancelled",
      updatedAt: new Date(),
    }).where(eq(taxFilingsTable.id, id)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
