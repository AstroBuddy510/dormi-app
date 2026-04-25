import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import {
  payoutsTable,
  ordersTable,
  vendorsTable,
} from "../../../../lib/db/src/schema/index.js";
import { eq, and, isNull, desc, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { postVendorPayout } from "../lib/ledger.js";

const router: IRouter = Router();

// Canonical set of order statuses that the platform has actually fulfilled
// and for which the vendor is owed their net share. Cancelled/rejected/
// pending orders are never paid out.
const PAYABLE_STATUSES = ["delivered"] as const;

// Payment method strings stored in orders.paymentMethod
const PM_PAYSTACK = "paystack";
const PM_CASH = "cash_on_delivery";

// ─── Vendor-facing routes ─────────────────────────────────────────────────────
//
// GET /breakdown?vendorId=X
//   Returns the three KPIs the vendor dashboard's "Payout Breakdown" card
//   needs: lifetime Total Earnings, Paystack portion, Cash portion — plus
//   the currently-unpaid amount that "Request Payout" would snapshot.
//
router.get("/breakdown", async (req, res) => {
  try {
    const vid = parseInt(req.query.vendorId as string);
    if (!Number.isFinite(vid)) {
      res.status(400).json({ error: "bad_request", message: "vendorId required" });
      return;
    }

    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vid));
    if (!vendor) {
      res.status(404).json({ error: "not_found", message: "Vendor not found" });
      return;
    }
    const commissionPercent = parseFloat(vendor.commissionPercent ?? "5");
    const vendorShareFactor = (100 - commissionPercent) / 100;

    // Fetch every payable order for this vendor (lifetime). We need payment
    // method + vendorPayoutId to compute both the lifetime split and the
    // currently-unpaid balance in one pass.
    const orders = await db
      .select({
        subtotal: ordersTable.subtotal,
        paymentMethod: ordersTable.paymentMethod,
        vendorPayoutId: ordersTable.vendorPayoutId,
      })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.vendorId, vid),
        inArray(ordersTable.status, [...PAYABLE_STATUSES]),
      ));

    let lifetimePaystack = 0;
    let lifetimeCash = 0;
    let pendingPaystack = 0;
    let pendingCash = 0;
    let pendingOrderCount = 0;

    for (const o of orders) {
      const subtotal = parseFloat(o.subtotal ?? "0");
      const earning = subtotal * vendorShareFactor;
      const isPaystack = o.paymentMethod === PM_PAYSTACK;

      if (isPaystack) lifetimePaystack += earning; else lifetimeCash += earning;

      // Orders with vendorPayoutId IS NULL have never been rolled into a
      // payout request yet. Those are what Request Payout will cover.
      if (o.vendorPayoutId === null) {
        if (isPaystack) pendingPaystack += earning; else pendingCash += earning;
        pendingOrderCount += 1;
      }
    }

    // Count-in-flight: already-requested but not yet paid
    const pendingPayouts = await db
      .select({
        totalAmount: payoutsTable.totalAmount,
        paystackPortion: payoutsTable.paystackPortion,
        cashPortion: payoutsTable.cashPortion,
      })
      .from(payoutsTable)
      .where(and(eq(payoutsTable.vendorId, vid), eq(payoutsTable.status, "pending")));

    let inFlightTotal = 0;
    let inFlightPaystack = 0;
    let inFlightCash = 0;
    for (const p of pendingPayouts) {
      inFlightTotal += parseFloat(p.totalAmount ?? "0");
      inFlightPaystack += parseFloat(p.paystackPortion ?? "0");
      inFlightCash += parseFloat(p.cashPortion ?? "0");
    }

    res.json({
      vendorId: vid,
      commissionPercent,
      totalEarnings: round2(lifetimePaystack + lifetimeCash),
      paystackPortion: round2(lifetimePaystack),
      cashPortion: round2(lifetimeCash),
      unpaid: {
        total: round2(pendingPaystack + pendingCash),
        paystack: round2(pendingPaystack),
        cash: round2(pendingCash),
        orderCount: pendingOrderCount,
      },
      inFlight: {
        total: round2(inFlightTotal),
        paystack: round2(inFlightPaystack),
        cash: round2(inFlightCash),
        requestCount: pendingPayouts.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /mine?vendorId=X
// Vendor-facing list of their own past payout requests.
router.get("/mine", async (req, res) => {
  try {
    const vid = parseInt(req.query.vendorId as string);
    if (!Number.isFinite(vid)) {
      res.status(400).json({ error: "bad_request", message: "vendorId required" });
      return;
    }
    const rows = await db.select().from(payoutsTable)
      .where(eq(payoutsTable.vendorId, vid))
      .orderBy(desc(payoutsTable.requestedAt));
    res.json(rows.map(mapPayout));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

const CreatePayoutBody = z.object({
  vendorId: z.number().int(),
  notes: z.string().optional(),
});

// POST /request
// Vendor requests a payout for all their currently-unpaid delivered orders.
// Snapshots the amount and claims the orders so they can't be included again.
router.post("/request", async (req, res) => {
  try {
    const { vendorId, notes } = CreatePayoutBody.parse(req.body);

    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
    if (!vendor) {
      res.status(404).json({ error: "not_found", message: "Vendor not found" });
      return;
    }
    const commissionPercent = parseFloat(vendor.commissionPercent ?? "5");
    const vendorShareFactor = (100 - commissionPercent) / 100;

    // Find every unpaid, payable order for this vendor.
    const unpaidOrders = await db.select({
      id: ordersTable.id,
      subtotal: ordersTable.subtotal,
      paymentMethod: ordersTable.paymentMethod,
    }).from(ordersTable).where(and(
      eq(ordersTable.vendorId, vendorId),
      inArray(ordersTable.status, [...PAYABLE_STATUSES]),
      isNull(ordersTable.vendorPayoutId),
    ));

    if (unpaidOrders.length === 0) {
      res.status(400).json({ error: "no_unpaid_earnings", message: "No unpaid earnings to payout." });
      return;
    }

    let paystack = 0;
    let cash = 0;
    for (const o of unpaidOrders) {
      const earning = parseFloat(o.subtotal ?? "0") * vendorShareFactor;
      if (o.paymentMethod === PM_PAYSTACK) paystack += earning; else cash += earning;
    }
    const total = paystack + cash;

    // Create the payout, then claim the orders with its id. Doing it in that
    // order means if the UPDATE fails the payout row exists with no attached
    // orders — but the amounts are snapshot correctly so admin still sees
    // the dollar figure. Re-requests would double-count though, so we do the
    // UPDATE inside a transaction.
    const payout = await db.transaction(async (tx) => {
      const [row] = await tx.insert(payoutsTable).values({
        vendorId,
        totalAmount: round2(total).toString(),
        paystackPortion: round2(paystack).toString(),
        cashPortion: round2(cash).toString(),
        orderCount: unpaidOrders.length,
        status: "pending",
        notes: notes ?? null,
      }).returning();

      await tx.update(ordersTable)
        .set({ vendorPayoutId: row.id, updatedAt: new Date() })
        .where(inArray(ordersTable.id, unpaidOrders.map(o => o.id)));

      return row;
    });

    res.status(201).json(mapPayout(payout));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// ─── Admin-facing routes ──────────────────────────────────────────────────────

// GET /admin/list — every payout request with vendor info. Optional ?status=pending|paid
router.get("/admin/list", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;

    const rows = await db.select({
      id: payoutsTable.id,
      vendorId: payoutsTable.vendorId,
      vendorName: vendorsTable.name,
      vendorPhone: vendorsTable.phone,
      totalAmount: payoutsTable.totalAmount,
      paystackPortion: payoutsTable.paystackPortion,
      cashPortion: payoutsTable.cashPortion,
      orderCount: payoutsTable.orderCount,
      status: payoutsTable.status,
      notes: payoutsTable.notes,
      requestedAt: payoutsTable.requestedAt,
      paidAt: payoutsTable.paidAt,
    }).from(payoutsTable)
      .leftJoin(vendorsTable, eq(payoutsTable.vendorId, vendorsTable.id))
      .where(status ? eq(payoutsTable.status, status) : undefined)
      .orderBy(desc(payoutsTable.requestedAt));

    res.json(rows.map(r => ({
      id: r.id,
      vendorId: r.vendorId,
      vendorName: r.vendorName ?? `Vendor #${r.vendorId}`,
      vendorPhone: r.vendorPhone,
      totalAmount: parseFloat(r.totalAmount ?? "0"),
      paystackPortion: parseFloat(r.paystackPortion ?? "0"),
      cashPortion: parseFloat(r.cashPortion ?? "0"),
      orderCount: r.orderCount,
      status: r.status,
      notes: r.notes,
      requestedAt: r.requestedAt,
      paidAt: r.paidAt,
    })));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /admin/stats — two-card summary for the admin Payouts page
router.get("/admin/stats", async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const pending = await db
      .select({ sum: sql<string>`COALESCE(SUM(${payoutsTable.totalAmount}), 0)`, count: sql<number>`COUNT(*)::int` })
      .from(payoutsTable)
      .where(eq(payoutsTable.status, "pending"));

    const paidThisMonth = await db
      .select({
        sum: sql<string>`COALESCE(SUM(${payoutsTable.totalAmount}), 0)`,
        paystack: sql<string>`COALESCE(SUM(${payoutsTable.paystackPortion}), 0)`,
        cash: sql<string>`COALESCE(SUM(${payoutsTable.cashPortion}), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(payoutsTable)
      .where(and(
        eq(payoutsTable.status, "paid"),
        gte(payoutsTable.paidAt, startOfMonth),
      ));

    res.json({
      pending: {
        total: parseFloat(pending[0]?.sum ?? "0"),
        count: pending[0]?.count ?? 0,
      },
      paidThisMonth: {
        total: parseFloat(paidThisMonth[0]?.sum ?? "0"),
        paystack: parseFloat(paidThisMonth[0]?.paystack ?? "0"),
        cash: parseFloat(paidThisMonth[0]?.cash ?? "0"),
        count: paidThisMonth[0]?.count ?? 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// PATCH /admin/:id/pay — mark a pending payout as paid
router.patch("/admin/:id/pay", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Payout not found" });
      return;
    }
    if (existing.status === "paid") {
      res.status(400).json({ error: "already_paid", message: "This payout is already marked paid." });
      return;
    }
    const [row] = await db.update(payoutsTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(payoutsTable.id, id))
      .returning();

    // Post vendor_payout journal: DR Vendor payable / CR Bank.
    try {
      await postVendorPayout({
        payoutId: row.id,
        vendorId: row.vendorId,
        amount: parseFloat(row.totalAmount ?? "0"),
        paidFrom: "bank",
        postedAt: row.paidAt ?? new Date(),
      });
    } catch (e) {
      console.error("[ledger] failed posting vendor_payout for payout", row.id, e);
    }

    res.json(mapPayout(row));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function mapPayout(p: typeof payoutsTable.$inferSelect) {
  return {
    id: p.id,
    vendorId: p.vendorId,
    totalAmount: parseFloat(p.totalAmount ?? "0"),
    paystackPortion: parseFloat(p.paystackPortion ?? "0"),
    cashPortion: parseFloat(p.cashPortion ?? "0"),
    orderCount: p.orderCount,
    status: p.status,
    notes: p.notes,
    requestedAt: p.requestedAt,
    paidAt: p.paidAt,
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export default router;
