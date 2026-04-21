import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { ridersTable } from "./riders.js";

export const blockOrderGroupsTable = pgTable("block_order_groups", {
  id: serial("id").primaryKey(),
  batchNumber: text("batch_number"),
  name: text("name").notNull(),
  estate: text("estate").notNull(),
  status: text("status").notNull().default("collecting"),
  riderId: integer("rider_id").references(() => ridersTable.id),
  totalOrders: integer("total_orders").notNull().default(0),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  scheduledDate: timestamp("scheduled_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BlockOrderGroup = typeof blockOrderGroupsTable.$inferSelect;
