import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { residentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { ResidentSignupBody, UpdateSubscriptionBody } from "@workspace/api-zod";

const router: IRouter = Router();

// ── Ghana GPS Address → Delivery Zone ────────────────────────────────────────
// Ghana GPS format: XX-NNN-NNNN  (first 2 chars = district code)
const INNER_ACCRA_PREFIXES = new Set([
  "GA", "AD", "AY", "LA", "KW", "LD", "AK",
]);
const OUTER_ACCRA_PREFIXES = new Set([
  "TM", "TN", "AS", "SH", "NI", "WA", "DN", "SA",
]);

function detectZoneFromGPS(address: string | null | undefined): string | null {
  if (!address) return null;
  const prefix = address.trim().toUpperCase().slice(0, 2);
  if (INNER_ACCRA_PREFIXES.has(prefix)) return "Inner Accra";
  if (OUTER_ACCRA_PREFIXES.has(prefix)) return "Outer Accra";
  return "Far";
}

function mapResident(r: typeof residentsTable.$inferSelect) {
  return {
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    estate: r.estate,
    blockNumber: r.blockNumber,
    houseNumber: r.houseNumber,
    ghanaGpsAddress: r.ghanaGpsAddress,
    zone: r.zone,
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
    const autoZone = detectZoneFromGPS(body.ghanaGpsAddress);
    const [resident] = await db.insert(residentsTable).values({
      fullName: body.fullName,
      phone: body.phone,
      estate: body.estate,
      blockNumber: body.blockNumber,
      houseNumber: body.houseNumber,
      ghanaGpsAddress: body.ghanaGpsAddress ?? null,
      zone: autoZone,
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
    const updates: Partial<typeof residentsTable.$inferInsert> = {
      ...(fullName && { fullName }),
      ...(phone && { phone }),
      ...(estate && { estate }),
      ...(blockNumber && { blockNumber }),
      ...(houseNumber && { houseNumber }),
      ...(ghanaGpsAddress !== undefined && { ghanaGpsAddress }),
    };
    if (ghanaGpsAddress) {
      const detected = detectZoneFromGPS(ghanaGpsAddress);
      if (detected) updates.zone = detected;
    }
    const [resident] = await db.update(residentsTable)
      .set(updates)
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

// Auto-detect zone from stored Ghana GPS address
router.post("/:id/detect-zone", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.id, id)).limit(1);
    if (!resident) {
      res.status(404).json({ error: "not_found", message: "Resident not found" });
      return;
    }
    const zone = detectZoneFromGPS(resident.ghanaGpsAddress);
    if (!zone) {
      res.status(422).json({ error: "no_address", message: "Resident has no Ghana GPS address set" });
      return;
    }
    const [updated] = await db.update(residentsTable).set({ zone }).where(eq(residentsTable.id, id)).returning();
    res.json({ zone: updated.zone, resident: mapResident(updated) });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// Manually assign zone
router.patch("/:id/zone", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { zone } = req.body;
    const [resident] = await db.update(residentsTable).set({ zone: zone || null }).where(eq(residentsTable.id, id)).returning();
    if (!resident) {
      res.status(404).json({ error: "not_found", message: "Resident not found" });
      return;
    }
    res.json(mapResident(resident));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// Bulk auto-tag all residents that have GPS but no zone
router.post("/bulk-detect-zones", async (_req, res) => {
  try {
    const all = await db.select().from(residentsTable);
    let updated = 0;
    for (const r of all) {
      if (!r.zone && r.ghanaGpsAddress) {
        const zone = detectZoneFromGPS(r.ghanaGpsAddress);
        if (zone) {
          await db.update(residentsTable).set({ zone }).where(eq(residentsTable.id, r.id));
          updated++;
        }
      }
    }
    res.json({ updated, message: `Auto-tagged ${updated} residents` });
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
