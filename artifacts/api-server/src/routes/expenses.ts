import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { expensesTable } from "../../../../lib/db/src/schema/index.js";
import { eq, gte, lte, and } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

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
