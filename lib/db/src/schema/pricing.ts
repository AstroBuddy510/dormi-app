import { pgTable, serial, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pricingTable = pgTable("pricing", {
  id: serial("id").primaryKey(),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("30.00"),
  serviceMarkupPercent: numeric("service_markup_percent", { precision: 5, scale: 2 }).notNull().default("18.00"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPricingSchema = createInsertSchema(pricingTable).omit({ id: true, updatedAt: true });
export type InsertPricing = z.infer<typeof insertPricingSchema>;
export type Pricing = typeof pricingTable.$inferSelect;
