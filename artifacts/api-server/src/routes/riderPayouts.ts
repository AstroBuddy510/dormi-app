import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import {
  riderPayoutsTable,
  ordersTable,
  ridersTable,
  financeSettingsTable,
} from "../../../../lib/db/src/schema/index.js";
import { eq, and, isNull, desc, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { postRiderPayout } from "../lib/ledger.js";

/**
 * Rider payouts — mirror of the vendor flow for INDEPENDENT riders only.
 * In-house riders are salaried (paid via payroll); they never appear here.
 *
 * Earning calculation per delivered order:
 *   independent: deliveryFee × (1 − global rider commission %)
 *   in_house:    0 (skipped — paid through payroll instead)
 *
 * Same shape as vendor payouts: totalAmount, paystackPortion (held by
 * platform from card payments — owed to rider), cashPortion (rider
 * already collected; included for reconciliation).
 */

const router: IRouter = Router();

const PAYABLE_STATUSES = ["delivered"] as const;
const PM_PAYSTACK = "paystack";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Independent rider's net per delivered order. */
function riderShare(deliveryFee: number, commissionPct: number): number {
  const pct = Math.max(0, Math.min(100, commissionPct));
  return round2(deliveryFee * (100 - pct) / 100);
}

async function getGlobalRiderCommission(): Promise<number> {
  const [s] = await db.select().from(financeSettingsTable).limit(1);
  return parseFloat(s?.riderCommissionPercent ?? "20");
}

// ─── Rider-facing routes ─────────────────────────────────────────────────────

router.get("/breakdown", async (req, res) => {
  try {
    const rid = parseInt(req.query.riderId as string);
    if (!Number.isFinite(rid)) {
      res.status(400).json({ error: "bad_request", message: "riderId required" });
      return;
    }

    const [rider] = await db.select().from(ridersTable).where(eq(ridersTable.id, rid));
    if (!rider) { res.status(404).json({ error: "not_found", message: "Rider not found" }); return; }

    if (rider.type === "in_house") {
      res.json({
        riderId: rid,
        riderType: "in_house",
        commissionPercent: 0,
        message: "In-house riders are paid via payroll, not the rider-payout flow.",
        totalEarnings: 0,
        paystackPortion: 0,
        cashPortion: 0,
        unpaid: { total: 0, paystack: 0, cash: 0, orderCount: 0 },
        inFlight: { total: 0, paystack: 0, cash: 0, requestCount: 0 },
      });
      return;
    }

    const commissionPercent = await getGlobalRiderCommission();

    const orders = await db
      .select({
        deliveryFee: ordersTable.deliveryFee,
        paymentMethod: ordersTable.paymentMethod,
        riderPayoutId: ordersTable.riderPayoutId,
      })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.riderId, rid),
        inArray(ordersTable.status, [...PAYABLE_STATUSES]),
      ));

    let lifetimePaystack = 0;
    let lifetimeCash = 0;
    let pendingPaystack = 0;
    let pendingCash = 0;
    let pendingOrderCount = 0;
    for (const o of orders) {
      const fee = parseFloat(o.deliveryFee ?? "0");
      const earning = riderShare(fee, commissionPercent);
      const isPaystack = o.paymentMethod === PM_PAYSTACK;
      if (isPaystack) lifetimePaystack += earning; else lifetimeCash += earning;
      if (o.riderPayoutId === null) {
        if (isPaystack) pendingPaystack += earning; else pendingCash += earning;
        pendingOrderCount += 1;
      }
    }

    const pendingPayouts = await db
      .select({
        totalAmount: riderPayoutsTable.totalAmount,
        paystackPortion: riderPayoutsTable.paystackPortion,
        cashPortion: riderPayoutsTable.cashPortion,
      })
      .from(riderPayoutsTable)
      .where(and(eq(riderPayoutsTable.riderId, rid), eq(riderPayoutsTable.status, "pending")));
    let inFlightTotal = 0, inFlightPaystack = 0, inFlightCash = 0;
    for (const p of pendingPayouts) {
      inFlightTotal += parseFloat(p.totalAmount ?? "0");
      inFlightPaystack += parseFloat(p.paystackPortion ?? "0");
      inFlightCash += parseFloat(p.cashPortion ?? "0");
    }

    res.json({
      riderId: rid,
      riderType: "independent",
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

router.get("/mine", async (req, res) => {
  try {
    const rid = parseInt(req.query.riderId as string);
    if (!Number.isFinite(rid)) { res.status(400).json({ error: "bad_request" }); return; }
    const rows = await db.select().from(riderPayoutsTable)
      .where(eq(riderPayoutsTable.riderId, rid))
      .orderBy(desc(riderPayoutsTable.requestedAt));
    res.json(rows.map(mapPayout));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

const CreatePayoutBody = z.object({
  riderId: z.number().int(),
  notes: z.string().optional(),
});

router.post("/request", async (req, res) => {
  try {
    const { riderId, notes } = CreatePayoutBody.parse(req.body);

    const [rider] = await db.select().from(ridersTable).where(eq(ridersTable.id, riderId));
    if (!rider) { res.status(404).json({ error: "not_found" }); return; }
    if (rider.type === "in_house") {
      res.status(400).json({ error: "bad_request", message: "In-house riders are paid via payroll, not payout requests." });
      return;
    }

    const commissionPercent = await getGlobalRiderCommission();

    const unpaidOrders = await db.select({
      id: ordersTable.id,
      deliveryFee: ordersTable.deliveryFee,
      paymentMethod: ordersTable.paymentMethod,
    }).from(ordersTable).where(and(
      eq(ordersTable.riderId, riderId),
      inArray(ordersTable.status, [...PAYABLE_STATUSES]),
      isNull(ordersTable.riderPayoutId),
    ));

    if (unpaidOrders.length === 0) {
      res.status(400).json({ error: "no_unpaid_earnings", message: "No unpaid earnings to payout." });
      return;
    }

    let paystack = 0, cash = 0;
    for (const o of unpaidOrders) {
      const earning = riderShare(parseFloat(o.deliveryFee ?? "0"), commissionPercent);
      if (o.paymentMethod === PM_PAYSTACK) paystack += earning; else cash += earning;
    }
    const total = paystack + cash;

    const payout = await db.transaction(async (tx) => {
      const [row] = await tx.insert(riderPayoutsTable).values({
        riderId,
        totalAmount: round2(total).toString(),
        paystackPortion: round2(paystack).toString(),
        cashPortion: round2(cash).toString(),
        orderCount: unpaidOrders.length,
        status: "pending",
        notes: notes ?? null,
      }).returning();

      await tx.update(ordersTable)
        .set({ riderPayoutId: row.id, updatedAt: new Date() })
        .where(inArray(ordersTable.id, unpaidOrders.map(o => o.id)));
      return row;
    });

    res.status(201).json(mapPayout(payout));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// ─── Admin-facing routes ─────────────────────────────────────────────────────

router.get("/admin/list", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const rows = await db.select({
      id: riderPayoutsTable.id,
      riderId: riderPayoutsTable.riderId,
      riderName: ridersTable.name,
      riderPhone: ridersTable.phone,
      totalAmount: riderPayoutsTable.totalAmount,
      paystackPortion: riderPayoutsTable.paystackPortion,
      cashPortion: riderPayoutsTable.cashPortion,
      orderCount: riderPayoutsTable.orderCount,
      status: riderPayoutsTable.status,
      notes: riderPayoutsTable.notes,
      requestedAt: riderPayoutsTable.requestedAt,
      paidAt: riderPayoutsTable.paidAt,
    }).from(riderPayoutsTable)
      .leftJoin(ridersTable, eq(riderPayoutsTable.riderId, ridersTable.id))
      .where(status ? eq(riderPayoutsTable.status, status) : undefined)
      .orderBy(desc(riderPayoutsTable.requestedAt));
    res.json(rows.map(r => ({
      id: r.id,
      riderId: r.riderId,
      riderName: r.riderName ?? `Rider #${r.riderId}`,
      riderPhone: r.riderPhone,
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

router.patch("/admin/:id/pay", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(riderPayoutsTable).where(eq(riderPayoutsTable.id, id));
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    if (existing.status === "paid") {
      res.status(400).json({ error: "already_paid" });
      return;
    }
    const [row] = await db.update(riderPayoutsTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(riderPayoutsTable.id, id))
      .returning();
    try {
      await postRiderPayout({
        payoutId: row.id,
        riderId: row.riderId,
        amount: parseFloat(row.totalAmount ?? "0"),
        paidFrom: "bank",
        postedAt: row.paidAt ?? new Date(),
      });
    } catch (e) {
      console.error("[ledger] failed posting rider_payout for payout", row.id, e);
    }
    res.json(mapPayout(row));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

function mapPayout(p: typeof riderPayoutsTable.$inferSelect) {
  return {
    id: p.id,
    riderId: p.riderId,
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

export default router;
