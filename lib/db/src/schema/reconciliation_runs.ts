import { pgTable, serial, text, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Reconciliation runs — formal close of a period for one bank_account.
 *
 * Stored as immutable history: a completed run cannot be edited; if the
 * numbers were wrong, post a corrective run for the same period that
 * supersedes the prior one (latest by completedAt wins for display).
 *
 * `closingPerStatement` is the closing balance per the imported statement.
 * `closingPerLedger` is what our ledger says the bank_account's gl_account_code
 * holds at periodEnd. `difference = perStatement - perLedger`. Zero means
 * fully reconciled. Non-zero means residual unmatched lines or unbooked
 * transactions — admin records the explanation in `notes`.
 */
export const runStatuses = ["draft", "completed"] as const;
export type RunStatus = typeof runStatuses[number];

export const reconciliationRunsTable = pgTable("reconciliation_runs", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),

  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  closingPerStatement: numeric("closing_per_statement", { precision: 14, scale: 2 }).notNull(),
  closingPerLedger: numeric("closing_per_ledger", { precision: 14, scale: 2 }).notNull(),
  difference: numeric("difference", { precision: 14, scale: 2 }).notNull(),

  matchedCount: integer("matched_count").notNull().default(0),
  unmatchedCount: integer("unmatched_count").notNull().default(0),

  status: text("status").notNull().default("draft"), // runStatuses
  notes: text("notes"),

  createdBy: integer("created_by").notNull(),
  createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedBy: integer("completed_by"),
  completedByName: text("completed_by_name"),
  completedAt: timestamp("completed_at"),
});

export const insertReconciliationRunSchema = createInsertSchema(reconciliationRunsTable).omit({
  id: true,
  createdAt: true,
  completedBy: true,
  completedByName: true,
  completedAt: true,
});
export type InsertReconciliationRun = z.infer<typeof insertReconciliationRunSchema>;
export type ReconciliationRun = typeof reconciliationRunsTable.$inferSelect;
