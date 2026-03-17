import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ridersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

const router: IRouter = Router();

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

router.get("/", async (_req, res) => {
  const riders = await db.select().from(ridersTable);
  res.json(riders.map(r => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    isAvailable: r.isAvailable,
  })));
});

router.post("/", async (req, res) => {
  try {
    const { name, phone, pin } = req.body;
    if (!name || !phone) {
      res.status(400).json({ error: "bad_request", message: "name and phone are required" });
      return;
    }
    const existing = await db.select().from(ridersTable).where(eq(ridersTable.phone, phone)).limit(1);
    if (existing.length > 0) {
      res.status(400).json({ error: "phone_exists", message: "Phone already registered" });
      return;
    }
    const [rider] = await db.insert(ridersTable).values({
      name,
      phone,
      pin: pin ? hashPin(pin) : null,
      isAvailable: true,
    }).returning();
    res.status(201).json({
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      isAvailable: rider.isAvailable,
    });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
