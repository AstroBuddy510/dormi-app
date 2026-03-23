import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { estatesTable, residentsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/list", async (_req, res) => {
  try {
    const rows = await db
      .select({ id: estatesTable.id, name: estatesTable.name })
      .from(estatesTable)
      .orderBy(estatesTable.name);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.get("/", async (_req, res) => {
  try {
    const [adminEstates, residentEstates] = await Promise.all([
      db.select({ name: estatesTable.name }).from(estatesTable).orderBy(estatesTable.name),
      db.select({ estate: residentsTable.estate }).from(residentsTable),
    ]);
    const names = new Set<string>();
    adminEstates.forEach((e) => { if (e.name) names.add(e.name); });
    residentEstates.forEach((r) => { if (r.estate) names.add(r.estate); });
    res.json([...names].sort());
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "bad_request", message: "Estate name is required." });
      return;
    }
    const trimmed = name.trim();
    const [existing] = await db
      .select()
      .from(estatesTable)
      .where(sql`lower(${estatesTable.name}) = lower(${trimmed})`)
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "duplicate", message: "Estate already exists." });
      return;
    }
    const [estate] = await db
      .insert(estatesTable)
      .values({ name: trimmed })
      .returning();
    res.status(201).json(estate);
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "duplicate", message: "Estate already exists." });
      return;
    }
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid ID." });
      return;
    }
    await db.delete(estatesTable).where(eq(estatesTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

export default router;
