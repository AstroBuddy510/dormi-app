import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import {
  ordersTable,
  residentsTable,
  vendorsTable,
  itemsTable,
  pricingTable,
  blockOrderGroupsTable,
  deliveryPartnersTable,
  deliveryZonesTable,
  deliveryTownsTable,
} from "../../../../lib/db/src/schema/index.js";
import { eq, and, gte } from "drizzle-orm";
import { CreateCallLogOrderBody } from "../../../../lib/api-zod/src/index.js";
import { computeOrderTaxes } from "../lib/taxes.js";

const router: IRouter = Router();

async function generateBatchNumber(estate: string): Promise<string> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ""); // '20260317'
  const estCode = estate.split(/\s+/).map(w => w[0]?.toUpperCase() ?? "").join(""); // 'AH', 'ELH'
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayGroups = await db
    .select({ id: blockOrderGroupsTable.id })
    .from(blockOrderGroupsTable)
    .where(gte(blockOrderGroupsTable.createdAt, dayStart));
  const seq = String(todayGroups.length + 1).padStart(3, "0");
  return `BULK-${estCode}-${dateStr}-${seq}`;
}

function addHours(h: number) {
  const d = new Date();
  d.setHours(d.getHours() + h);
  return d;
}

async function enrichOrder(order: typeof ordersTable.$inferSelect) {
  const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.id, order.residentId)).limit(1);
  let vendorName: string | undefined;
  let vendorCommissionPercent = 0;
  if (order.vendorId) {
    const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, order.vendorId)).limit(1);
    vendorName = v?.name;
    vendorCommissionPercent = parseFloat(v?.commissionPercent ?? "5");
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
    vendorCommissionPercent,
    riderId: order.riderId,
    deliveryPartnerId: order.deliveryPartnerId,
    riderName: null,
    items: order.items as any[],
    subtotal: parseFloat(order.subtotal),
    serviceFee: parseFloat(order.serviceFee),
    deliveryFee: parseFloat(order.deliveryFee),
    taxBase: parseFloat(order.taxBase),
    vatAmount: parseFloat(order.vatAmount),
    nhilAmount: parseFloat(order.nhilAmount),
    getfundAmount: parseFloat(order.getfundAmount),
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
    const tax = await computeOrderTaxes(serviceFee, deliveryFee);
    const total = Math.round((subtotal + serviceFee + deliveryFee + tax.taxTotal) * 100) / 100;

    const vendors = await db.select().from(vendorsTable);
    const vendorId = vendors.length > 0 ? vendors[0].id : null;

    const [order] = await db.insert(ordersTable).values({
      residentId: body.residentId,
      vendorId,
      items: orderItems,
      subtotal: subtotal.toString(),
      serviceFee: serviceFee.toString(),
      deliveryFee: deliveryFee.toString(),
      taxBase: tax.base.toString(),
      vatAmount: tax.vatAmount.toString(),
      nhilAmount: tax.nhilAmount.toString(),
      getfundAmount: tax.getfundAmount.toString(),
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

async function resolveVendor(items: any[]) {
  const vendors = await db.select().from(vendorsTable);
  if (vendors.length === 0) return null;
  const categories = [...new Set(items.map((i: any) => i.category ?? "Staples"))];
  for (const vendor of vendors) {
    if (vendor.categories.some((c: string) => categories.includes(c))) return vendor.id;
  }
  return vendors[0].id;
}

router.post("/orders/single", async (req, res) => {
  try {
    const { residentId, rawItems, notes, paymentMethod, isUrgent, vendorId: explicitVendorId, deliveryZoneId, deliveryTownId, agentId } = req.body;
    if (!residentId || !rawItems) {
      res.status(400).json({ error: "bad_request", message: "residentId and rawItems are required" });
      return;
    }
    const [pricing] = await db.select().from(pricingTable).limit(1);
    let deliveryFee = pricing ? parseFloat(pricing.deliveryFee) : 30;
    const markupPercent = pricing ? parseFloat(pricing.serviceMarkupPercent) : 18;
    if (deliveryTownId) {
      const [town] = await db.select().from(deliveryTownsTable).where(eq(deliveryTownsTable.id, parseInt(deliveryTownId))).limit(1);
      if (town?.zoneId) {
        const [zone] = await db.select().from(deliveryZonesTable).where(eq(deliveryZonesTable.id, town.zoneId)).limit(1);
        if (zone) deliveryFee = parseFloat(zone.feeCedis);
      }
    } else if (deliveryZoneId) {
      const [zone] = await db.select().from(deliveryZonesTable).where(eq(deliveryZonesTable.id, parseInt(deliveryZoneId))).limit(1);
      if (zone) deliveryFee = parseFloat(zone.feeCedis);
    }

    const rawLines = (rawItems as string).split("\n").filter((l: string) => l.trim());
    const orderItems = rawLines.map((line: string, idx: number) => {
      const parts = line.trim().split(",");
      return {
        itemId: 0,
        itemName: parts[0]?.trim() ?? `Item ${idx + 1}`,
        category: parts[3]?.trim() ?? "Staples",
        quantity: parseFloat(parts[1]?.trim() ?? "1") || 1,
        unitPrice: parseFloat(parts[2]?.trim() ?? "10") || 10,
        totalPrice: Math.round((parseFloat(parts[1]?.trim() ?? "1") || 1) * (parseFloat(parts[2]?.trim() ?? "10") || 10) * 100) / 100,
      };
    });

    const subtotal = orderItems.reduce((s: number, i: any) => s + i.totalPrice, 0);
    const serviceFee = Math.round((subtotal * markupPercent / 100) * 100) / 100;
    const tax = await computeOrderTaxes(serviceFee, deliveryFee);
    const total = Math.round((subtotal + serviceFee + deliveryFee + tax.taxTotal) * 100) / 100;
    const vendorId = explicitVendorId ? parseInt(explicitVendorId) : await resolveVendor(orderItems);

    const [order] = await db.insert(ordersTable).values({
      residentId: parseInt(residentId),
      vendorId,
      items: orderItems,
      subtotal: subtotal.toString(),
      serviceFee: serviceFee.toString(),
      deliveryFee: deliveryFee.toString(),
      taxBase: tax.base.toString(),
      vatAmount: tax.vatAmount.toString(),
      nhilAmount: tax.nhilAmount.toString(),
      getfundAmount: tax.getfundAmount.toString(),
      total: total.toString(),
      status: "pending",
      paymentMethod: paymentMethod ?? "cash_on_delivery",
      isSubscription: false,
      callOnly: true,
      callAccepted: false,
      orderType: "single",
      isUrgent: !!isUrgent,
      pickupDeadline: addHours(isUrgent ? 1 : 3),
      eta: isUrgent ? "30-60 mins" : "2-3 hours",
      notes: notes ?? null,
      agentId: agentId ? parseInt(agentId) : null,
    }).returning();

    res.status(201).json(await enrichOrder(order));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.post("/orders/block", async (req, res) => {
  try {
    const { estate, groupName, scheduledDate, notes: groupNotes, orders: orderList, vendorId: bulkVendorId } = req.body;
    if (!estate || !orderList || !Array.isArray(orderList) || orderList.length === 0) {
      res.status(400).json({ error: "bad_request", message: "estate and orders[] are required" });
      return;
    }

    const [pricing] = await db.select().from(pricingTable).limit(1);
    const deliveryFee = pricing ? parseFloat(pricing.deliveryFee) : 30;
    const markupPercent = pricing ? parseFloat(pricing.serviceMarkupPercent) : 18;

    const batchNumber = await generateBatchNumber(estate);
    const name = groupName || `${estate} — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    const [group] = await db.insert(blockOrderGroupsTable).values({
      batchNumber,
      name,
      estate,
      status: "pending",
      totalOrders: orderList.length,
      totalAmount: "0",
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      notes: groupNotes ?? null,
    }).returning();

    let groupTotal = 0;
    const createdOrders = [];

    for (const o of orderList) {
      const rawLines = (o.rawItems as string).split("\n").filter((l: string) => l.trim());
      const orderItems = rawLines.map((line: string, idx: number) => {
        const parts = line.trim().split(",");
        return {
          itemId: 0,
          itemName: parts[0]?.trim() ?? `Item ${idx + 1}`,
          category: parts[3]?.trim() ?? "Staples",
          quantity: parseFloat(parts[1]?.trim() ?? "1") || 1,
          unitPrice: parseFloat(parts[2]?.trim() ?? "10") || 10,
          totalPrice: Math.round((parseFloat(parts[1]?.trim() ?? "1") || 1) * (parseFloat(parts[2]?.trim() ?? "10") || 10) * 100) / 100,
        };
      });

      const subtotal = orderItems.reduce((s: number, i: any) => s + i.totalPrice, 0);
      const serviceFee = Math.round((subtotal * markupPercent / 100) * 100) / 100;
      const tax = await computeOrderTaxes(serviceFee, deliveryFee);
      const total = Math.round((subtotal + serviceFee + deliveryFee + tax.taxTotal) * 100) / 100;
      const vendorId = bulkVendorId ? parseInt(bulkVendorId) : await resolveVendor(orderItems);
      groupTotal += total;

      const [order] = await db.insert(ordersTable).values({
        residentId: parseInt(o.residentId),
        vendorId,
        items: orderItems,
        subtotal: subtotal.toString(),
        serviceFee: serviceFee.toString(),
        deliveryFee: deliveryFee.toString(),
        taxBase: tax.base.toString(),
        vatAmount: tax.vatAmount.toString(),
        nhilAmount: tax.nhilAmount.toString(),
        getfundAmount: tax.getfundAmount.toString(),
        total: total.toString(),
        status: "pending",
        paymentMethod: o.paymentMethod ?? "cash_on_delivery",
        isSubscription: false,
        callOnly: true,
        callAccepted: false,
        orderType: "block",
        blockGroupId: group.id,
        isUrgent: false,
        pickupDeadline: addHours(6),
        eta: "Same day delivery",
        notes: o.notes ?? null,
      }).returning();
      createdOrders.push(order);
    }

    await db.update(blockOrderGroupsTable)
      .set({ totalAmount: groupTotal.toFixed(2), totalOrders: createdOrders.length })
      .where(eq(blockOrderGroupsTable.id, group.id));

    res.status(201).json({ group: { ...group, totalOrders: createdOrders.length, totalAmount: groupTotal }, ordersCreated: createdOrders.length });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.post("/orders/third-party", async (req, res) => {
  try {
    const { residentId, deliveryPartnerId, rawItems, notes, paymentMethod } = req.body;
    if (!residentId || !deliveryPartnerId || !rawItems) {
      res.status(400).json({ error: "bad_request", message: "residentId, deliveryPartnerId and rawItems are required" });
      return;
    }

    const [partner] = await db.select().from(deliveryPartnersTable).where(eq(deliveryPartnersTable.id, parseInt(deliveryPartnerId))).limit(1);
    if (!partner) {
      res.status(404).json({ error: "not_found", message: "Delivery partner not found" });
      return;
    }

    const [pricing] = await db.select().from(pricingTable).limit(1);
    const deliveryFee = pricing ? parseFloat(pricing.deliveryFee) : 30;
    const markupPercent = pricing ? parseFloat(pricing.serviceMarkupPercent) : 18;

    const rawLines = (rawItems as string).split("\n").filter((l: string) => l.trim());
    const orderItems = rawLines.map((line: string, idx: number) => {
      const parts = line.trim().split(",");
      return {
        itemId: 0,
        itemName: parts[0]?.trim() ?? `Item ${idx + 1}`,
        category: parts[3]?.trim() ?? "Staples",
        quantity: parseFloat(parts[1]?.trim() ?? "1") || 1,
        unitPrice: parseFloat(parts[2]?.trim() ?? "10") || 10,
        totalPrice: Math.round((parseFloat(parts[1]?.trim() ?? "1") || 1) * (parseFloat(parts[2]?.trim() ?? "10") || 10) * 100) / 100,
      };
    });

    const subtotal = orderItems.reduce((s: number, i: any) => s + i.totalPrice, 0);
    const serviceFee = Math.round((subtotal * markupPercent / 100) * 100) / 100;
    const tax = await computeOrderTaxes(serviceFee, deliveryFee);
    const total = Math.round((subtotal + serviceFee + deliveryFee + tax.taxTotal) * 100) / 100;
    const vendorId = await resolveVendor(orderItems);

    const [order] = await db.insert(ordersTable).values({
      residentId: parseInt(residentId),
      vendorId,
      items: orderItems,
      subtotal: subtotal.toString(),
      serviceFee: serviceFee.toString(),
      deliveryFee: deliveryFee.toString(),
      taxBase: tax.base.toString(),
      vatAmount: tax.vatAmount.toString(),
      nhilAmount: tax.nhilAmount.toString(),
      getfundAmount: tax.getfundAmount.toString(),
      total: total.toString(),
      status: "pending",
      paymentMethod: paymentMethod ?? "cash_on_delivery",
      isSubscription: false,
      callOnly: true,
      callAccepted: false,
      orderType: "third_party",
      deliveryPartnerId: parseInt(deliveryPartnerId),
      isUrgent: false,
      pickupDeadline: addHours(4),
      eta: "3-5 hours",
      notes: notes ?? null,
    }).returning();

    await db.update(deliveryPartnersTable)
      .set({ totalDeliveries: partner.totalDeliveries + 1 })
      .where(eq(deliveryPartnersTable.id, parseInt(deliveryPartnerId)));

    res.status(201).json(await enrichOrder(order));
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
  const subscriberCount = await db.select().from(residentsTable).where(eq(residentsTable.subscribeWeekly, true)).then(r => r.length);

  // ── Net Revenue calculation ───────────────────────────────────────────────
  // Only count delivered orders for earnings
  const delivered = allOrders.filter(o => o.status === "delivered");

  // 1. Service fee (18% markup) — belongs entirely to GrocerEase
  const serviceFeeEarnings = delivered.reduce((s, o) => s + parseFloat(o.serviceFee ?? "0"), 0);

  // 2. In-house rider delivery fees — where riderId is set and no delivery partner
  const inHouseDeliveryEarnings = delivered
    .filter(o => o.riderId !== null && o.deliveryPartnerId === null)
    .reduce((s, o) => s + parseFloat(o.deliveryFee ?? "0"), 0);

  // 3. Third-party delivery partner commissions — we earn commissionPercent of their delivery fee
  const partnerIds = [...new Set(delivered.filter(o => o.deliveryPartnerId !== null).map(o => o.deliveryPartnerId!))];
  let partnerCommissionEarnings = 0;
  if (partnerIds.length > 0) {
    const partners = await db.select().from(deliveryPartnersTable);
    const partnerMap = new Map(partners.map(p => [p.id, parseFloat(p.commissionPercent)]));
    partnerCommissionEarnings = delivered
      .filter(o => o.deliveryPartnerId !== null)
      .reduce((s, o) => {
        const rate = (partnerMap.get(o.deliveryPartnerId!) ?? 0) / 100;
        return s + parseFloat(o.deliveryFee ?? "0") * rate;
      }, 0);
  }

  // 4. Vendor commission — each vendor may have a commissionPercent on the order subtotal
  const vendorIds = [...new Set(delivered.filter(o => o.vendorId !== null).map(o => o.vendorId!))];
  let vendorCommissionEarnings = 0;
  if (vendorIds.length > 0) {
    const vendors = await db.select().from(vendorsTable);
    const vendorMap = new Map(vendors.map(v => [v.id, parseFloat(v.commissionPercent ?? "5")]));
    vendorCommissionEarnings = delivered
      .filter(o => o.vendorId !== null)
      .reduce((s, o) => {
        const rate = (vendorMap.get(o.vendorId!) ?? 0) / 100;
        return s + parseFloat(o.subtotal ?? "0") * rate;
      }, 0);
  }

  const netRevenue = serviceFeeEarnings + inHouseDeliveryEarnings + partnerCommissionEarnings + vendorCommissionEarnings;

  const revenueBreakdown = {
    serviceFee: parseFloat(serviceFeeEarnings.toFixed(2)),
    inHouseDelivery: parseFloat(inHouseDeliveryEarnings.toFixed(2)),
    partnerCommission: parseFloat(partnerCommissionEarnings.toFixed(2)),
    vendorCommission: parseFloat(vendorCommissionEarnings.toFixed(2)),
  };

  res.json({ totalOrders, pendingOrders, inProgressOrders, deliveredOrders, netRevenue: parseFloat(netRevenue.toFixed(2)), revenueBreakdown, subscriberCount });
});

export default router;
