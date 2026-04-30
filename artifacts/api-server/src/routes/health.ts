import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "../../../../lib/api-zod/src/index.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/migrate", async (_req, res) => {
  try {
    await db.execute(sql`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS split_from_order_id INTEGER,
      ADD COLUMN IF NOT EXISTS decline_reason TEXT;
    `);
    res.json({ status: "ok", message: "Migration applied successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
