import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ridersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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
    res.status(201).json(mapRider(rider));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, phone, isAvailable } = req.body;
    const [rider] = await db.update(ridersTable)
      .set({
        ...(name && { name }),
        ...(phone && { phone }),
        ...(isAvailable !== undefined && { isAvailable }),
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
