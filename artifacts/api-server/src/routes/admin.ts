import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  residentsTable,
  vendorsTable,
  itemsTable,
  pricingTable,
} from "@workspace/db/schema";
import { eq, and, count, sum } from "drizzle-orm";
import { CreateCallLogOrderBody } from "@workspace/api-zod";

const router: IRouter = Router();

function addHours(h: number) {
  const d = new Date();
  d.setHours(d.getHours() + h);
  return d;
}

async function enrichOrder(order: typeof ordersTable.$inferSelect) {
  const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.id, order.residentId)).limit(1);
  let vendorName: string | undefined;
  if (order.vendorId) {
    const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, order.vendorId)).limit(1);
    vendorName = v?.name;
  }
  const address = resident
    ? `${resident.estate}, Block ${resident.blockNumber}, House ${resident.houseNumber}`
    : "";
  return {
    id: order.id,
    residentId: order.residentId,
    residentName: resident?.fullName ?? "",
    residentPhone: resident?.phone ?? "",
    residentAddress: address,
    vendorId: order.vendorId,
    vendorName: vendorName ?? null,
    riderId: order.riderId,
    riderName: null,
    items: order.items as any[],
    subtotal: parseFloat(order.subtotal),
    serviceFee: parseFloat(order.serviceFee),
    deliveryFee: parseFloat(order.deliveryFee),
    total: parseFloat(order.total),
    status: order.status,
    paymentMethod: order.paymentMethod,
    isSubscription: order.isSubscription,
    callOnly: order.callOnly,
    callAccepted: order.callAccepted,
    photoUrl: order.photoUrl,
    deliveryPhotoUrl: order.deliveryPhotoUrl,
    pickupDeadline: order.pickupDeadline?.toISOString() ?? null,
    eta: order.eta,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

router.post("/call-log", async (req, res) => {
  try {
    const body = CreateCallLogOrderBody.parse(req.body);
    const [pricing] = await db.select().from(pricingTable).limit(1);
    const deliveryFee = pricing ? parseFloat(pricing.deliveryFee) : 30;
    const markupPercent = pricing ? parseFloat(pricing.serviceMarkupPercent) : 18;

    const rawLines = body.rawItems.split("\n").filter(l => l.trim());
    const orderItems = rawLines.map((line, idx) => {
      const parts = line.trim().split(",");
      const itemName = parts[0]?.trim() ?? `Item ${idx + 1}`;
      const qty = parseFloat(parts[1]?.trim() ?? "1") || 1;
      const price = parseFloat(parts[2]?.trim() ?? "10") || 10;
      return {
        itemId: 0,
        itemName,
        category: "Staples",
        quantity: qty,
        unitPrice: price,
        totalPrice: Math.round(qty * price * 100) / 100,
      };
    });

    const subtotal = orderItems.reduce((s, i) => s + i.totalPrice, 0);
    const serviceFee = Math.round((subtotal * markupPercent / 100) * 100) / 100;
    const total = subtotal + serviceFee + deliveryFee;

    const vendors = await db.select().from(vendorsTable);
    const vendorId = vendors.length > 0 ? vendors[0].id : null;

    const [order] = await db.insert(ordersTable).values({
      residentId: body.residentId,
      vendorId,
      items: orderItems,
      subtotal: subtotal.toString(),
      serviceFee: serviceFee.toString(),
      deliveryFee: deliveryFee.toString(),
      total: total.toString(),
      status: "pending",
      paymentMethod: "cash_on_delivery",
      isSubscription: false,
      callOnly: true,
      callAccepted: false,
      pickupDeadline: addHours(3),
      eta: "3-4 hours",
      notes: body.notes ?? null,
    }).returning();

    res.status(201).json([await enrichOrder(order)]);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.get("/subscriptions/friday-queue", async (_req, res) => {
  const subscribers = await db.select().from(residentsTable)
    .where(eq(residentsTable.subscribeWeekly, true));
  res.json(subscribers.map(r => ({
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    estate: r.estate,
    blockNumber: r.blockNumber,
    houseNumber: r.houseNumber,
    ghanaGpsAddress: r.ghanaGpsAddress,
    subscribeWeekly: r.subscribeWeekly,
    subscriptionDay: r.subscriptionDay,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.get("/stats", async (_req, res) => {
  const allOrders = await db.select().from(ordersTable);
  const totalOrders = allOrders.length;
  const pendingOrders = allOrders.filter(o => o.status === "pending").length;
  const inProgressOrders = allOrders.filter(o => ["accepted", "ready", "in_transit"].includes(o.status)).length;
  const deliveredOrders = allOrders.filter(o => o.status === "delivered").length;
  const totalRevenue = allOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
  const subscriberCount = await db.select().from(residentsTable).where(eq(residentsTable.subscribeWeekly, true)).then(r => r.length);

  res.json({ totalOrders, pendingOrders, inProgressOrders, deliveredOrders, totalRevenue, subscriberCount });
});

export default router;
