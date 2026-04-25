import { pgTable, serial, text, numeric, timestamp, integer, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Ledger entries — one row per LINE of a journal entry.
 *
 * Every business transaction (order paid, vendor payout, expense, etc.)
 * inserts at least 2 rows that share a `transactionId`. Each row is a single
 * debit OR credit against one account. The sum of debits MUST equal the sum
 * of credits per `transactionId` (validated by the posting helper, and a
 * future check on a materialised view).
 *
 * `sourceType` + `sourceId` form a stable foreign-key-by-convention back to
 * the originating row (orders.id, expenses.id, etc.). Combined with a partial
 * unique index, this makes the backfill script and re-runs safe (idempotent).
 */
export const ledgerSourceTypes = [
  "order_payment",
  "vendor_payout",
  "rider_earning",
  "rider_payout",
  "expense",
  "payroll_accrual",
  "payroll_disbursement",
  "bank_settlement",
  "tax_remittance",
  "manual",
] as const;
export type LedgerSourceType = typeof ledgerSourceTypes[number];

export const ledgerEntriesTable = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  transactionId: uuid("transaction_id").notNull(),
  accountCode: text("account_code").notNull(),
  debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0.00"),
  credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0.00"),
  currency: text("currency").notNull().default("GHS"),
  postedAt: timestamp("posted_at").notNull(),
  description: text("description"),
  sourceType: text("source_type").notNull(),
  sourceId: integer("source_id"), // nullable for manual entries
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  createdBy: text("created_by"), // user id / system label
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntriesTable).omit({ id: true, createdAt: true });
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;
