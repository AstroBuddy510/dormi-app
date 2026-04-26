import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Bank accounts — registry of every external money channel we reconcile.
 *
 * One row per bank account, MoMo wallet, Paystack settlement account, or
 * cash float. `glAccountCode` is the stable chart_of_accounts.code that this
 * channel posts to — e.g. "1300-PAYSTACK-RECV" for the Paystack channel,
 * "1110-MOMO-MTN" for an MTN MoMo wallet. The reconciler compares imported
 * statement lines against ledger_entries posted to this account_code.
 *
 * `ownerType` + `ownerId` are nullable; populated only for cash floats
 * attributed to an individual rider/agent. Office float / business bank
 * accounts leave them null.
 */
export const bankAccountTypes = ["paystack", "momo", "bank", "cash_float"] as const;
export type BankAccountType = typeof bankAccountTypes[number];

export const ownerTypes = ["rider", "agent", "office"] as const;
export type OwnerType = typeof ownerTypes[number];

export const bankAccountsTable = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // bankAccountTypes
  provider: text("provider"),    // 'MTN MoMo', 'GCB', 'Ecobank', 'Paystack', etc.
  accountNumber: text("account_number"),
  currency: text("currency").notNull().default("GHS"),
  glAccountCode: text("gl_account_code").notNull(),
  ownerType: text("owner_type"),  // 'rider' | 'agent' | 'office' | null
  ownerId: integer("owner_id"),    // FK by convention to riders/agents/employees
  ownerName: text("owner_name"),   // denormalised display name
  openingBalance: text("opening_balance").notNull().default("0.00"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBankAccountSchema = createInsertSchema(bankAccountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccountsTable.$inferSelect;
