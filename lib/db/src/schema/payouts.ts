import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors.js";

// A payout request from a vendor. Snapshots the vendor's currently-unpaid
// delivered-order earnings at the moment of request. Admin reviews and
// marks as "paid" once money has actually moved (Paystack transfer + cash
// commission reconciled with the vendor).
export const payoutsTable = pgTable("payouts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id),
  // Vendor's net earnings for this payout (after commission)
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  // Portion from orders paid via Paystack — platform owes vendor this in cash
  paystackPortion: numeric("paystack_portion", { precision: 12, scale: 2 }).notNull(),
  // Portion from orders paid via cash-on-delivery — vendor already has the
  // cash, listed here for reconciliation/visibility
  cashPortion: numeric("cash_portion", { precision: 12, scale: 2 }).notNull(),
  orderCount: integer("order_count").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | paid
  notes: text("notes"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
});

export const insertPayoutSchema = createInsertSchema(payoutsTable).omit({
  id: true,
  requestedAt: true,
});
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type Payout = typeof payoutsTable.$inferSelect;
