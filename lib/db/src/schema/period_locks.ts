import { pgTable, serial, text, integer, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Period locks — closed accounting periods.
 *
 * When `active = true`, a DB trigger (see migration 0004) blocks any new
 * `ledger_entries` row whose `posted_at` falls inside the [period_start,
 * period_end] range. App code should also check `isPeriodLocked()` first to
 * raise a friendlier error before hitting the trigger fallback.
 *
 * Unlocks don't delete the row — they flip `active = false` and record
 * who/when/why on the same row, so the lock history is fully auditable.
 */

export const periodLocksTable = pgTable("period_locks", {
  id: serial("id").primaryKey(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  lockedBy: integer("locked_by").notNull(),
  lockedByName: text("locked_by_name").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  lockReason: text("lock_reason"),
  unlockedBy: integer("unlocked_by"),
  unlockedByName: text("unlocked_by_name"),
  unlockedAt: timestamp("unlocked_at"),
  unlockReason: text("unlock_reason"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPeriodLockSchema = createInsertSchema(periodLocksTable).omit({
  id: true,
  lockedAt: true,
  unlockedBy: true,
  unlockedByName: true,
  unlockedAt: true,
  unlockReason: true,
  active: true,
  createdAt: true,
});
export type InsertPeriodLock = z.infer<typeof insertPeriodLockSchema>;
export type PeriodLock = typeof periodLocksTable.$inferSelect;
