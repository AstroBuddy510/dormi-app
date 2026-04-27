import { pgTable, serial, numeric, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const financeSettingsTable = pgTable("finance_settings", {
  id: serial("id").primaryKey(),
  vendorCommissionPercent: numeric("vendor_commission_percent", { precision: 5, scale: 2 }).notNull().default("5.00"),
  riderCommissionPercent: numeric("rider_commission_percent", { precision: 5, scale: 2 }).notNull().default("20.00"),
  courierCommissionFixed: numeric("courier_commission_fixed", { precision: 10, scale: 2 }).notNull().default("10.00"),
  distanceRateCedisPerKm: numeric("distance_rate_cedis_per_km", { precision: 10, scale: 2 }).notNull().default("5.00"),
  distanceThresholdKm: numeric("distance_threshold_km", { precision: 5, scale: 2 }).notNull().default("5.00"),
  accountantPin: text("accountant_pin"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFinanceSettingsSchema = createInsertSchema(financeSettingsTable).omit({ id: true, updatedAt: true });
export type InsertFinanceSettings = z.infer<typeof insertFinanceSettingsSchema>;
export type FinanceSettings = typeof financeSettingsTable.$inferSelect;
