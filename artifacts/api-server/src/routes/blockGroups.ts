import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { blockOrderGroupsTable, ordersTable, residentsTable, ridersTable } from "../../../../lib/db/src/schema/index.js";
import { eq, desc, and } from "drizzle-orm";

const router: IRouter = Router();

async function mapGroupWithRider(g: typeof blockOrderGroupsTable.$inferSelect) {
  let riderName: string | null = null;
  if (g.riderId) {
    const [rider] = await db.select({ name: ridersTable.name }).from(ridersTable).where(eq(ridersTable.id, g.riderId)).limit(1);
    riderName = rider?.name ?? null;
  }

  const childOrders = await db.select({ riderAccepted: ordersTable.riderAccepted })
    .from(ordersTable)
    .where(eq(ordersTable.blockGroupId, g.id));
  const riderAccepted = childOrders.length > 0 && childOrders.every(o => o.riderAccepted === true);

  return {
    id: g.id,
    batchNumber: g.batchNumber ?? null,
    name: g.name,
    estate: g.estate,
    status: g.status,
    riderId: g.riderId,
    riderName,
    riderAccepted,
    totalOrders: g.totalOrders,
    totalAmount: parseFloat(g.totalAmount),
    scheduledDate: g.scheduledDate?.toISOString() ?? null,
    notes: g.notes,
    createdAt: g.createdAt.toISOString(),
    isBulkGroup: true,
  };
}

router.get("/", async (req, res) => {
  const { riderId } = req.query;
  const conditions: any[] = [];
  if (riderId) conditions.push(eq(blockOrderGroupsTable.riderId, parseInt(riderId as string)));
  const groups = conditions.length > 0
    ? await db.select().from(blockOrderGroupsTable).where(and(...conditions)).orderBy(desc(blockOrderGroupsTable.createdAt))
    : await db.select().from(blockOrderGroupsTable).orderBy(desc(blockOrderGroupsTable.createdAt));
  const mapped = await Promise.all(groups.map(mapGroupWithRider));
  res.json(mapped);
});

router.get("/:id/orders", async (req, res) => {
  const id = parseInt(req.params.id);
  const [group] = await db.select().from(blockOrderGroupsTable).where(eq(blockOrderGroupsTable.id, id)).limit(1);
  if (!group) {
    res.status(404).json({ error: "not_found", message: "Group not found" });
    return;
  }
  const rows = await db.select().from(ordersTable)
    .leftJoin(residentsTable, eq(ordersTable.residentId, residentsTable.id))
    .where(eq(ordersTable.blockGroupId, id));

  res.json({
    group: await mapGroupWithRider(group),
    orders: rows.map(row => ({
      id: row.orders.id,
      residentName: row.residents?.fullName ?? "",
      residentPhone: row.residents?.phone ?? "",
      residentAddress: row.residents
        ? `Block ${row.residents.blockNumber}, House ${row.residents.houseNumber}`
        : "",
      estate: row.residents?.estate ?? group.estate,
      items: row.orders.items as any[],
      subtotal: parseFloat(row.orders.subtotal),
      serviceFee: parseFloat(row.orders.serviceFee),
      deliveryFee: parseFloat(row.orders.deliveryFee),
      total: parseFloat(row.orders.total),
      status: row.orders.status,
      riderAccepted: row.orders.riderAccepted,
      paymentMethod: row.orders.paymentMethod,
      notes: row.orders.notes,
      createdAt: row.orders.createdAt.toISOString(),
    })),
  });
});

router.put("/:id/assign-rider", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { riderId } = req.body;
    if (!riderId) {
      res.status(400).json({ error: "bad_request", message: "riderId is required" });
      return;
    }
    const riderIdInt = parseInt(riderId);

    const [group] = await db.update(blockOrderGroupsTable)
      .set({ riderId: riderIdInt })
      .where(eq(blockOrderGroupsTable.id, id))
      .returning();

    if (!group) {
      res.status(404).json({ error: "not_found", message: "Group not found" });
      return;
    }

    await db.update(ordersTable)
      .set({ riderId: riderIdInt, riderAccepted: null, updatedAt: new Date() })
      .where(eq(ordersTable.blockGroupId, id));

    res.json(await mapGroupWithRider(group));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/rider-response", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { accepted } = req.body;

    if (accepted === undefined) {
      res.status(400).json({ error: "bad_request", message: "accepted is required" });
      return;
    }

    const [group] = await db.select().from(blockOrderGroupsTable).where(eq(blockOrderGroupsTable.id, id)).limit(1);
    if (!group) {
      res.status(404).json({ error: "not_found", message: "Group not found" });
      return;
    }

    if (accepted) {
      await db.update(blockOrderGroupsTable)
        .set({ status: "accepted" })
        .where(eq(blockOrderGroupsTable.id, id));
      await db.update(ordersTable)
        .set({ riderAccepted: true, riderAcceptedAt: new Date(), status: "accepted", updatedAt: new Date() })
        .where(eq(ordersTable.blockGroupId, id));
    } else {
      await db.update(blockOrderGroupsTable)
        .set({ riderId: null })
        .where(eq(blockOrderGroupsTable.id, id));
      await db.update(ordersTable)
        .set({ riderId: null, riderAccepted: null, riderAcceptedAt: null, updatedAt: new Date() })
        .where(eq(ordersTable.blockGroupId, id));
    }

    const [updated] = await db.select().from(blockOrderGroupsTable).where(eq(blockOrderGroupsTable.id, id)).limit(1);
    res.json(await mapGroupWithRider(updated));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: "bad_request", message: "status is required" });
      return;
    }

    const [group] = await db.update(blockOrderGroupsTable)
      .set({ status })
      .where(eq(blockOrderGroupsTable.id, id))
      .returning();

    if (!group) {
      res.status(404).json({ error: "not_found", message: "Group not found" });
      return;
    }

    const orderUpdateData: any = { status, updatedAt: new Date() };
    if (status === 'in_transit') orderUpdateData.pickedUpAt = new Date();
    if (status === 'delivered')  orderUpdateData.deliveredAt = new Date();

    await db.update(ordersTable)
      .set(orderUpdateData)
      .where(eq(ordersTable.blockGroupId, id));

    res.json(await mapGroupWithRider(group));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
