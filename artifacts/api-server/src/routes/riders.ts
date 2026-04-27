import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import {
  ridersTable, ordersTable, riderPayoutsTable, financeSettingsTable,
} from "../../../../lib/db/src/schema/index.js";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { createHash } from "crypto";

const router: IRouter = Router();

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

function mapRider(r: typeof ridersTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    type: r.type ?? "independent",
    isAvailable: r.isAvailable,
    photoUrl: r.photoUrl,
    suspended: r.suspended,
    hasCustomPin: !!r.pin,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/", async (_req, res) => {
  const riders = await db.select().from(ridersTable).orderBy(ridersTable.createdAt);
  res.json(riders.map(mapRider));
});

router.post("/", async (req, res) => {
  try {
    const { name, phone, pin, type } = req.body;
    if (!name || !phone) {
      res.status(400).json({ error: "bad_request", message: "name and phone are required" });
      return;
    }
    const existing = await db.select().from(ridersTable).where(eq(ridersTable.phone, phone)).limit(1);
    if (existing.length > 0) {
      res.status(400).json({ error: "phone_exists", message: "Phone already registered" });
      return;
    }
    const riderType = type === "in_house" ? "in_house" : "independent";
    const [rider] = await db.insert(ridersTable).values({
      name,
      phone,
      pin: pin ? hashPin(pin) : null,
      type: riderType,
      isAvailable: true,
    }).returning();
    res.status(201).json(mapRider(rider));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, phone, isAvailable, type } = req.body;
    const [rider] = await db.update(ridersTable)
      .set({
        ...(name && { name }),
        ...(phone && { phone }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(type && (type === "in_house" || type === "independent") && { type }),
      })
      .where(eq(ridersTable.id, id))
      .returning();
    if (!rider) {
      res.status(404).json({ error: "not_found", message: "Rider not found" });
      return;
    }
    res.json(mapRider(rider));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/suspend", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { suspended } = req.body;
    const [rider] = await db.update(ridersTable)
      .set({ suspended: !!suspended })
      .where(eq(ridersTable.id, id))
      .returning();
    if (!rider) {
      res.status(404).json({ error: "not_found", message: "Rider not found" });
      return;
    }
    res.json(mapRider(rider));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/reset-pin", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { pin } = req.body;
    if (!pin || pin.length < 4) {
      res.status(400).json({ error: "bad_request", message: "PIN must be at least 4 digits" });
      return;
    }
    const [rider] = await db.update(ridersTable)
      .set({ pin: hashPin(pin) })
      .where(eq(ridersTable.id, id))
      .returning();
    if (!rider) {
      res.status(404).json({ error: "not_found", message: "Rider not found" });
      return;
    }
    res.json({ success: true, message: "PIN updated successfully" });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/photo", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { photoUrl } = req.body;
    const [rider] = await db.update(ridersTable)
      .set({ photoUrl: photoUrl ?? null })
      .where(eq(ridersTable.id, id))
      .returning();
    if (!rider) {
      res.status(404).json({ error: "not_found", message: "Rider not found" });
      return;
    }
    res.json(mapRider(rider));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

/**
 * GET /riders/stats — per-rider earnings + commission breakdown for the
 * admin Riders tab. Computes from orders + rider_payouts using the global
 * rider commission % from finance_settings.
 *
 * Response per rider: type, totalEarnings, commissionDeducted,
 * paystackHeld, cashHeld, pendingPayoutRequests.
 */
router.get("/stats", async (_req, res) => {
  try {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const riders = await db.select().from(ridersTable);
    const [fs] = await db.select().from(financeSettingsTable).limit(1);
    const globalRiderPct = parseFloat(fs?.riderCommissionPercent ?? "20");

    // Pull all delivered orders that have a rider assigned, in one round-trip.
    const deliveredRiderOrders = await db
      .select({
        riderId: ordersTable.riderId,
        deliveryFee: ordersTable.deliveryFee,
        paymentMethod: ordersTable.paymentMethod,
        riderPayoutId: ordersTable.riderPayoutId,
      })
      .from(ordersTable)
      .where(and(eq(ordersTable.status, "delivered"), sql`${ordersTable.riderId} IS NOT NULL`));

    // Pending payout-request counts grouped by rider.
    const pendingByRider = await db
      .select({ riderId: riderPayoutsTable.riderId, count: sql<number>`COUNT(*)::int` })
      .from(riderPayoutsTable)
      .where(eq(riderPayoutsTable.status, "pending"))
      .groupBy(riderPayoutsTable.riderId);
    const pendingMap = new Map(pendingByRider.map(r => [r.riderId, r.count]));

    const stats = riders.map(r => {
      const isInHouse = r.type === "in_house";
      let fullFeeTotal = 0;
      let paystackHeld = 0; // from card payments still held by platform (only meaningful for independent)
      let cashHeld = 0;     // collected on delivery, sitting with rider (independent)
      for (const o of deliveredRiderOrders) {
        if (o.riderId !== r.id) continue;
        const fee = parseFloat(o.deliveryFee ?? "0");
        fullFeeTotal += fee;
        if (!isInHouse && o.riderPayoutId === null) {
          // Rider's share for unsettled orders
          const share = round2(fee * (100 - globalRiderPct) / 100);
          if (o.paymentMethod === "paystack") paystackHeld += share;
          else cashHeld += share;
        }
      }
      const commissionDeducted = isInHouse ? fullFeeTotal : round2(fullFeeTotal * globalRiderPct / 100);
      const totalEarnings = isInHouse ? 0 : round2(fullFeeTotal * (100 - globalRiderPct) / 100);
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        type: r.type ?? "independent",
        isAvailable: r.isAvailable,
        suspended: r.suspended,
        photoUrl: r.photoUrl,
        totalEarnings,
        commissionDeducted,
        paystackHeld: round2(paystackHeld),
        cashHeld: round2(cashHeld),
        pendingPayoutRequests: pendingMap.get(r.id) ?? 0,
      };
    });
    res.json({ globalRiderCommissionPercent: globalRiderPct, riders: stats });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(ridersTable).where(eq(ridersTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
