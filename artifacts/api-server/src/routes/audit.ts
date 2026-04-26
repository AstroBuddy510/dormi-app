import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { auditLogTable } from "../../../../lib/db/src/schema/index.js";
import { and, eq, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { authenticate, authorize } from "../middlewares/auth.js";

const router: IRouter = Router();

// All audit endpoints are admin-only.
router.use(authenticate, authorize(["admin"]));

// GET /audit/log — paginated, filterable list
router.get("/log", async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) ?? "100"), 500);
    const offset = parseInt((req.query.offset as string) ?? "0");
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const action = req.query.action as string | undefined;
    const entityType = req.query.entityType as string | undefined;
    const entityId = req.query.entityId as string | undefined;
    const fromRaw = req.query.from as string | undefined;
    const toRaw = req.query.to as string | undefined;

    const conditions: any[] = [];
    if (userId !== undefined && !Number.isNaN(userId)) conditions.push(eq(auditLogTable.userId, userId));
    if (action) {
      // Allow comma-separated list of actions
      const actions = action.split(",").map(s => s.trim()).filter(Boolean);
      if (actions.length === 1) conditions.push(eq(auditLogTable.action, actions[0]));
      else if (actions.length > 1) conditions.push(inArray(auditLogTable.action, actions));
    }
    if (entityType) conditions.push(eq(auditLogTable.entityType, entityType));
    if (entityId) conditions.push(eq(auditLogTable.entityId, entityId));
    if (fromRaw) conditions.push(gte(auditLogTable.occurredAt, new Date(fromRaw)));
    if (toRaw) conditions.push(lte(auditLogTable.occurredAt, new Date(toRaw)));

    const whereExpr = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(auditLogTable)
      .where(whereExpr)
      .orderBy(desc(auditLogTable.occurredAt), desc(auditLogTable.id))
      .limit(limit)
      .offset(offset);

    const totalRow = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(auditLogTable)
      .where(whereExpr);

    res.json({
      total: totalRow[0]?.count ?? 0,
      limit,
      offset,
      entries: rows.map(r => ({
        id: r.id,
        userId: r.userId,
        userRole: r.userRole,
        userName: r.userName,
        userPhone: r.userPhone,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        beforeState: r.beforeState,
        afterState: r.afterState,
        metadata: r.metadata ?? {},
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        occurredAt: r.occurredAt.toISOString(),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /audit/journal/:transactionId — trail for a specific ledger journal
router.get("/journal/:transactionId", async (req, res) => {
  try {
    const tx = req.params.transactionId;
    const rows = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entityType, "ledger_journal"), eq(auditLogTable.entityId, tx)))
      .orderBy(desc(auditLogTable.occurredAt), desc(auditLogTable.id));

    res.json({
      transactionId: tx,
      entries: rows.map(r => ({
        id: r.id,
        userId: r.userId,
        userRole: r.userRole,
        userName: r.userName,
        action: r.action,
        beforeState: r.beforeState,
        afterState: r.afterState,
        metadata: r.metadata ?? {},
        occurredAt: r.occurredAt.toISOString(),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /audit/actions — list of distinct action names for filter dropdown
router.get("/actions", async (_req, res) => {
  try {
    const rows = await db
      .select({ action: auditLogTable.action })
      .from(auditLogTable)
      .groupBy(auditLogTable.action)
      .orderBy(auditLogTable.action);
    res.json(rows.map(r => r.action));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

export default router;
