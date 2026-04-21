import { Router, type IRouter } from "express";
import { db } from "../../../lib/db/src/index.js";
import { floatIssuesTable, ridersTable } from "../../../lib/db/src/schema/index.js";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IssueFloatBody = z.object({
  riderId: z.number().int(),
  amount: z.number().min(0.01),
  issueDate: z.string().min(1),
  notes: z.string().optional(),
});

const ReconcileFloatBody = z.object({
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
});

router.get("/", async (_req, res) => {
  const issues = await db
    .select({
      float: floatIssuesTable,
      riderName: ridersTable.name,
      riderPhone: ridersTable.phone,
    })
    .from(floatIssuesTable)
    .leftJoin(ridersTable, eq(floatIssuesTable.riderId, ridersTable.id))
    .orderBy(floatIssuesTable.issueDate);
  res.json(issues.map(row => ({
    id: row.float.id,
    riderId: row.float.riderId,
    riderName: row.riderName,
    riderPhone: row.riderPhone,
    amount: parseFloat(row.float.amount),
    issueDate: row.float.issueDate,
    reconciled: row.float.reconciled,
    receiptUrl: row.float.receiptUrl,
    notes: row.float.notes,
    reconciledAt: row.float.reconciledAt?.toISOString() ?? null,
    createdAt: row.float.createdAt.toISOString(),
  })));
});

router.post("/", async (req, res) => {
  try {
    const body = IssueFloatBody.parse(req.body);
    const [issue] = await db.insert(floatIssuesTable).values({
      riderId: body.riderId,
      amount: body.amount.toString(),
      issueDate: body.issueDate,
      notes: body.notes,
      reconciled: false,
    }).returning();
    res.status(201).json({ id: issue.id, amount: parseFloat(issue.amount) });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/reconcile", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = ReconcileFloatBody.parse(req.body);
    const [issue] = await db
      .update(floatIssuesTable)
      .set({ reconciled: true, receiptUrl: body.receiptUrl, notes: body.notes, reconciledAt: new Date() })
      .where(eq(floatIssuesTable.id, id))
      .returning();
    if (!issue) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ ok: true, id: issue.id, reconciled: issue.reconciled });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
