import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { residentsTable } from "./residents.js";

export const itemRequestsTable = pgTable("item_requests", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").references(() => residentsTable.id),
  residentName: text("resident_name").notNull().default(""),
  itemName: text("item_name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ItemRequest = typeof itemRequestsTable.$inferSelect;
