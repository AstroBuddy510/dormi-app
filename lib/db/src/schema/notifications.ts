import { pgTable, serial, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { residentsTable } from './residents.js';

export const notificationsTable = pgTable('notifications', {
  id: serial('id').primaryKey(),
  residentId: integer('resident_id').references(() => residentsTable.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  type: varchar('type', { length: 50 }).notNull().default('info'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
