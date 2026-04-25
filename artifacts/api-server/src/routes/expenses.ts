import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { expensesTable } from "../../../../lib/db/src/schema/index.js";
import { eq, gte, lte, and } from "drizzle-orm";
import { z } from "zod/v4";
import { postExpense } from "../lib/ledger.js";

const router: IRouter = Router();

// Map expense category → chart-of-accounts code. Anything that doesn't
// match falls into "Other operating expense".
function expenseAccountFor(category: string, type?: string): string {
  const c = category.toLowerCase();
  const t = (type ?? "").toLowerCase();
  if (c.includes("rent") || t.includes("rent")) return "5400-RENT";
  if (c.includes("util") || t.includes("util") || t.includes("power") || t.includes("water") || t.includes("internet")) return "5410-UTILITIES";
  if (c.includes("market") || t.includes("market") || t.includes("ad") || t.includes("promo")) return "5420-MARKETING";
  if (c.includes("software") || c.includes("saas") || t.includes("subscription") || t.includes("hosting")) return "5430-SOFTWARE";
  if (c.includes("office") || c.includes("supply") || c.includes("supplies")) return "5440-OFFICE";
  if (c.includes("payroll") || c.includes("salar") || t.includes("salar")) return "5300-SALARIES";
  return "5900-OTHER-OPEX";
}

const ExpenseBody = z.object({
  type: z.string().min(1),
  category: z.string().default("operations"),
  amount: z.number().min(0.01),
  expenseDate: z.string().min(1),
  notes: z.string().optional(),
  photoUrl: z.string().optional(),
  createdByRole: z.string().default("accountant"),
});

router.get("/", async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const conditions = [];
  if (from) conditions.push(gte(expensesTable.expenseDate, from));
  if (to) conditions.push(lte(expensesTable.expenseDate, to));
  const expenses = conditions.length
    ? await db.select().from(expensesTable).where(and(...conditions)).orderBy(expensesTable.expenseDate)
    : await db.select().from(expensesTable).orderBy(expensesTable.expenseDate);
  res.json(expenses.map(mapExpense));
});

router.post("/", async (req, res) => {
  try {
    const body = ExpenseBody.parse(req.body);
    const [expense] = await db.insert(expensesTable).values({
      type: body.type,
      category: body.category,
      amount: body.amount.toString(),
      expenseDate: body.expenseDate,
      notes: body.notes,
      photoUrl: body.photoUrl,
      createdByRole: body.createdByRole,
    }).returning();

    // Post expense journal: DR <expense account> / CR Bank (default).
    // Defaulting to bank because most operating expenses are bank-paid;
    // admin can adjust via a manual journal entry if it was actually cash.
    try {
      await postExpense({
        expenseId: expense.id,
        expenseAccountCode: expenseAccountFor(expense.category, expense.type),
        amount: parseFloat(expense.amount),
        paidFrom: "bank",
        postedAt: new Date(expense.expenseDate),
        description: `${expense.type}${expense.notes ? ` — ${expense.notes}` : ""}`,
      });
    } catch (e) {
      console.error("[ledger] failed posting expense", expense.id, e);
    }

    res.status(201).json(mapExpense(expense));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  res.json({ ok: true });
});

function mapExpense(e: typeof expensesTable.$inferSelect) {
  return {
    id: e.id,
    type: e.type,
    category: e.category,
    amount: parseFloat(e.amount),
    expenseDate: e.expenseDate,
    notes: e.notes,
    photoUrl: e.photoUrl,
    createdByRole: e.createdByRole,
    createdAt: e.createdAt.toISOString(),
  };
}

export default router;
