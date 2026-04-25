import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Chart of accounts — the master list of accounts every ledger entry posts to.
 *
 * `code` is the stable lookup key used by code paths (e.g. "1100-CASH",
 * "4100-SERVICE-REVENUE"). Names and descriptions can be edited in the UI;
 * codes never change.
 *
 * `type` follows standard accounting categorisation. `normalBalance` tells
 * the report builders which side increases the account: assets/expenses are
 * debit-normal, liabilities/equity/revenue are credit-normal.
 */
export const accountTypes = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type AccountType = typeof accountTypes[number];

export const chartOfAccountsTable = pgTable("chart_of_accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  normalBalance: text("normal_balance").notNull(), // 'debit' | 'credit'
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAccountSchema = createInsertSchema(chartOfAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof chartOfAccountsTable.$inferSelect;
