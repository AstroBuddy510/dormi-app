import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { vendorsTable } from "../../../../lib/db/src/schema/index.js";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

const router: IRouter = Router();

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

function mapVendor(v: typeof vendorsTable.$inferSelect) {
  return {
    id: v.id,
    name: v.name,
    phone: v.phone,
    description: v.description,
    categories: v.categories,
    photoUrl: v.photoUrl,
    isActive: v.isActive,
    hasCustomPin: !!v.pin,
    createdAt: v.createdAt.toISOString(),
  };
}

router.get("/", async (_req, res) => {
  const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.createdAt);
  res.json(vendors.map(mapVendor));
});

router.post("/", async (req, res) => {
  try {
    const { name, phone, description, categories } = req.body;
    if (!name) {
      res.status(400).json({ error: "bad_request", message: "name is required" });
      return;
    }
    if (phone) {
      const existing = await db.select().from(vendorsTable).where(eq(vendorsTable.phone, phone)).limit(1);
      if (existing.length > 0) {
        res.status(400).json({ error: "phone_exists", message: "Phone already registered" });
        return;
      }
    }
    const [vendor] = await db.insert(vendorsTable).values({
      name,
      phone: phone ?? null,
      description: description ?? null,
      categories: Array.isArray(categories) ? categories : [],
      isActive: true,
    }).returning();
    res.status(201).json(mapVendor(vendor));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, phone, description, categories } = req.body;
    const [vendor] = await db.update(vendorsTable)
      .set({
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
        ...(description !== undefined && { description }),
        ...(Array.isArray(categories) && { categories }),
      })
      .where(eq(vendorsTable.id, id))
      .returning();
    if (!vendor) {
      res.status(404).json({ error: "not_found", message: "Vendor not found" });
      return;
    }
    res.json(mapVendor(vendor));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/suspend", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { suspended } = req.body;
    const [vendor] = await db.update(vendorsTable)
      .set({ isActive: !suspended })
      .where(eq(vendorsTable.id, id))
      .returning();
    if (!vendor) {
      res.status(404).json({ error: "not_found", message: "Vendor not found" });
      return;
    }
    res.json(mapVendor(vendor));
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
    const [vendor] = await db.update(vendorsTable)
      .set({ pin: hashPin(pin) })
      .where(eq(vendorsTable.id, id))
      .returning();
    if (!vendor) {
      res.status(404).json({ error: "not_found", message: "Vendor not found" });
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
    const [vendor] = await db.update(vendorsTable)
      .set({ photoUrl: photoUrl ?? null })
      .where(eq(vendorsTable.id, id))
      .returning();
    if (!vendor) {
      res.status(404).json({ error: "not_found", message: "Vendor not found" });
      return;
    }
    res.json(mapVendor(vendor));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(vendorsTable).where(eq(vendorsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
