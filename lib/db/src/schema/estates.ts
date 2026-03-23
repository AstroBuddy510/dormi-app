import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const estatesTable = pgTable("estates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Estate = typeof estatesTable.$inferSelect;
