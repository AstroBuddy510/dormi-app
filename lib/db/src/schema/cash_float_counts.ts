import { pgTable, serial, text, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Cash float counts — physical cash count submissions.
 *
 * One row per (bank_account_id, count_date) where bank_account.type = 'cash_float'.
 * `expectedBalance` comes from the ledger at the time of submission (sum of
 * debits - credits posted to the float's gl_account_code through count_date).
 * `declaredBalance` is what the rider/agent/office actually has on hand.
 * `discrepancy = declared - expected`. Negative = shortage (cash missing),
 * positive = surplus (extra cash).
 *
 * If a discrepancy is non-zero AND the admin elects to post-and-close, we
 * write an adjustment ledger transaction on submission:
 *   shortage → DR 6900-CASH-SHORT-OVER, CR <float gl_account>
 *   surplus  → DR <float gl_account>, CR 6900-CASH-SHORT-OVER
 * `adjustmentTransactionId` links to that ledger uuid.
 */
export const cashFloatCountStatuses = ["submitted", "posted", "voided"] as const;
export type CashFloatCountStatus = typeof cashFloatCountStatuses[number];

export const cashFloatCountsTable = pgTable("cash_float_counts", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  countDate: date("count_date").notNull(),

  expectedBalance: numeric("expected_balance", { precision: 14, scale: 2 }).notNull(),
  declaredBalance: numeric("declared_balance", { precision: 14, scale: 2 }).notNull(),
  discrepancy: numeric("discrepancy", { precision: 14, scale: 2 }).notNull(),

  status: text("status").notNull().default("submitted"), // cashFloatCountStatuses
  reason: text("reason"),
  adjustmentTransactionId: text("adjustment_transaction_id"), // uuid

  submittedBy: integer("submitted_by").notNull(),
  submittedByName: text("submitted_by_name").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export const insertCashFloatCountSchema = createInsertSchema(cashFloatCountsTable).omit({
  id: true,
  submittedAt: true,
});
export type InsertCashFloatCount = z.infer<typeof insertCashFloatCountSchema>;
export type CashFloatCount = typeof cashFloatCountsTable.$inferSelect;
