import { pgTable, serial, integer, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

/**
 * Single emoji reaction left on a message. Plain JSON shape so the
 * frontend can render reactions inline without a join.
 */
export type AgentMessageReaction = {
  emoji: string;
  by: 'agent' | 'resident';
  byName: string;
  at: string;          // ISO timestamp
};

export const agentMessagesTable = pgTable("agent_messages", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull(),
  agentId: integer("agent_id").notNull(),
  senderRole: text("sender_role").notNull().default('agent'),
  senderName: text("sender_name"),
  content: text("content").notNull(),
  reactions: jsonb("reactions").$type<AgentMessageReaction[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
});
