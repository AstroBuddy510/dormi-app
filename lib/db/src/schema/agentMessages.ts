import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';

export const agentMessagesTable = pgTable("agent_messages", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull(),
  agentId: integer("agent_id").notNull(),
  senderRole: text("sender_role").notNull().default('agent'),
  senderName: text("sender_name"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
});
