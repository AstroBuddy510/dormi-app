import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { deliveryZonesTable } from "./delivery_zones";

export const deliveryTownsTable = pgTable("delivery_towns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  zoneId: integer("zone_id").references(() => deliveryZonesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DeliveryTown = typeof deliveryTownsTable.$inferSelect;
