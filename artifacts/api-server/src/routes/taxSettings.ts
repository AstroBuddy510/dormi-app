import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { taxSettingsTable } from "../../../../lib/db/src/schema/index.js";
import { eq, asc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const UpdateBody = z.object({
  rate: z.number().min(0).max(1).optional(),       // decimal fraction, e.g. 0.15 for 15%
  enabled: z.boolean().optional(),
});

function mapRow(r: typeof taxSettingsTable.$inferSelect) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    rate: parseFloat(r.rate),                        // decimal fraction
    ratePercent: Math.round(parseFloat(r.rate) * 10000) / 100, // human-friendly %
    enabled: r.enabled,
    description: r.description ?? null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

// GET / — list all tax settings (always returns the seeded set in fixed order)
router.get("/", async (_req, res) => {
  const rows = await db.select().from(taxSettingsTable).orderBy(asc(taxSettingsTable.id));
  res.json(rows.map(mapRow));
});

// PUT /:code — update rate and/or enabled flag for a single tax line
router.put("/:code", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const body = UpdateBody.parse(req.body);
    if (body.rate === undefined && body.enabled === undefined) {
      return res.status(400).json({ error: "bad_request", message: "Provide rate and/or enabled." });
    }
    const [existing] = await db.select().from(taxSettingsTable).where(eq(taxSettingsTable.code, code)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: "not_found", message: `No tax setting with code '${code}'.` });
    }
    const patch: Partial<typeof taxSettingsTable.$inferInsert> = { updatedAt: new Date() };
    if (body.rate !== undefined) patch.rate = body.rate.toString();
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    const [updated] = await db.update(taxSettingsTable)
      .set(patch)
      .where(eq(taxSettingsTable.id, existing.id))
      .returning();
    res.json(mapRow(updated));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
