import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { ordersTable, residentsTable, vendorsTable, ridersTable, pricingTable, itemsTable, deliveryPartnersTable, deliveryZonesTable, deliveryTownsTable, financeSettingsTable } from "../../../../lib/db/src/schema/index.js";
import { computeOrderTaxes } from "../lib/taxes.js";
import { postOrderPayment, postRiderEarning } from "../lib/ledger.js";
import { eq, and, desc } from "drizzle-orm";
import {
  CreateOrderBody,
  UpdateOrderStatusBody,
  AssignRiderBody,
  UploadOrderPhotoBody,
} from "../../../../lib/api-zod/src/index.js";

import { getGatewayKeys } from "../lib/gatewayKeys.js";

const router: IRouter = Router();

async function verifyPaystackRef(reference: string, expectedPesewas: number): Promise<boolean> {
  const { secretKey } = await getGatewayKeys();
  if (!secretKey) return false;
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return (
      data.status === true &&
      data.data?.status === "success" &&
      data.data?.currency === "GHS" &&
      typeof data.data?.amount === "number" &&
      data.data.amount === expectedPesewas
    );
  } catch {
    return false;
  }
}

function addHours(h: number) {
  const d = new Date();
  d.setHours(d.getHours() + h);
  return d;
}


async function enrichOrder(order: typeof ordersTable.$inferSelect) {
  const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.id, order.residentId)).limit(1);
  let vendorName: string | undefined;
  let vendorCommissionPercent = 5;
  let riderName: string | undefined;
  let deliveryPartnerName: string | undefined;
  if (order.vendorId) {
    const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, order.vendorId)).limit(1);
    vendorName = v?.name;
    vendorCommissionPercent = parseFloat(v?.commissionPercent ?? "5");
  }
  if (order.riderId) {
    const [r] = await db.select().from(ridersTable).where(eq(ridersTable.id, order.riderId)).limit(1);
    riderName = r?.name;
  }
  if (order.deliveryPartnerId) {
    const [dp] = await db.select().from(deliveryPartnersTable).where(eq(deliveryPartnersTable.id, order.deliveryPartnerId)).limit(1);
    deliveryPartnerName = dp?.name;
  }
  const address = resident
    ? `${resident.estate}, Block ${resident.blockNumber}, House ${resident.houseNumber}${resident.ghanaGpsAddress ? ` (${resident.ghanaGpsAddress})` : ""}`
    : "";
  return {
    id: order.id,
    residentId: order.residentId,
    residentName: resident?.fullName ?? "",
    residentPhone: resident?.phone ?? "",
    residentAddress: address,
    residentEstate: resident?.estate ?? "",
    vendorId: order.vendorId,
    vendorName: vendorName ?? null,
    vendorCommissionPercent,
    riderId: order.riderId,
    riderName: riderName ?? null,
    deliveryPartnerId: order.deliveryPartnerId ?? null,
    deliveryPartnerName: deliveryPartnerName ?? null,
    orderType: order.orderType,
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
    riderAccepted: order.riderAccepted ?? null,
    riderAcceptedAt: order.riderAcceptedAt?.toISOString() ?? null,
    pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    photoUrl: order.photoUrl,
    deliveryPhotoUrl: order.deliveryPhotoUrl,
    pickupDeadline: order.pickupDeadline?.toISOString() ?? null,
    eta: order.eta,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

router.get("/", async (req, res) => {
  const { status, residentId, vendorId, riderId, isSubscription, callOnly } = req.query;
  let query = db.select().from(ordersTable);
  const conditions: any[] = [];
  if (status) conditions.push(eq(ordersTable.status, status as string));
  if (residentId) conditions.push(eq(ordersTable.residentId, parseInt(residentId as string)));
  if (vendorId) conditions.push(eq(ordersTable.vendorId, parseInt(vendorId as string)));
  if (riderId) conditions.push(eq(ordersTable.riderId, parseInt(riderId as string)));
  if (isSubscription !== undefined) conditions.push(eq(ordersTable.isSubscription, isSubscription === "true"));
  if (callOnly !== undefined) conditions.push(eq(ordersTable.callOnly, callOnly === "true"));
  const rows = conditions.length > 0
    ? await (query as any).where(and(...conditions)).orderBy(desc(ordersTable.createdAt))
    : await (query as any).orderBy(desc(ordersTable.createdAt));
  const enriched = await Promise.all(rows.map(enrichOrder));
  res.json(enriched);
});

router.post("/", async (req, res) => {
  try {
    const body = CreateOrderBody.parse(req.body);
    const paystackReference: string | undefined = req.body.paystackReference;
    const deliveryZoneId: number | undefined = req.body.deliveryZoneId ? parseInt(req.body.deliveryZoneId) : undefined;
    const deliveryTownId: number | undefined = req.body.deliveryTownId ? parseInt(req.body.deliveryTownId) : undefined;
    const [pricing] = await db.select().from(pricingTable).limit(1);
    const markupPercent = pricing ? parseFloat(pricing.serviceMarkupPercent) : 18;
    let deliveryFee = pricing ? parseFloat(pricing.deliveryFee) : 30;
    if (deliveryTownId) {
      const [town] = await db.select().from(deliveryTownsTable).where(eq(deliveryTownsTable.id, deliveryTownId)).limit(1);
      if (town?.zoneId) {
        const [zone] = await db.select().from(deliveryZonesTable).where(eq(deliveryZonesTable.id, town.zoneId)).limit(1);
        if (zone) deliveryFee = parseFloat(zone.feeCedis);
      }
    } else if (deliveryZoneId) {
      const [zone] = await db.select().from(deliveryZonesTable).where(eq(deliveryZonesTable.id, deliveryZoneId)).limit(1);
      if (zone) deliveryFee = parseFloat(zone.feeCedis);
    }

    const subtotal = body.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const serviceFee = Math.round((subtotal * markupPercent / 100) * 100) / 100;
    // Apply admin-controlled taxes (VAT / NHIL / GETFund) to platform revenue
    // base only (serviceFee + deliveryFee). Goods (subtotal) are NOT taxed by
    // the platform — the vendor handles their own goods tax position.
    const tax = await computeOrderTaxes(serviceFee, deliveryFee);
    const total = Math.round((subtotal + serviceFee + deliveryFee + tax.taxTotal) * 100) / 100;

    const orderItems = await Promise.all(body.items.map(async (item) => {
      const [dbItem] = await db.select().from(itemsTable).where(eq(itemsTable.id, item.itemId)).limit(1);
      return {
        itemId: item.itemId,
        itemName: dbItem?.name ?? `Item ${item.itemId}`,
        category: dbItem?.category ?? "Unknown",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: Math.round(item.quantity * item.unitPrice * 100) / 100,
      };
    }));

    const categories = [...new Set(orderItems.map(i => i.category))];
    const vendorCategoryMap: Record<string, string[]> = {
      Vegetables: ["Vegetables", "Fruits"],
      Meat: ["Meat"],
      Dairy: ["Dairy"],
      Staples: ["Staples", "Household"],
      Cosmetics: ["Cosmetics"],
    };

    let assignedVendorId: number | null = null;
    const vendors = await db.select().from(vendorsTable);
    for (const [vendorCat, cats] of Object.entries(vendorCategoryMap)) {
      if (categories.some(c => cats.includes(c))) {
        const vendor = vendors.find(v => v.categories.some(vc => cats.includes(vc)));
        if (vendor) { assignedVendorId = vendor.id; break; }
      }
    }
    if (!assignedVendorId && vendors.length > 0) assignedVendorId = vendors[0].id;

    let paymentStatus = "pending";
    if (body.paymentMethod === "paystack") {
      if (!paystackReference) {
        return res.status(400).json({ error: "missing_payment_reference", message: "A Paystack payment reference is required for online payment." });
      }
      // Idempotency: block re-using a reference that's already tied to an order.
      const [existing] = await db.select().from(ordersTable)
        .where(eq(ordersTable.paystackReference, paystackReference))
        .limit(1);
      if (existing) {
        return res.status(409).json({ error: "duplicate_reference", message: "An order already exists for this payment reference." });
      }
      const expectedPesewas = Math.round(total * 100);
      const verified = await verifyPaystackRef(paystackReference, expectedPesewas);
      if (!verified) {
        return res.status(402).json({ error: "payment_not_verified", message: "Payment could not be verified (status, amount, or currency mismatch). Please try again." });
      }
      paymentStatus = "paid";
    }

    const [order] = await db.insert(ordersTable).values({
      residentId: body.residentId,
      vendorId: assignedVendorId,
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
      paymentMethod: body.paymentMethod,
      paymentStatus,
      paystackReference: paystackReference ?? null,
      isSubscription: body.isSubscription ?? false,
      callOnly: false,
      callAccepted: false,
      pickupDeadline: addHours(2),
      eta: "2-3 hours",
      notes: body.notes ?? null,
    }).returning();

    // Post the order_payment journal as soon as the customer's money has
    // actually moved (paystack-paid at this stage, or verified upfront).
    // Cash orders get their journal posted later — when the rider collects
    // cash at delivery (see PUT /:id/status below).
    if (paymentStatus === "paid") {
      try {
        await postOrderPayment({
          orderId: order.id,
          subtotal,
          serviceFee,
          deliveryFee,
          vatAmount: tax.vatAmount,
          nhilAmount: tax.nhilAmount,
          getfundAmount: tax.getfundAmount,
          receivedInto: "paystack",
        });
      } catch (e) {
        console.error("[ledger] failed to post order_payment for order", order.id, e);
      }
    }

    res.status(201).json(await enrichOrder(order));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) {
    res.status(404).json({ error: "not_found", message: "Order not found" });
    return;
  }
  res.json(await enrichOrder(order));
});

router.put("/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateOrderStatusBody.parse(req.body);
    const updateData: any = { status: body.status, updatedAt: new Date() };
    if (body.status === 'in_transit') updateData.pickedUpAt = new Date();
    if (body.status === 'delivered') {
      updateData.deliveredAt = new Date();
      // Cash orders are paid in cash AT delivery — flip paymentStatus now so
      // the order_payment journal can post downstream.
      const [pre] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
      if (pre && pre.paymentMethod !== 'paystack' && pre.paymentStatus !== 'paid') {
        updateData.paymentStatus = 'paid';
      }
    }
    if (body.callAccepted !== undefined) updateData.callAccepted = body.callAccepted;
    const [order] = await db.update(ordersTable).set(updateData).where(eq(ordersTable.id, id)).returning();
    if (!order) {
      res.status(404).json({ error: "not_found", message: "Order not found" });
      return;
    }

    // Side-effects: ledger postings on delivery completion.
    if (body.status === 'delivered') {
      try {
        // 1. Cash payment recognition (paystack orders already posted at create).
        if (order.paymentMethod !== 'paystack' && order.paymentStatus === 'paid') {
          await postOrderPayment({
            orderId: order.id,
            subtotal: parseFloat(order.subtotal),
            serviceFee: parseFloat(order.serviceFee),
            deliveryFee: parseFloat(order.deliveryFee),
            vatAmount: parseFloat(order.vatAmount),
            nhilAmount: parseFloat(order.nhilAmount),
            getfundAmount: parseFloat(order.getfundAmount),
            receivedInto: "cash",
            postedAt: order.deliveredAt ?? new Date(),
          });
        }
        // 2. Rider earning recognition. Type-aware:
        //    - in_house: skipped (salaried; platform keeps full fee as revenue).
        //    - independent: rider share = fee × (1 − global commission %); platform keeps the rest.
        if (order.riderId) {
          const [rider] = await db.select({ type: ridersTable.type }).from(ridersTable).where(eq(ridersTable.id, order.riderId)).limit(1);
          const [settings] = await db.select({ pct: financeSettingsTable.riderCommissionPercent }).from(financeSettingsTable).limit(1);
          await postRiderEarning({
            orderId: order.id,
            riderId: order.riderId,
            riderType: (rider?.type === "in_house" ? "in_house" : "independent"),
            amount: parseFloat(order.deliveryFee),
            commissionPercent: parseFloat(settings?.pct ?? "20"),
            postedAt: order.deliveredAt ?? new Date(),
          });
        }
      } catch (e) {
        console.error("[ledger] failed posting on delivery for order", order.id, e);
      }
    }

    res.json(await enrichOrder(order));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/assign-rider", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = AssignRiderBody.parse(req.body);
    const [order] = await db.update(ordersTable)
      .set({ riderId: body.riderId, riderAccepted: null, updatedAt: new Date() })
      .where(eq(ordersTable.id, id))
      .returning();
    if (!order) {
      res.status(404).json({ error: "not_found", message: "Order not found" });
      return;
    }
    res.json(await enrichOrder(order));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/rider-response", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { accepted } = req.body;
    if (typeof accepted !== "boolean") {
      res.status(400).json({ error: "bad_request", message: "accepted must be a boolean" });
      return;
    }
    let updateData: any;
    if (accepted) {
      updateData = { riderAccepted: true, riderAcceptedAt: new Date(), updatedAt: new Date() };
    } else {
      // Rider declined — unassign them so admin can reassign
      updateData = { riderId: null, riderAccepted: null, riderAcceptedAt: null, updatedAt: new Date() };
    }
    const [order] = await db.update(ordersTable)
      .set(updateData)
      .where(eq(ordersTable.id, id))
      .returning();
    if (!order) {
      res.status(404).json({ error: "not_found", message: "Order not found" });
      return;
    }
    res.json(await enrichOrder(order));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/assign-delivery-partner", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { deliveryPartnerId } = req.body;
    if (!deliveryPartnerId) {
      res.status(400).json({ error: "bad_request", message: "deliveryPartnerId is required" });
      return;
    }
    const [order] = await db.update(ordersTable)
      .set({ deliveryPartnerId: parseInt(deliveryPartnerId), updatedAt: new Date() })
      .where(eq(ordersTable.id, id))
      .returning();
    if (!order) {
      res.status(404).json({ error: "not_found", message: "Order not found" });
      return;
    }
    res.json(await enrichOrder(order));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.post("/:id/photo", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UploadOrderPhotoBody.parse(req.body);
    const updateData: any = { updatedAt: new Date() };
    if (body.photoType === "pickup") updateData.photoUrl = body.photoUrl;
    else updateData.deliveryPhotoUrl = body.photoUrl;
    const [order] = await db.update(ordersTable).set(updateData).where(eq(ordersTable.id, id)).returning();
    if (!order) {
      res.status(404).json({ error: "not_found", message: "Order not found" });
      return;
    }
    res.json(await enrichOrder(order));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
