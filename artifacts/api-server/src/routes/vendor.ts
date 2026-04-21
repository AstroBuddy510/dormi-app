import { Router } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { ordersTable } from "../../../../lib/db/src/index.js";
import { eq, and, gte, sql } from "drizzle-orm";

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

export default router;
