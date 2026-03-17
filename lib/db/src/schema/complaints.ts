import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { residentsTable } from "./residents";

export const complaintsTable = pgTable("complaints", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id),
  residentId: integer("resident_id").references(() => residentsTable.id),
  residentName: text("resident_name"),
  residentPhone: text("resident_phone"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Complaint = typeof complaintsTable.$inferSelect;
