/**
 * Backfill the double-entry ledger from existing data.
 *
 * Runs through every order, expense, payout, and payroll payment that
 * predates the ledger and posts the matching journal — so the financial
 * statements (Phase 5) can show history all the way back to inception.
 *
 * Idempotent: every helper checks (sourceType, sourceId) before posting,
 * so re-running will skip already-backfilled rows.
 *
 * Usage:
 *   pnpm -C artifacts/api-server tsx scripts/backfill-ledger.ts
 *   (or with npm: npx tsx scripts/backfill-ledger.ts)
 */
import { db } from "../../../lib/db/src/index.js";
import {
  ordersTable,
  expensesTable,
  payoutsTable,
  payrollPaymentsTable,
} from "../../../lib/db/src/schema/index.js";
import { eq } from "drizzle-orm";
import {
  postOrderPayment,
  postRiderEarning,
  postVendorPayout,
  postExpense,
  postPayrollAccrual,
  postPayrollDisbursement,
} from "../src/lib/ledger.js";

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

function ledgerPaidFromFor(method: string): "cash" | "momo-mtn" | "momo-telecel" | "momo-at" | "bank" {
  const m = method.toLowerCase();
  if (m.includes("cash")) return "cash";
  if (m.includes("mtn")) return "momo-mtn";
  if (m.includes("telecel") || m.includes("vodafone")) return "momo-telecel";
  if (m.includes("airtel") || m.includes("tigo") || m === "at") return "momo-at";
  return "bank";
}

async function backfillOrders() {
  console.log("\n🛒 Backfilling orders…");
  const rows = await db.select().from(ordersTable);
  let posted = 0, skipped = 0;
  for (const order of rows) {
    // 1. Order payment journal — only if customer has actually paid.
    if (order.paymentStatus === "paid") {
      const isPaystack = order.paymentMethod === "paystack";
      try {
        const result = await postOrderPayment({
          orderId: order.id,
          subtotal: parseFloat(order.subtotal),
          serviceFee: parseFloat(order.serviceFee),
          deliveryFee: parseFloat(order.deliveryFee),
          vatAmount: parseFloat(order.vatAmount),
          nhilAmount: parseFloat(order.nhilAmount),
          getfundAmount: parseFloat(order.getfundAmount),
          receivedInto: isPaystack ? "paystack" : "cash",
          postedAt: order.deliveredAt ?? order.createdAt,
          createdBy: "backfill",
        });
        if (result.alreadyPosted) skipped++; else posted++;
      } catch (e) {
        console.error(`  ✘ order #${order.id} payment journal failed:`, (e as Error).message);
      }
    }
    // 2. Rider earning journal — on delivered orders with assigned rider.
    if (order.status === "delivered" && order.riderId) {
      try {
        const result = await postRiderEarning({
          orderId: order.id,
          riderId: order.riderId,
          amount: parseFloat(order.deliveryFee),
          postedAt: order.deliveredAt ?? order.createdAt,
          createdBy: "backfill",
        });
        if (result?.alreadyPosted) skipped++; else if (result) posted++;
      } catch (e) {
        console.error(`  ✘ order #${order.id} rider earning failed:`, (e as Error).message);
      }
    }
  }
  console.log(`  → posted ${posted}, skipped (already-posted) ${skipped}`);
}

async function backfillExpenses() {
  console.log("\n💸 Backfilling expenses…");
  const rows = await db.select().from(expensesTable);
  let posted = 0, skipped = 0;
  for (const e of rows) {
    try {
      const result = await postExpense({
        expenseId: e.id,
        expenseAccountCode: expenseAccountFor(e.category, e.type),
        amount: parseFloat(e.amount),
        paidFrom: "bank",
        postedAt: new Date(e.expenseDate),
        description: `${e.type}${e.notes ? ` — ${e.notes}` : ""}`,
        createdBy: "backfill",
      });
      if (result.alreadyPosted) skipped++; else posted++;
    } catch (err) {
      console.error(`  ✘ expense #${e.id} failed:`, (err as Error).message);
    }
  }
  console.log(`  → posted ${posted}, skipped ${skipped}`);
}

async function backfillPayouts() {
  console.log("\n🏪 Backfilling vendor payouts (paid only)…");
  const rows = await db.select().from(payoutsTable).where(eq(payoutsTable.status, "paid"));
  let posted = 0, skipped = 0;
  for (const p of rows) {
    try {
      const result = await postVendorPayout({
        payoutId: p.id,
        vendorId: p.vendorId,
        amount: parseFloat(p.totalAmount ?? "0"),
        paidFrom: "bank",
        postedAt: p.paidAt ?? p.requestedAt,
        createdBy: "backfill",
      });
      if (result.alreadyPosted) skipped++; else posted++;
    } catch (err) {
      console.error(`  ✘ payout #${p.id} failed:`, (err as Error).message);
    }
  }
  console.log(`  → posted ${posted}, skipped ${skipped}`);
}

async function backfillPayroll() {
  console.log("\n💼 Backfilling payroll payments…");
  const rows = await db.select().from(payrollPaymentsTable);
  let posted = 0, skipped = 0;
  for (const p of rows) {
    try {
      const accrual = await postPayrollAccrual({
        payrollId: p.id,
        amount: parseFloat(p.amount),
        postedAt: p.paidAt,
        createdBy: "backfill",
      });
      const disb = await postPayrollDisbursement({
        payrollPaymentId: p.id,
        amount: parseFloat(p.amount),
        paidFrom: ledgerPaidFromFor(p.paymentMethod),
        postedAt: p.paidAt,
        createdBy: "backfill",
      });
      if (accrual.alreadyPosted && disb.alreadyPosted) skipped++; else posted++;
    } catch (err) {
      console.error(`  ✘ payroll #${p.id} failed:`, (err as Error).message);
    }
  }
  console.log(`  → posted ${posted}, skipped ${skipped}`);
}

async function main() {
  console.log("🧾 Ledger backfill starting…");
  const t0 = Date.now();
  await backfillOrders();
  await backfillExpenses();
  await backfillPayouts();
  await backfillPayroll();
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Backfill complete in ${dt}s`);
  process.exit(0);
}

main().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
