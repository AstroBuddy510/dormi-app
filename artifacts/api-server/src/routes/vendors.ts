import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const vendors = await db.select().from(vendorsTable);
  res.json(vendors.map(v => ({
    id: v.id,
    name: v.name,
    phone: v.phone,
    description: v.description,
    categories: v.categories,
    isActive: v.isActive,
  })));
});

router.post("/", async (req, res) => {
  try {
    const { name, phone, description } = req.body;
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
      categories: [],
      isActive: true,
    }).returning();
    res.status(201).json({
      id: vendor.id,
      name: vendor.name,
      phone: vendor.phone,
      description: vendor.description,
      categories: vendor.categories,
      isActive: vendor.isActive,
    });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
