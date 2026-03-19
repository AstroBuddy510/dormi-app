import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';

export const riderMessagesTable = pgTable("rider_messages", {
  id: serial("id").primaryKey(),
  riderId: integer("rider_id").notNull(),
  senderRole: text("sender_role").notNull().default('rider'),
  senderName: text("sender_name"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
});
