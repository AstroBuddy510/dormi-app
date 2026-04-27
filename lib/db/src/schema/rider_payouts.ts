import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ridersTable } from "./riders.js";

/**
 * Payout requests from independent riders. Mirrors vendor `payouts` exactly.
 *
 * Snapshots the rider's currently-unpaid earnings (their share of delivery
 * fees, after the platform commission %) at the moment of request. Admin
 * reviews and marks paid once money has actually moved.
 *
 * Only Independent riders make payout requests. In-house riders are paid
 * via payroll and never appear here.
 */
export const riderPayoutsTable = pgTable("rider_payouts", {
  id: serial("id").primaryKey(),
  riderId: integer("rider_id").notNull().references(() => ridersTable.id),
  // Rider's net earnings for this payout (after platform commission)
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  // Portion from orders the customer paid via Paystack (held by the platform — owed to rider)
  paystackPortion: numeric("paystack_portion", { precision: 12, scale: 2 }).notNull(),
  // Portion from cash-on-delivery orders (rider already collected; included for reconciliation)
  cashPortion: numeric("cash_portion", { precision: 12, scale: 2 }).notNull(),
  orderCount: integer("order_count").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | paid
  notes: text("notes"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
});

export const insertRiderPayoutSchema = createInsertSchema(riderPayoutsTable).omit({
  id: true,
  requestedAt: true,
});
export type InsertRiderPayout = z.infer<typeof insertRiderPayoutSchema>;
export type RiderPayout = typeof riderPayoutsTable.$inferSelect;
