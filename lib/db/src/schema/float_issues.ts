import { pgTable, serial, integer, numeric, date, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ridersTable } from "./riders.js";

export const floatIssuesTable = pgTable("float_issues", {
  id: serial("id").primaryKey(),
  riderId: integer("rider_id").notNull().references(() => ridersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  issueDate: date("issue_date").notNull(),
  reconciled: boolean("reconciled").notNull().default(false),
  receiptUrl: text("receipt_url"),
  notes: text("notes"),
  reconciledAt: timestamp("reconciled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFloatIssueSchema = createInsertSchema(floatIssuesTable).omit({ id: true, createdAt: true, reconciledAt: true });
export type InsertFloatIssue = z.infer<typeof insertFloatIssueSchema>;
export type FloatIssue = typeof floatIssuesTable.$inferSelect;
