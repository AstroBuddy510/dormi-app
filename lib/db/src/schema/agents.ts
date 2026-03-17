import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  pin: text("pin"),
  photoUrl: text("photo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Agent = typeof agentsTable.$inferSelect;
