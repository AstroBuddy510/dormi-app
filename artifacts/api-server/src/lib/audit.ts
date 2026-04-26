import { sql } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import { auditLogTable } from "../../../../lib/db/src/schema/index.js";

/**
 * Application-level audit writer.
 *
 * The DB has triggers on the money-event source tables (orders, expenses,
 * payouts, payroll_payments, tax_settings) that auto-write audit_log rows
 * for INSERT / UPDATE / DELETE. Those triggers are the safety net.
 *
 * This helper is for the events the DB can't see by itself — logins, role
 * changes, period locks/unlocks, manual ledger postings — and for adding
 * richer context (reason text, ip, user-agent) when we already know it.
 */

export interface AuditAttribution {
  userId?: number | null;
  userRole?: string | null;
  userName?: string | null;
  userPhone?: string | null;
}

export interface WriteAuditInput extends AuditAttribution {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAudit(input: WriteAuditInput): Promise<void> {
  try {
    await db.insert(auditLogTable).values({
      userId: input.userId ?? null,
      userRole: input.userRole ?? "system",
      userName: input.userName ?? "system",
      userPhone: input.userPhone ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId == null ? null : String(input.entityId),
      beforeState: input.before ?? null,
      afterState: input.after ?? null,
      metadata: input.metadata ?? {},
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (err) {
    // Never let an audit failure abort the originating action — log and move on.
    // The DB triggers on the source tables are still our last line of defense.
    console.error("[audit] writeAudit failed:", err);
  }
}

/**
 * Set PostgreSQL session variables so DB triggers see who is acting.
 * Called by the authenticate middleware on every request that has a verified
 * JWT. Uses `is_local = true` so the setting only lasts for the current txn,
 * but with Neon's pooled connections this is effectively per-statement which
 * is good enough for trigger attribution.
 */
export async function setDbUserContext(user: {
  id?: number | string | null;
  role?: string | null;
  name?: string | null;
  phone?: string | null;
}): Promise<void> {
  try {
    const id = user.id == null ? "" : String(user.id);
    const role = user.role ?? "";
    const name = user.name ?? "";
    const phone = user.phone ?? "";
    // set_config(key, value, is_local). is_local=false so it persists across
    // statements in the same pool connection (Neon HTTP connections are
    // short-lived, so per-request set + clear is fine).
    await db.execute(sql`SELECT
      set_config('app.current_user_id', ${id}, false),
      set_config('app.current_user_role', ${role}, false),
      set_config('app.current_user_name', ${name}, false),
      set_config('app.current_user_phone', ${phone}, false)`);
  } catch (err) {
    // Don't block the request if session-var set fails; triggers will fall
    // back to 'system' attribution.
    console.error("[audit] setDbUserContext failed:", err);
  }
}

/** Convenience helper to extract attribution from an Express request user. */
export function attributionFromReq(req: any): AuditAttribution & { ipAddress?: string | null; userAgent?: string | null } {
  const u = (req?.user ?? {}) as { id?: number; role?: string; name?: string; phone?: string };
  return {
    userId: typeof u.id === "number" ? u.id : null,
    userRole: u.role ?? null,
    userName: u.name ?? null,
    userPhone: u.phone ?? null,
    ipAddress: (req?.ip ?? req?.headers?.["x-forwarded-for"] ?? null) as string | null,
    userAgent: (req?.headers?.["user-agent"] ?? null) as string | null,
  };
}
