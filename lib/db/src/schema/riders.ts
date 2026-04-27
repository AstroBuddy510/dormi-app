import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * `type` distinguishes rider compensation models:
 *   'in_house'    — salaried employee. Platform keeps the FULL delivery fee
 *                   as revenue. Rider gets paid via payroll, not per-order.
 *   'independent' — gig worker. Platform takes the global rider commission
 *                   (finance_settings.rider_commission_percent) as revenue;
 *                   the remainder is owed to the rider and settled via the
 *                   rider_payouts flow. Default for new riders.
 */
export const riderTypes = ["in_house", "independent"] as const;
export type RiderType = typeof riderTypes[number];

export const ridersTable = pgTable("riders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  pin: text("pin"),
  type: text("type").notNull().default("independent"),
  isAvailable: boolean("is_available").notNull().default(true),
  photoUrl: text("photo_url"),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRiderSchema = createInsertSchema(ridersTable).omit({ id: true, createdAt: true });
export type InsertRider = z.infer<typeof insertRiderSchema>;
export type Rider = typeof ridersTable.$inferSelect;
