import { pgTable, serial, text, integer, numeric, timestamp, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Bank statement lines — every line of every imported statement.
 *
 * Source can be a CSV upload, a Paystack API sync, or a manual entry. The
 * raw payload is preserved as jsonb so we can re-derive fields if our parser
 * mapping changes.
 *
 * `matchStatus` flow:
 *   'unmatched'  — fresh import, no decision yet
 *   'matched'    — linked to a specific ledger_entry / source event
 *   'expense'    — admin classified as a new expense (auto-created)
 *   'income'     — admin classified as miscellaneous income
 *   'ignored'    — admin marked as not relevant (e.g. duplicate, internal transfer already booked)
 *
 * `matchedTransactionId` is the uuid from ledger_entries.transaction_id that
 * this line reconciles against. We store both that and the original source
 * pointer (orders.id, expenses.id, etc.) so drill-downs work both ways.
 */
export const matchStatuses = ["unmatched", "matched", "expense", "income", "ignored"] as const;
export type MatchStatus = typeof matchStatuses[number];

export const statementLineSources = ["csv", "paystack_api", "manual"] as const;
export type StatementLineSource = typeof statementLineSources[number];

export const bankStatementLinesTable = pgTable("bank_statement_lines", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  importId: integer("import_id"), // FK to bank_statement_imports.id, nullable for manual

  statementDate: date("statement_date").notNull(),
  valueDate: date("value_date"),
  description: text("description").notNull(),
  reference: text("reference"),
  /** Signed amount: positive = inflow (credit to bank), negative = outflow (debit from bank). */
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  runningBalance: numeric("running_balance", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("GHS"),

  source: text("source").notNull(), // statementLineSources
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().default({}),

  matchStatus: text("match_status").notNull().default("unmatched"), // matchStatuses
  matchedTransactionId: text("matched_transaction_id"), // uuid string of ledger_entries.transaction_id
  matchedSourceType: text("matched_source_type"),       // 'order' | 'payout' | 'expense' | 'payroll_payment' | etc.
  matchedSourceId: integer("matched_source_id"),
  matchedAt: timestamp("matched_at"),
  matchedBy: integer("matched_by"),
  matchedByName: text("matched_by_name"),
  matchNote: text("match_note"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBankStatementLineSchema = createInsertSchema(bankStatementLinesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBankStatementLine = z.infer<typeof insertBankStatementLineSchema>;
export type BankStatementLine = typeof bankStatementLinesTable.$inferSelect;
