import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Audit log — append-only record of every notable action across the platform.
 *
 * Two pathways write to this table:
 *
 *   1. Application code — explicit `writeAudit(...)` calls from API routes
 *      that capture richer business context (reason text, related entity ids,
 *      ip / user-agent). This is the preferred path for user-driven events.
 *
 *   2. PostgreSQL triggers — the migration installs AFTER triggers on the
 *      money-event source tables (orders, expenses, payouts, payroll_payments,
 *      tax_settings) that always fire, even when changes happen via raw SQL,
 *      backfill scripts, or a buggy API path. Attribution is read from
 *      session vars (`app.current_user_id` / `_role` / `_name`) which the
 *      authenticate middleware sets per-request.
 */

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userRole: text("user_role"),
  userName: text("user_name"),
  userPhone: text("user_phone"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
  afterState: jsonb("after_state").$type<Record<string, unknown> | null>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({ id: true, occurredAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
