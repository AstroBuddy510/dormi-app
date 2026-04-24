import { Router } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { ordersTable, vendorsTable } from "../../../../lib/db/src/index.js";
import { eq, and, gte, lt, notInArray, sql } from "drizzle-orm";

const router = Router();

router.get("/stats", async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId) {
      res.status(400).json({ error: "bad_request", message: "vendorId required" });
      return;
    }
    const vid = parseInt(vendorId as string);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const allOrders = await db.select().from(ordersTable)
      .where(eq(ordersTable.vendorId, vid));

    const todayOrders = allOrders.filter(o => new Date(o.createdAt) >= startOfToday);
    const weekOrders = allOrders.filter(o => new Date(o.createdAt) >= startOfWeek);
    const monthOrders = allOrders.filter(o => new Date(o.createdAt) >= startOfMonth);

    const completedAll = allOrders.filter(o => o.status === 'delivered');
    const completedMonth = monthOrders.filter(o => o.status === 'delivered');

    const pendingCount = allOrders.filter(o => o.status === 'pending').length;
    const acceptedCount = allOrders.filter(o => o.status === 'accepted').length;
    const readyCount = allOrders.filter(o => o.status === 'ready').length;

    const totalSubtotal = completedAll.reduce((sum, o) => sum + parseFloat(o.subtotal ?? '0'), 0);
    const monthSubtotal = completedMonth.reduce((sum, o) => sum + parseFloat(o.subtotal ?? '0'), 0);

    const processedOrders = allOrders.filter(o => o.status === 'accepted' || o.status === 'ready' || o.status === 'delivered');
    const acceptanceRate = allOrders.length > 0
      ? Math.round((processedOrders.length / allOrders.length) * 100)
      : 100;

    res.json({
      ordersToday: todayOrders.length,
      ordersThisWeek: weekOrders.length,
      ordersThisMonth: monthOrders.length,
      totalCompleted: completedAll.length,
      completedThisMonth: completedMonth.length,
      pendingCount,
      acceptedCount,
      readyCount,
      totalSubtotal,
      monthSubtotal,
      acceptanceRate,
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// ─── Sales overview (per-vendor only) ─────────────────────────────────────────
//
// Returns sales + commission for a single vendor within [from, to] (inclusive).
// "Sales" counts every order except cancelled/rejected — gives the vendor a
// pipeline view of the business they've taken in for the period.
// Commission is computed as subtotal * vendor.commissionPercent / 100.
//
// Query params:
//   vendorId – required
//   from     – YYYY-MM-DD (inclusive)
//   to       – YYYY-MM-DD (inclusive)
router.get("/overview", async (req, res) => {
  try {
    const { vendorId, from, to } = req.query;
    if (!vendorId || !from || !to) {
      res.status(400).json({ error: "bad_request", message: "vendorId, from, and to are required" });
      return;
    }
    const vid = parseInt(vendorId as string);
    if (!Number.isFinite(vid)) {
      res.status(400).json({ error: "bad_request", message: "vendorId must be numeric" });
      return;
    }

    // Parse dates. We treat them as local-day boundaries and turn "to" into
    // an exclusive next-day upper bound so the entire "to" day is included.
    const fromDate = new Date(`${from}T00:00:00`);
    const toBoundary = new Date(`${to}T00:00:00`);
    toBoundary.setDate(toBoundary.getDate() + 1);
    if (isNaN(fromDate.getTime()) || isNaN(toBoundary.getTime()) || fromDate >= toBoundary) {
      res.status(400).json({ error: "bad_request", message: "Invalid date range" });
      return;
    }

    // Ensure the vendor exists & grab their current commission rate
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vid));
    if (!vendor) {
      res.status(404).json({ error: "not_found", message: "Vendor not found" });
      return;
    }
    const commissionPercent = parseFloat(vendor.commissionPercent ?? "5");

    // All this vendor's orders in range, excluding cancelled/rejected
    const orders = await db.select({
      createdAt: ordersTable.createdAt,
      subtotal: ordersTable.subtotal,
      status: ordersTable.status,
    }).from(ordersTable).where(and(
      eq(ordersTable.vendorId, vid),
      gte(ordersTable.createdAt, fromDate),
      lt(ordersTable.createdAt, toBoundary),
      notInArray(ordersTable.status, ["cancelled", "rejected"]),
    ));

    // Bucket by local calendar day (YYYY-MM-DD). Ghana is UTC+0 year-round so
    // toISOString's date portion is fine. Pre-seed every day in range so the
    // chart shows zero-bars for days with no orders.
    const toKey = (d: Date) => d.toISOString().slice(0, 10);
    const daily = new Map<string, { sales: number; commission: number; orders: number }>();
    for (
      let cursor = new Date(fromDate);
      cursor < toBoundary;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      daily.set(toKey(cursor), { sales: 0, commission: 0, orders: 0 });
    }

    let totalSales = 0;
    for (const o of orders) {
      const subtotal = parseFloat(o.subtotal ?? "0");
      const commission = (subtotal * commissionPercent) / 100;
      const key = toKey(new Date(o.createdAt));
      const bucket = daily.get(key);
      if (bucket) {
        bucket.sales += subtotal;
        bucket.commission += commission;
        bucket.orders += 1;
      }
      totalSales += subtotal;
    }
    const totalCommission = (totalSales * commissionPercent) / 100;

    res.json({
      vendorId: vid,
      commissionPercent,
      from: from,
      to: to,
      orderCount: orders.length,
      totalSales: Math.round(totalSales * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      daily: Array.from(daily.entries())
        .map(([date, v]) => ({
          date,
          sales: Math.round(v.sales * 100) / 100,
          commission: Math.round(v.commission * 100) / 100,
          orders: v.orders,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

export default router;
