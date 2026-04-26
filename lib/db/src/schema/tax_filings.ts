import { pgTable, serial, integer, text, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Tax filings — GRA returns (VAT/NHIL/GETFund, PAYE, SSNIT, WHT).
 *
 * Each row represents one filing for a specific tax type and period
 * (year + month). The `computed_amounts` jsonb holds the per-line breakdown
 * the filing builder produced; accountants can override individual numbers
 * via the admin UI before marking the filing as `filed`.
 *
 * Status flow:
 *   draft  — computed, may still be edited
 *   filed  — submitted to GRA (filing reference captured)
 *   paid   — payment to GRA settled; auto-posts a tax_remittance ledger
 *            entry that clears the relevant payable account (2200/2210/
 *            2220/2230/2240/2250).
 *
 * The `(type, period_year, period_month)` combo is unique among non-cancelled
 * rows so we don't accidentally maintain two drafts for the same period.
 */
export const taxFilingTypes = ["vat_nhil_getfund", "paye", "ssnit", "wht"] as const;
export type TaxFilingType = typeof taxFilingTypes[number];

export const taxFilingStatuses = ["draft", "filed", "paid", "cancelled"] as const;
export type TaxFilingStatus = typeof taxFilingStatuses[number];

export const taxFilingsTable = pgTable("tax_filings", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // taxFilingTypes
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(), // 1..12

  // Computed breakdown (e.g. {vat: 1234.56, nhil: 308, getfund: 308, output: ..., input: ..., net: ...}).
  computedAmounts: jsonb("computed_amounts").$type<Record<string, unknown>>().notNull().default({}),
  amountPayable: numeric("amount_payable", { precision: 14, scale: 2 }).notNull().default("0.00"),
  amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0.00"),

  status: text("status").notNull().default("draft"), // taxFilingStatuses

  // GRA filing details
  filingReference: text("filing_reference"),
  graReceiptNumber: text("gra_receipt_number"),

  filedAt: timestamp("filed_at"),
  filedBy: integer("filed_by"),
  filedByName: text("filed_by_name"),
  paidAt: timestamp("paid_at"),
  paidBy: integer("paid_by"),
  paidByName: text("paid_by_name"),
  paidFromBankAccountId: integer("paid_from_bank_account_id"),
  remittanceTransactionId: text("remittance_transaction_id"),

  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTaxFilingSchema = createInsertSchema(taxFilingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  filedAt: true,
  filedBy: true,
  filedByName: true,
  paidAt: true,
  paidBy: true,
  paidByName: true,
  remittanceTransactionId: true,
});
export type InsertTaxFiling = z.infer<typeof insertTaxFilingSchema>;
export type TaxFiling = typeof taxFilingsTable.$inferSelect;
