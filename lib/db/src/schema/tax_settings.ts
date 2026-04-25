import { pgTable, serial, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Admin-controlled tax & levy settings.
 *
 * Each row is one tax line item (VAT, NHIL, GETFund, …) the admin can
 * independently enable / disable and adjust the rate of. Rates are stored
 * as a decimal fraction (e.g. 0.15 for 15%). All applied to the same base:
 * the platform revenue (service fee + delivery fee) per Ghana 2026 reforms.
 *
 * Default state: every tax row is INSERTED with `enabled = false` so
 * early customers are not burdened with taxes. Admin flips them on
 * individually as the business matures.
 */
export const taxSettingsTable = pgTable("tax_settings", {
  id: serial("id").primaryKey(),
  // Stable lookup key — never displayed, never editable. Used by code paths.
  code: text("code").notNull().unique(), // 'VAT', 'NHIL', 'GETFUND'
  // Display name shown in admin UI / receipts
  name: text("name").notNull(),
  // Decimal fraction. 0.15 means 15%.
  rate: numeric("rate", { precision: 6, scale: 4 }).notNull().default("0.0000"),
  // When true, this tax is applied to every new order.
  enabled: boolean("enabled").notNull().default(false),
  // Short user-facing description
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTaxSettingSchema = createInsertSchema(taxSettingsTable).omit({ id: true, updatedAt: true });
export type InsertTaxSetting = z.infer<typeof insertTaxSettingSchema>;
export type TaxSetting = typeof taxSettingsTable.$inferSelect;
