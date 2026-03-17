import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { residentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { ResidentSignupBody, UpdateSubscriptionBody } from "@workspace/api-zod";

const router: IRouter = Router();

function mapResident(r: typeof residentsTable.$inferSelect) {
  return {
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    estate: r.estate,
    blockNumber: r.blockNumber,
    houseNumber: r.houseNumber,
    ghanaGpsAddress: r.ghanaGpsAddress,
    subscribeWeekly: r.subscribeWeekly,
    subscriptionDay: r.subscriptionDay,
    photoUrl: r.photoUrl,
    suspended: r.suspended,
    createdAt: r.createdAt.toISOString(),
  };
}

router.post("/signup", async (req, res) => {
  try {
    const body = ResidentSignupBody.parse(req.body);
    const existing = await db.select().from(residentsTable).where(eq(residentsTable.phone, body.phone)).limit(1);
    if (existing.length > 0) {
      res.status(400).json({ error: "phone_exists", message: "Phone already registered" });
      return;
    }
    const [resident] = await db.insert(residentsTable).values({
      fullName: body.fullName,
      phone: body.phone,
      estate: body.estate,
      blockNumber: body.blockNumber,
      houseNumber: body.houseNumber,
      ghanaGpsAddress: body.ghanaGpsAddress ?? null,
      subscribeWeekly: false,
    }).returning();
    res.status(201).json(mapResident(resident));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.get("/estates", async (_req, res) => {
  const rows = await db.select({ estate: residentsTable.estate }).from(residentsTable);
  const estates = [...new Set(rows.map(r => r.estate).filter(Boolean))].sort();
  res.json(estates);
});

router.get("/", async (_req, res) => {
  const residents = await db.select().from(residentsTable).orderBy(residentsTable.createdAt);
  res.json(residents.map(mapResident));
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.id, id)).limit(1);
  if (!resident) {
    res.status(404).json({ error: "not_found", message: "Resident not found" });
    return;
  }
  res.json(mapResident(resident));
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { fullName, phone, estate, blockNumber, houseNumber, ghanaGpsAddress } = req.body;
    const [resident] = await db.update(residentsTable)
      .set({
        ...(fullName && { fullName }),
        ...(phone && { phone }),
        ...(estate && { estate }),
        ...(blockNumber && { blockNumber }),
        ...(houseNumber && { houseNumber }),
        ...(ghanaGpsAddress !== undefined && { ghanaGpsAddress }),
      })
      .where(eq(residentsTable.id, id))
      .returning();
    if (!resident) {
      res.status(404).json({ error: "not_found", message: "Resident not found" });
      return;
    }
    res.json(mapResident(resident));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/subscription", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateSubscriptionBody.parse(req.body);
    const [resident] = await db.update(residentsTable)
      .set({ subscribeWeekly: body.subscribeWeekly, subscriptionDay: body.subscriptionDay ?? "Friday" })
      .where(eq(residentsTable.id, id))
      .returning();
    if (!resident) {
      res.status(404).json({ error: "not_found", message: "Resident not found" });
      return;
    }
    res.json(mapResident(resident));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/suspend", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { suspended } = req.body;
    const [resident] = await db.update(residentsTable)
      .set({ suspended: !!suspended })
      .where(eq(residentsTable.id, id))
      .returning();
    if (!resident) {
      res.status(404).json({ error: "not_found", message: "Resident not found" });
      return;
    }
    res.json(mapResident(resident));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/photo", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { photoUrl } = req.body;
    const [resident] = await db.update(residentsTable)
      .set({ photoUrl: photoUrl ?? null })
      .where(eq(residentsTable.id, id))
      .returning();
    if (!resident) {
      res.status(404).json({ error: "not_found", message: "Resident not found" });
      return;
    }
    res.json(mapResident(resident));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(residentsTable).where(eq(residentsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
