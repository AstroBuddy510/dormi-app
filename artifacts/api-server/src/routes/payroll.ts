import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { payrollPaymentsTable, employeesTable } from "../../../../lib/db/src/schema/index.js";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { postPayrollAccrual, postPayrollDisbursement } from "../lib/ledger.js";

const router: IRouter = Router();

// Map free-text payment_method strings on payroll_payments to the receiving
// account in the ledger. Anything unrecognised → bank, since that's how most
// formal salary disbursements actually move.
function ledgerPaidFromFor(method: string): "cash" | "momo-mtn" | "momo-telecel" | "momo-at" | "bank" {
  const m = method.toLowerCase();
  if (m.includes("cash")) return "cash";
  if (m.includes("mtn")) return "momo-mtn";
  if (m.includes("telecel") || m.includes("vodafone")) return "momo-telecel";
  if (m.includes("airtel") || m.includes("tigo") || m === "at") return "momo-at";
  return "bank";
}

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

    // For now we treat each payroll payment as a single-step accrual+
    // disbursement on the same day: DR Salaries (expense), CR cash/bank/momo
    // directly. When we add a payroll_run aggregate we can split into proper
    // accrual + disbursement halves.
    try {
      await postPayrollDisbursement({
        payrollPaymentId: payment.id,
        amount: parseFloat(payment.amount),
        paidFrom: ledgerPaidFromFor(payment.paymentMethod),
        postedAt: payment.paidAt,
      });
      // Tracking the matching accrual (DR salaries / CR salaries payable)
      // immediately before disbursement keeps the salary expense visible
      // even before we model payroll runs separately.
      await postPayrollAccrual({
        payrollId: payment.id,
        amount: parseFloat(payment.amount),
        postedAt: payment.paidAt,
      });
    } catch (e) {
      console.error("[ledger] failed posting payroll", payment.id, e);
    }

    res.status(201).json({ id: payment.id, amount: parseFloat(payment.amount) });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
