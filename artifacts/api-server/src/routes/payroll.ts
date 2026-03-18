import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { payrollPaymentsTable, employeesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const PayrollBody = z.object({
  employeeId: z.number().int(),
  amount: z.number().min(0.01),
  paymentMethod: z.string().default("Momo"),
  reference: z.string().optional(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  notes: z.string().optional(),
});

router.get("/", async (_req, res) => {
  const payments = await db
    .select({
      payment: payrollPaymentsTable,
      employeeName: employeesTable.name,
      employeeRole: employeesTable.role,
    })
    .from(payrollPaymentsTable)
    .leftJoin(employeesTable, eq(payrollPaymentsTable.employeeId, employeesTable.id))
    .orderBy(payrollPaymentsTable.paidAt);
  res.json(payments.map(row => ({
    id: row.payment.id,
    employeeId: row.payment.employeeId,
    employeeName: row.employeeName,
    employeeRole: row.employeeRole,
    amount: parseFloat(row.payment.amount),
    paymentMethod: row.payment.paymentMethod,
    reference: row.payment.reference,
    periodStart: row.payment.periodStart,
    periodEnd: row.payment.periodEnd,
    notes: row.payment.notes,
    paidAt: row.payment.paidAt.toISOString(),
  })));
});

router.post("/", async (req, res) => {
  try {
    const body = PayrollBody.parse(req.body);
    const [payment] = await db.insert(payrollPaymentsTable).values({
      employeeId: body.employeeId,
      amount: body.amount.toString(),
      paymentMethod: body.paymentMethod,
      reference: body.reference,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      notes: body.notes,
    }).returning();
    res.status(201).json({ id: payment.id, amount: parseFloat(payment.amount) });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
