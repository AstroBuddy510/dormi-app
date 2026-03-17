import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { agentsTable, ordersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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

export default router;
