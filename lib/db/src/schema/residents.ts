import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const residentsTable = pgTable("residents", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().unique(),
  estate: text("estate").notNull(),
  blockNumber: text("block_number").notNull(),
  houseNumber: text("house_number").notNull(),
  ghanaGpsAddress: text("ghana_gps_address"),
  subscribeWeekly: boolean("subscribe_weekly").notNull().default(false),
  subscriptionDay: text("subscription_day").default("Friday"),
  photoUrl: text("photo_url"),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertResidentSchema = createInsertSchema(residentsTable).omit({ id: true, createdAt: true });
export type InsertResident = z.infer<typeof insertResidentSchema>;
export type Resident = typeof residentsTable.$inferSelect;
