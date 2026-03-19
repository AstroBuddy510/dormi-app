import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const paymentGatewayTable = pgTable("payment_gateway_settings", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("paystack"),
  publicKey: text("public_key").notNull().default(""),
  secretKey: text("secret_key").notNull().default(""),
  mode: text("mode").notNull().default("test"),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PaymentGateway = typeof paymentGatewayTable.$inferSelect;
