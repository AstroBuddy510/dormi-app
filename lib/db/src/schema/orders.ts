import { pgTable, text, serial, integer, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents.js";
import { vendorsTable } from "./vendors.js";
import { ridersTable } from "./riders.js";
import { blockOrderGroupsTable } from "./blockOrderGroups.js";
import { deliveryPartnersTable } from "./deliveryPartners.js";
import { agentsTable } from "./agents.js";
import { payoutsTable } from "./payouts.js";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  vendorId: integer("vendor_id").references(() => vendorsTable.id),
  riderId: integer("rider_id").references(() => ridersTable.id),
  agentId: integer("agent_id").references(() => agentsTable.id),
  orderType: text("order_type").notNull().default("single"),
  blockGroupId: integer("block_group_id").references(() => blockOrderGroupsTable.id),
  deliveryPartnerId: integer("delivery_partner_id").references(() => deliveryPartnersTable.id),
  isUrgent: boolean("is_urgent").notNull().default(false),
  items: jsonb("items").notNull().default([]),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  serviceFee: numeric("service_fee", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull(),
  // Tax breakdown — applied on (serviceFee + deliveryFee) when each tax is
  // enabled in tax_settings at order-creation time. Stored per-order so the
  // historical tax position is preserved even if rates/toggles change later.
  taxBase: numeric("tax_base", { precision: 10, scale: 2 }).notNull().default("0.00"),
  vatAmount: numeric("vat_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  nhilAmount: numeric("nhil_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  getfundAmount: numeric("getfund_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  paymentMethod: text("payment_method").notNull(),
  isSubscription: boolean("is_subscription").notNull().default(false),
  callOnly: boolean("call_only").notNull().default(false),
  callAccepted: boolean("call_accepted").notNull().default(false),
  riderAccepted: boolean("rider_accepted"),
  riderAcceptedAt: timestamp("rider_accepted_at"),
  pickedUpAt: timestamp("picked_up_at"),
  deliveredAt: timestamp("delivered_at"),
  photoUrl: text("photo_url"),
  deliveryPhotoUrl: text("delivery_photo_url"),
  pickupDeadline: timestamp("pickup_deadline"),
  eta: text("eta"),
  notes: text("notes"),
  paystackReference: text("paystack_reference"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  // Set when a vendor-payout is requested for this order. Prevents double-
  // inclusion of the same delivered order in multiple payout requests.
  vendorPayoutId: integer("vendor_payout_id").references(() => payoutsTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
