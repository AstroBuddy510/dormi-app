import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';

export const vendorMessagesTable = pgTable("vendor_messages", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull(),
  senderRole: text("sender_role").notNull().default('vendor'),
  senderName: text("sender_name"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
});
