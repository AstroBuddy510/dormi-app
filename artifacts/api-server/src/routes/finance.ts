import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  financeSettingsTable,
  deliveryZonesTable,
  deliveryTownsTable,
  ordersTable,
  vendorsTable,
  expensesTable,
  payrollPaymentsTable,
  deliveryPartnersTable,
} from "@workspace/db/schema";
import { eq, gte, lte, and, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const FinanceSettingsBody = z.object({
  vendorCommissionPercent: z.number().min(0).max(100),
  courierCommissionFixed: z.number().min(0),
  distanceRateCedisPerKm: z.number().min(0),
  distanceThresholdKm: z.number().min(0),
});

const ZoneBody = z.object({
  name: z.string().min(1),
  feeCedis: z.number().min(0),
});

// ─── Finance Settings ─────────────────────────────────────────────────────────

router.get("/settings", async (_req, res) => {
  let [settings] = await db.select().from(financeSettingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(financeSettingsTable).values({}).returning();
  }
  res.json(mapSettings(settings));
});

router.put("/settings", async (req, res) => {
  try {
    const body = FinanceSettingsBody.parse(req.body);
    let [settings] = await db.select().from(financeSettingsTable).limit(1);
    if (!settings) {
      [settings] = await db.insert(financeSettingsTable).values({
        vendorCommissionPercent: body.vendorCommissionPercent.toString(),
        courierCommissionFixed: body.courierCommissionFixed.toString(),
        distanceRateCedisPerKm: body.distanceRateCedisPerKm.toString(),
        distanceThresholdKm: body.distanceThresholdKm.toString(),
      }).returning();
    } else {
      [settings] = await db.update(financeSettingsTable)
        .set({
          vendorCommissionPercent: body.vendorCommissionPercent.toString(),
          courierCommissionFixed: body.courierCommissionFixed.toString(),
          distanceRateCedisPerKm: body.distanceRateCedisPerKm.toString(),
          distanceThresholdKm: body.distanceThresholdKm.toString(),
          updatedAt: new Date(),
        })
        .where(eq(financeSettingsTable.id, settings.id))
        .returning();
    }
    res.json(mapSettings(settings));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// ─── Delivery Zones ───────────────────────────────────────────────────────────

router.get("/zones", async (_req, res) => {
  const zones = await db.select().from(deliveryZonesTable).orderBy(deliveryZonesTable.name);
  res.json(zones.map(z => ({ id: z.id, name: z.name, feeCedis: parseFloat(z.feeCedis) })));
});

router.put("/zones/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = ZoneBody.partial().parse(req.body);
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.feeCedis !== undefined) updates.feeCedis = body.feeCedis.toString();
    const [zone] = await db.update(deliveryZonesTable).set(updates).where(eq(deliveryZonesTable.id, id)).returning();
    if (!zone) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ id: zone.id, name: zone.name, feeCedis: parseFloat(zone.feeCedis) });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.post("/zones", async (req, res) => {
  try {
    const body = ZoneBody.parse(req.body);
    const [zone] = await db.insert(deliveryZonesTable).values({
      name: body.name,
      feeCedis: body.feeCedis.toString(),
    }).returning();
    res.status(201).json({ id: zone.id, name: zone.name, feeCedis: parseFloat(zone.feeCedis) });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// ─── Delivery Towns ───────────────────────────────────────────────────────────

const TownBody = z.object({
  name: z.string().min(1),
  zoneId: z.number().int().nullable().optional(),
});

router.get("/towns", async (_req, res) => {
  const towns = await db.select().from(deliveryTownsTable).orderBy(deliveryTownsTable.name);
  const zones = await db.select().from(deliveryZonesTable);
  const zoneMap: Record<number, { name: string; feeCedis: number }> = {};
  zones.forEach(z => { zoneMap[z.id] = { name: z.name, feeCedis: parseFloat(z.feeCedis) }; });
  res.json(towns.map(t => ({
    id: t.id,
    name: t.name,
    zoneId: t.zoneId,
    zoneName: t.zoneId ? (zoneMap[t.zoneId]?.name ?? null) : null,
    feeCedis: t.zoneId ? (zoneMap[t.zoneId]?.feeCedis ?? null) : null,
  })));
});

router.post("/towns", async (req, res) => {
  try {
    const body = TownBody.parse(req.body);
    const [town] = await db.insert(deliveryTownsTable).values({
      name: body.name,
      zoneId: body.zoneId ?? null,
    }).returning();
    res.status(201).json({ id: town.id, name: town.name, zoneId: town.zoneId });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/towns/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = TownBody.partial().parse(req.body);
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if ("zoneId" in body) updates.zoneId = body.zoneId ?? null;
    const [town] = await db.update(deliveryTownsTable).set(updates).where(eq(deliveryTownsTable.id, id)).returning();
    if (!town) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ id: town.id, name: town.name, zoneId: town.zoneId });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/towns/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(deliveryTownsTable).where(eq(deliveryTownsTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// ─── Finance Dashboard Stats ──────────────────────────────────────────────────

router.get("/stats", async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    const orderConditions: any[] = [eq(ordersTable.status, "delivered")];
    if (from) orderConditions.push(gte(ordersTable.deliveredAt, new Date(from)));
    if (to) orderConditions.push(lte(ordersTable.deliveredAt, new Date(to)));

    const expenseConditions: any[] = [];
    if (from) expenseConditions.push(gte(expensesTable.expenseDate, from.slice(0, 10)));
    if (to) expenseConditions.push(lte(expensesTable.expenseDate, to.slice(0, 10)));

    const deliveredOrders = await db
      .select({
        id: ordersTable.id,
        subtotal: ordersTable.subtotal,
        serviceFee: ordersTable.serviceFee,
        deliveryFee: ordersTable.deliveryFee,
        total: ordersTable.total,
        paymentMethod: ordersTable.paymentMethod,
        vendorId: ordersTable.vendorId,
        riderId: ordersTable.riderId,
        deliveryPartnerId: ordersTable.deliveryPartnerId,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(and(...orderConditions));

    const vendors = await db.select({ id: vendorsTable.id, commissionPercent: vendorsTable.commissionPercent }).from(vendorsTable);
    const vendorCommissionMap: Record<number, number> = {};
    vendors.forEach(v => { if (v.id) vendorCommissionMap[v.id] = parseFloat(v.commissionPercent ?? "5"); });

    const partners = await db.select({ id: deliveryPartnersTable.id, commissionPercent: deliveryPartnersTable.commissionPercent }).from(deliveryPartnersTable);
    const partnerCommissionMap: Record<number, number> = {};
    partners.forEach(p => { if (p.id) partnerCommissionMap[p.id] = parseFloat(p.commissionPercent); });

    const [financeSettings] = await db.select().from(financeSettingsTable).limit(1);
    const globalVendorCommission = financeSettings ? parseFloat(financeSettings.vendorCommissionPercent) : 5;

    // ── Net Revenue formula (same as Admin dashboard) ──────────────────────
    // Service fee: all delivered orders
    // In-house delivery: full fee for orders with our rider (no third-party partner)
    // Third-party commission: our % of fee for orders routed to external partners
    // Vendor commission: vendor's % of subtotal for vendor-sourced orders
    let serviceChargeRevenue = 0;
    let inHouseDeliveryRevenue = 0;
    let thirdPartyCommissionRevenue = 0;
    let vendorCommissionRevenue = 0;
    let cashRevenue = 0;
    let paystackRevenue = 0;

    for (const order of deliveredOrders) {
      const serviceFee = parseFloat(order.serviceFee);
      const deliveryFee = parseFloat(order.deliveryFee);
      const subtotal = parseFloat(order.subtotal);
      const total = parseFloat(order.total);

      serviceChargeRevenue += serviceFee;

      if (order.deliveryPartnerId) {
        const rate = (partnerCommissionMap[order.deliveryPartnerId] ?? 0) / 100;
        thirdPartyCommissionRevenue += deliveryFee * rate;
      } else if (order.riderId) {
        inHouseDeliveryRevenue += deliveryFee;
      }

      if (order.vendorId) {
        const commPct = vendorCommissionMap[order.vendorId] ?? globalVendorCommission;
        vendorCommissionRevenue += (subtotal * commPct) / 100;
      }

      if (order.paymentMethod === "cash") cashRevenue += total;
      else paystackRevenue += total;
    }

    const expenses = expenseConditions.length
      ? await db.select().from(expensesTable).where(and(...expenseConditions))
      : await db.select().from(expensesTable);

    const payrollPayments = await db.select().from(payrollPaymentsTable);

    let totalExpenses = 0;
    let utilitiesExpenses = 0;
    const expenseByType: Record<string, number> = {};
    for (const exp of expenses) {
      const amt = parseFloat(exp.amount);
      totalExpenses += amt;
      if (exp.category === "utilities") utilitiesExpenses += amt;
      expenseByType[exp.type] = (expenseByType[exp.type] ?? 0) + amt;
    }

    let totalPayroll = 0;
    for (const p of payrollPayments) totalPayroll += parseFloat(p.amount);

    const totalRevenue = serviceChargeRevenue + inHouseDeliveryRevenue + thirdPartyCommissionRevenue + vendorCommissionRevenue;
    const netProfit = totalRevenue - totalExpenses - totalPayroll;
    const utilitiesFlag = totalRevenue > 0 && utilitiesExpenses / totalRevenue > 0.2;

    res.json({
      serviceChargeRevenue: round2(serviceChargeRevenue),
      deliveryFeeRevenue: round2(inHouseDeliveryRevenue),
      vendorCommissionRevenue: round2(vendorCommissionRevenue),
      courierCommissionRevenue: round2(thirdPartyCommissionRevenue),
      totalRevenue: round2(totalRevenue),
      cashBalance: round2(cashRevenue),
      paystackBalance: round2(paystackRevenue),
      totalExpenses: round2(totalExpenses),
      utilitiesExpenses: round2(utilitiesExpenses),
      utilitiesFlag,
      totalPayroll: round2(totalPayroll),
      netProfit: round2(netProfit),
      ordersCount: deliveredOrders.length,
      expenseByType,
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// ─── CSV Export ───────────────────────────────────────────────────────────────

router.get("/export/csv", async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const orderConditions: any[] = [eq(ordersTable.status, "delivered")];
    if (from) orderConditions.push(gte(ordersTable.deliveredAt, new Date(from)));
    if (to) orderConditions.push(lte(ordersTable.deliveredAt, new Date(to)));

    const orders = await db.select().from(ordersTable).where(and(...orderConditions));
    const expenseConditions: any[] = [];
    if (from) expenseConditions.push(gte(expensesTable.expenseDate, from.slice(0, 10)));
    if (to) expenseConditions.push(lte(expensesTable.expenseDate, to.slice(0, 10)));
    const expenses = expenseConditions.length
      ? await db.select().from(expensesTable).where(and(...expenseConditions))
      : await db.select().from(expensesTable);

    const [settings] = await db.select().from(financeSettingsTable).limit(1);
    const globalComm = settings ? parseFloat(settings.vendorCommissionPercent) : 5;
    const courierComm = settings ? parseFloat(settings.courierCommissionFixed) : 10;

    const vendors = await db.select({ id: vendorsTable.id, commissionPercent: vendorsTable.commissionPercent }).from(vendorsTable);
    const vendorCommMap: Record<number, number> = {};
    vendors.forEach(v => { if (v.id && v.commissionPercent) vendorCommMap[v.id] = parseFloat(v.commissionPercent); });

    const lines: string[] = [
      "Section,Date,Description,Service Charge,Delivery Fee,Vendor Commission,Courier Commission,Payment Method,Total",
    ];

    for (const o of orders) {
      const subtotal = parseFloat(o.subtotal);
      const vendComm = o.vendorId ? (subtotal * (vendorCommMap[o.vendorId] ?? globalComm)) / 100 : 0;
      const courierComms = o.orderType === "third_party" ? courierComm : 0;
      lines.push([
        "Order",
        new Date(o.deliveredAt!).toISOString().slice(0, 10),
        `Order #${o.id}`,
        parseFloat(o.serviceFee).toFixed(2),
        parseFloat(o.deliveryFee).toFixed(2),
        vendComm.toFixed(2),
        courierComms.toFixed(2),
        o.paymentMethod,
        parseFloat(o.total).toFixed(2),
      ].map(v => `"${v}"`).join(","));
    }

    lines.push("");
    lines.push("Section,Date,Type,Category,Amount,Notes");
    for (const e of expenses) {
      lines.push([
        "Expense",
        e.expenseDate,
        e.type,
        e.category,
        parseFloat(e.amount).toFixed(2),
        e.notes ?? "",
      ].map(v => `"${v}"`).join(","));
    }

    const dateTag = from ? `_${from.slice(0, 10)}` : "";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="finance_report${dateTag}.csv"`);
    res.send(lines.join("\n"));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

function mapSettings(s: typeof financeSettingsTable.$inferSelect) {
  return {
    id: s.id,
    vendorCommissionPercent: parseFloat(s.vendorCommissionPercent),
    courierCommissionFixed: parseFloat(s.courierCommissionFixed),
    distanceRateCedisPerKm: parseFloat(s.distanceRateCedisPerKm),
    distanceThresholdKm: parseFloat(s.distanceThresholdKm),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export default router;
