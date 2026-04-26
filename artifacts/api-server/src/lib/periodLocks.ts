import { and, eq, lte, gte, desc, sql } from "drizzle-orm";
import { db } from "../../../../lib/db/src/index.js";
import { periodLocksTable } from "../../../../lib/db/src/schema/index.js";
import { writeAudit, type AuditAttribution } from "./audit.js";

/**
 * Period locks — closed accounting periods.
 *
 * The DB has a BEFORE INSERT trigger on `ledger_entries` that blocks any
 * post whose `posted_at` falls inside an active lock. These helpers give
 * the API a friendlier interface and ensure every lock / unlock is mirrored
 * into `audit_log` with reason + attribution.
 */

export interface LockPeriodInput extends AuditAttribution {
  periodStart: string; // ISO date 'YYYY-MM-DD'
  periodEnd: string;   // ISO date 'YYYY-MM-DD'
  reason?: string | null;
  lockedBy: number;
  lockedByName: string;
}

export interface UnlockPeriodInput extends AuditAttribution {
  lockId: number;
  reason?: string | null;
  unlockedBy: number;
  unlockedByName: string;
}

/** Returns the active lock that covers `date`, or null if no lock applies. */
export async function findActiveLockForDate(date: Date | string) {
  const isoDate = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(periodLocksTable)
    .where(
      and(
        eq(periodLocksTable.active, true),
        lte(periodLocksTable.periodStart, isoDate),
        gte(periodLocksTable.periodEnd, isoDate),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** True if `date` falls inside an active lock. */
export async function isPeriodLocked(date: Date | string): Promise<boolean> {
  return (await findActiveLockForDate(date)) != null;
}

/** Create a new active lock. Fails if any row already covers the same range. */
export async function lockPeriod(input: LockPeriodInput) {
  const [row] = await db
    .insert(periodLocksTable)
    .values({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lockedBy: input.lockedBy,
      lockedByName: input.lockedByName,
      lockReason: input.reason ?? null,
    })
    .returning();

  await writeAudit({
    userId: input.userId ?? input.lockedBy,
    userRole: input.userRole,
    userName: input.userName ?? input.lockedByName,
    userPhone: input.userPhone,
    action: "period_lock",
    entityType: "period_lock",
    entityId: row.id,
    after: {
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      reason: row.lockReason,
    },
    metadata: { lockedByName: input.lockedByName },
  });

  return row;
}

/** Flip an active lock to inactive, recording who/when/why. */
export async function unlockPeriod(input: UnlockPeriodInput) {
  const [existing] = await db.select().from(periodLocksTable).where(eq(periodLocksTable.id, input.lockId)).limit(1);
  if (!existing) throw new Error(`period_lock #${input.lockId} not found`);
  if (!existing.active) throw new Error(`period_lock #${input.lockId} is already inactive`);

  const [row] = await db
    .update(periodLocksTable)
    .set({
      active: false,
      unlockedBy: input.unlockedBy,
      unlockedByName: input.unlockedByName,
      unlockedAt: new Date(),
      unlockReason: input.reason ?? null,
    })
    .where(eq(periodLocksTable.id, input.lockId))
    .returning();

  await writeAudit({
    userId: input.userId ?? input.unlockedBy,
    userRole: input.userRole,
    userName: input.userName ?? input.unlockedByName,
    userPhone: input.userPhone,
    action: "period_unlock",
    entityType: "period_lock",
    entityId: row.id,
    before: {
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      lockedByName: existing.lockedByName,
      lockReason: existing.lockReason,
    },
    after: {
      unlockedByName: input.unlockedByName,
      reason: row.unlockReason,
    },
    metadata: {},
  });

  return row;
}

/** List locks (active or all). Most recent first. */
export async function listLocks(opts: { activeOnly?: boolean } = {}) {
  const where = opts.activeOnly ? eq(periodLocksTable.active, true) : undefined;
  return db
    .select()
    .from(periodLocksTable)
    .where(where)
    .orderBy(desc(periodLocksTable.lockedAt));
}

/** Count of active locks, mainly for UI badges. */
export async function activeLockCount(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(periodLocksTable)
    .where(eq(periodLocksTable.active, true));
  return count ?? 0;
}
