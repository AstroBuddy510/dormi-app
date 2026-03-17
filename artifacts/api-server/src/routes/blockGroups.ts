import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { blockOrderGroupsTable, ordersTable, residentsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

function mapGroup(g: typeof blockOrderGroupsTable.$inferSelect) {
  return {
    id: g.id,
    name: g.name,
    estate: g.estate,
    status: g.status,
    riderId: g.riderId,
    totalOrders: g.totalOrders,
    totalAmount: parseFloat(g.totalAmount),
    scheduledDate: g.scheduledDate?.toISOString() ?? null,
    notes: g.notes,
    createdAt: g.createdAt.toISOString(),
  };
}

router.get("/", async (_req, res) => {
  const groups = await db.select().from(blockOrderGroupsTable).orderBy(desc(blockOrderGroupsTable.createdAt));
  res.json(groups.map(mapGroup));
});

router.get("/:id/orders", async (req, res) => {
  const id = parseInt(req.params.id);
  const [group] = await db.select().from(blockOrderGroupsTable).where(eq(blockOrderGroupsTable.id, id)).limit(1);
  if (!group) {
    res.status(404).json({ error: "not_found", message: "Group not found" });
    return;
  }
  const orders = await db.select().from(ordersTable)
    .leftJoin(residentsTable, eq(ordersTable.residentId, residentsTable.id))
    .where(eq(ordersTable.blockGroupId, id));

  res.json({
    group: mapGroup(group),
    orders: orders.map(row => ({
      id: row.orders.id,
      residentName: row.residents?.fullName ?? '',
      residentPhone: row.residents?.phone ?? '',
      residentAddress: row.residents ? `Block ${row.residents.blockNumber}, House ${row.residents.houseNumber}` : '',
      items: row.orders.items as any[],
      total: parseFloat(row.orders.total),
      status: row.orders.status,
      createdAt: row.orders.createdAt.toISOString(),
    })),
  });
});

router.put("/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, riderId } = req.body;
    const updateData: any = { ...(status && { status }), ...(riderId !== undefined && { riderId }) };
    const [group] = await db.update(blockOrderGroupsTable)
      .set(updateData)
      .where(eq(blockOrderGroupsTable.id, id))
      .returning();
    if (!group) {
      res.status(404).json({ error: "not_found", message: "Group not found" });
      return;
    }
    res.json(mapGroup(group));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
