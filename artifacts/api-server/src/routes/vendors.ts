import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const vendors = await db.select().from(vendorsTable);
  res.json(vendors.map(v => ({
    id: v.id,
    name: v.name,
    phone: v.phone,
    categories: v.categories,
    isActive: v.isActive,
  })));
});

export default router;
