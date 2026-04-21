import { Router, type IRouter } from "express";
import { db } from "../../../lib/db/src/index.js";
import { deliveryPartnersTable, ordersTable } from "../../../lib/db/src/schema/index.js";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

function mapPartner(p: typeof deliveryPartnersTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    contactPerson: p.contactPerson,
    phone: p.phone,
    email: p.email,
    address: p.address,
    commissionPercent: parseFloat(p.commissionPercent),
    totalDeliveries: p.totalDeliveries,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/", async (_req, res) => {
  const partners = await db.select().from(deliveryPartnersTable).orderBy(deliveryPartnersTable.createdAt);
  res.json(partners.map(mapPartner));
});

router.post("/", async (req, res) => {
  try {
    const { name, contactPerson, phone, email, address, commissionPercent } = req.body;
    if (!name || !contactPerson || !phone) {
      res.status(400).json({ error: "bad_request", message: "name, contactPerson and phone are required" });
      return;
    }
    const [partner] = await db.insert(deliveryPartnersTable).values({
      name,
      contactPerson,
      phone,
      email: email ?? null,
      address: address ?? null,
      commissionPercent: (commissionPercent ?? 10).toString(),
      isActive: true,
    }).returning();
    res.status(201).json(mapPartner(partner));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, contactPerson, phone, email, address, commissionPercent, isActive } = req.body;
    const [partner] = await db.update(deliveryPartnersTable)
      .set({
        ...(name && { name }),
        ...(contactPerson && { contactPerson }),
        ...(phone && { phone }),
        ...(email !== undefined && { email }),
        ...(address !== undefined && { address }),
        ...(commissionPercent !== undefined && { commissionPercent: commissionPercent.toString() }),
        ...(isActive !== undefined && { isActive }),
      })
      .where(eq(deliveryPartnersTable.id, id))
      .returning();
    if (!partner) {
      res.status(404).json({ error: "not_found", message: "Partner not found" });
      return;
    }
    res.json(mapPartner(partner));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(deliveryPartnersTable).where(eq(deliveryPartnersTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.get("/:id/report", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [partner] = await db.select().from(deliveryPartnersTable).where(eq(deliveryPartnersTable.id, id)).limit(1);
    if (!partner) {
      res.status(404).json({ error: "not_found", message: "Partner not found" });
      return;
    }
    const orders = await db.select().from(ordersTable)
      .where(eq(ordersTable.deliveryPartnerId, id))
      .orderBy(desc(ordersTable.createdAt));

    const totalOrders = orders.length;
    const deliveredOrders = orders.filter(o => o.status === 'delivered');
    const totalRevenue = deliveredOrders.reduce((s, o) => s + parseFloat(o.total), 0);
    const commissionRate = parseFloat(partner.commissionPercent) / 100;
    const commission = Math.round(totalRevenue * commissionRate * 100) / 100;

    res.json({
      partner: mapPartner(partner),
      totalOrders,
      deliveredOrders: deliveredOrders.length,
      pendingOrders: orders.filter(o => o.status === 'pending').length,
      inProgressOrders: orders.filter(o => ['accepted','ready','in_transit'].includes(o.status)).length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      commissionRate: parseFloat(partner.commissionPercent),
      commissionOwed: commission,
      orders: orders.map(o => ({
        id: o.id,
        status: o.status,
        total: parseFloat(o.total),
        commissionAmount: Math.round(parseFloat(o.total) * commissionRate * 100) / 100,
        createdAt: o.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
