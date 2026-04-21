import { Router, type IRouter } from "express";
import { db } from "../../../lib/db/src/index.js";
import { agentsTable, ordersTable, agentCallLogsTable, agentScheduledCallsTable, agentTempCallListTable, agentMessagesTable } from "../../../lib/db/src/schema/index.js";
import { eq, and, desc, count } from "drizzle-orm";
import { createHash } from "crypto";

const router: IRouter = Router();

function hashPin(pin: string) {
  return createHash("sha256").update(pin).digest("hex");
}

function mapAgent(a: typeof agentsTable.$inferSelect) {
  return {
    id: a.id,
    name: a.name,
    phone: a.phone,
    photoUrl: a.photoUrl,
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/", async (_req, res) => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.createdAt);
  res.json(agents.map(mapAgent));
});

// ─── Agent overview for admin (all agents + aggregated stats) ─────────────────
router.get("/overview", async (_req, res) => {
  try {
    const agents = await db.select().from(agentsTable).orderBy(agentsTable.createdAt);

    const overview = await Promise.all(agents.map(async (agent) => {
      const [orderStats] = await db
        .select({ total: count() })
        .from(ordersTable)
        .where(eq(ordersTable.agentId, agent.id));

      const [callStats] = await db
        .select({ total: count() })
        .from(agentCallLogsTable)
        .where(eq(agentCallLogsTable.agentId, agent.id));

      const [msgStats] = await db
        .select({ total: count() })
        .from(agentMessagesTable)
        .where(and(
          eq(agentMessagesTable.agentId, agent.id),
          eq(agentMessagesTable.senderRole, 'agent')
        ));

      const recentLogs = await db
        .select()
        .from(agentCallLogsTable)
        .where(eq(agentCallLogsTable.agentId, agent.id))
        .orderBy(desc(agentCallLogsTable.createdAt))
        .limit(5);

      const recentOrders = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.agentId, agent.id))
        .orderBy(desc(ordersTable.createdAt))
        .limit(3);

      const lastActive = recentLogs[0]?.createdAt ?? recentOrders[0]?.createdAt ?? null;

      return {
        ...mapAgent(agent),
        stats: {
          ordersCreated: orderStats?.total ?? 0,
          callLogs: callStats?.total ?? 0,
          messagesSent: msgStats?.total ?? 0,
        },
        recentLogs,
        recentOrders,
        lastActive: lastActive ? new Date(lastActive).toISOString() : null,
      };
    }));

    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, phone, pin } = req.body;
    if (!name || !phone) {
      res.status(400).json({ error: "bad_request", message: "name and phone are required" });
      return;
    }
    const [agent] = await db.insert(agentsTable).values({
      name,
      phone,
      pin: pin ? hashPin(pin) : null,
      isActive: true,
    }).returning();
    res.status(201).json(mapAgent(agent));
  } catch (err: any) {
    const detail = err.cause?.message ?? err.message;
    res.status(400).json({ error: "bad_request", message: detail.includes("unique constraint") ? "Phone number already registered" : detail });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, phone, isActive, photoUrl } = req.body;
    const [agent] = await db.update(agentsTable)
      .set({
        ...(name && { name }),
        ...(phone && { phone }),
        ...(isActive !== undefined && { isActive }),
        ...(photoUrl !== undefined && { photoUrl }),
      })
      .where(eq(agentsTable.id, id))
      .returning();
    if (!agent) {
      res.status(404).json({ error: "not_found", message: "Agent not found" });
      return;
    }
    res.json(mapAgent(agent));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/reset-pin", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { pin } = req.body;
    if (!pin) {
      res.status(400).json({ error: "bad_request", message: "pin is required" });
      return;
    }
    const [agent] = await db.update(agentsTable)
      .set({ pin: hashPin(String(pin)) })
      .where(eq(agentsTable.id, id))
      .returning();
    if (!agent) {
      res.status(404).json({ error: "not_found", message: "Agent not found" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(agentsTable).where(eq(agentsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.get("/:id/orders", async (req, res) => {
  const id = parseInt(req.params.id);
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.agentId, id));
  res.json({ count: orders.length, totalRevenue: orders.reduce((s, o) => s + parseFloat(o.total), 0).toFixed(2) });
});

// ─── Call Logs ────────────────────────────────────────────────────────────────

router.get("/:id/call-logs", async (req, res) => {
  const agentId = parseInt(req.params.id);
  const logs = await db.select().from(agentCallLogsTable)
    .where(eq(agentCallLogsTable.agentId, agentId))
    .orderBy(desc(agentCallLogsTable.createdAt));
  res.json(logs);
});

router.post("/:id/call-logs", async (req, res) => {
  try {
    const agentId = parseInt(req.params.id);
    const { residentId, residentName, residentPhone, outcome, orderId, notes } = req.body;
    if (!residentName || !residentPhone || !outcome) {
      res.status(400).json({ error: "bad_request", message: "residentName, residentPhone and outcome are required" });
      return;
    }
    const [log] = await db.insert(agentCallLogsTable).values({
      agentId,
      residentId: residentId ? parseInt(residentId) : null,
      residentName,
      residentPhone,
      outcome,
      orderId: orderId ? parseInt(orderId) : null,
      notes: notes || null,
    }).returning();
    if (outcome === "callback_requested") {
      const scheduledFor = req.body.scheduledFor || null;
      await db.insert(agentScheduledCallsTable).values({
        agentId,
        residentId: residentId ? parseInt(residentId) : null,
        residentName,
        residentPhone,
        scheduledFor,
        notes: notes || null,
        status: "pending",
      });
    }
    res.status(201).json(log);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/:agentId/call-logs/:logId", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const logId = parseInt(req.params.logId);
    await db.delete(agentCallLogsTable).where(and(eq(agentCallLogsTable.id, logId), eq(agentCallLogsTable.agentId, agentId)));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// ─── Scheduled Calls ─────────────────────────────────────────────────────────

router.get("/:id/scheduled-calls", async (req, res) => {
  const agentId = parseInt(req.params.id);
  const rows = await db.select().from(agentScheduledCallsTable)
    .where(and(eq(agentScheduledCallsTable.agentId, agentId), eq(agentScheduledCallsTable.status, "pending")))
    .orderBy(agentScheduledCallsTable.createdAt);
  res.json(rows);
});

router.post("/:id/scheduled-calls", async (req, res) => {
  try {
    const agentId = parseInt(req.params.id);
    const { residentId, residentName, residentPhone, scheduledFor, notes } = req.body;
    if (!residentName || !residentPhone) {
      res.status(400).json({ error: "bad_request", message: "residentName and residentPhone are required" });
      return;
    }
    const [row] = await db.insert(agentScheduledCallsTable).values({
      agentId,
      residentId: residentId ? parseInt(residentId) : null,
      residentName,
      residentPhone,
      scheduledFor: scheduledFor || null,
      notes: notes || null,
      status: "pending",
    }).returning();
    res.status(201).json(row);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/scheduled-calls/:id/done", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(agentScheduledCallsTable).set({ status: "done" }).where(eq(agentScheduledCallsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/scheduled-calls/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(agentScheduledCallsTable).where(eq(agentScheduledCallsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// ─── Temp Call List ───────────────────────────────────────────────────────────

router.get("/:id/temp-list", async (req, res) => {
  const agentId = parseInt(req.params.id);
  const rows = await db.select().from(agentTempCallListTable)
    .where(and(eq(agentTempCallListTable.agentId, agentId), eq(agentTempCallListTable.isDone, 0)))
    .orderBy(agentTempCallListTable.createdAt);
  res.json(rows);
});

router.post("/:id/temp-list", async (req, res) => {
  try {
    const agentId = parseInt(req.params.id);
    const { residentId, residentName, residentPhone, notes } = req.body;
    if (!residentName || !residentPhone) {
      res.status(400).json({ error: "bad_request", message: "residentName and residentPhone are required" });
      return;
    }
    const [row] = await db.insert(agentTempCallListTable).values({
      agentId,
      residentId: residentId ? parseInt(residentId) : null,
      residentName,
      residentPhone,
      notes: notes || null,
      isDone: 0,
    }).returning();
    res.status(201).json(row);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/temp-list/:id/done", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(agentTempCallListTable).set({ isDone: 1 }).where(eq(agentTempCallListTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/temp-list/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(agentTempCallListTable).where(eq(agentTempCallListTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
