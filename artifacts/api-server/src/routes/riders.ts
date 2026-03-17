import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ridersTable } from "@workspace/db/schema";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const riders = await db.select().from(ridersTable);
  res.json(riders.map(r => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    isAvailable: r.isAvailable,
  })));
});

export default router;
