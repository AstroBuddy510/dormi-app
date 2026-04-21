import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents.js";
import { residentsTable } from "./residents.js";

export const agentCallLogsTable = pgTable("agent_call_logs", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  residentId: integer("resident_id").references(() => residentsTable.id, { onDelete: "set null" }),
  residentName: text("resident_name").notNull(),
  residentPhone: text("resident_phone").notNull(),
  outcome: text("outcome").notNull().default("completed"),
  orderId: integer("order_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentScheduledCallsTable = pgTable("agent_scheduled_calls", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  residentId: integer("resident_id").references(() => residentsTable.id, { onDelete: "set null" }),
  residentName: text("resident_name").notNull(),
  residentPhone: text("resident_phone").notNull(),
  scheduledFor: text("scheduled_for"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentTempCallListTable = pgTable("agent_temp_call_list", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  residentId: integer("resident_id").references(() => residentsTable.id, { onDelete: "set null" }),
  residentName: text("resident_name").notNull(),
  residentPhone: text("resident_phone").notNull(),
  notes: text("notes"),
  isDone: integer("is_done").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
