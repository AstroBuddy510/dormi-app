import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { pricingTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { UpdatePricingBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  let [pricing] = await db.select().from(pricingTable).limit(1);
  if (!pricing) {
    [pricing] = await db.insert(pricingTable).values({}).returning();
  }
  res.json(mapPricing(pricing));
});

router.put("/", async (req, res) => {
  try {
    const body = UpdatePricingBody.parse(req.body);
    let [pricing] = await db.select().from(pricingTable).limit(1);
    if (!pricing) {
      [pricing] = await db.insert(pricingTable).values({
        deliveryFee: body.deliveryFee.toString(),
        serviceMarkupPercent: body.serviceMarkupPercent.toString(),
      }).returning();
    } else {
      [pricing] = await db.update(pricingTable)
        .set({
          deliveryFee: body.deliveryFee.toString(),
          serviceMarkupPercent: body.serviceMarkupPercent.toString(),
          updatedAt: new Date(),
        })
        .where(eq(pricingTable.id, pricing.id))
        .returning();
    }
    res.json(mapPricing(pricing));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

function mapPricing(p: typeof pricingTable.$inferSelect) {
  return {
    id: p.id,
    deliveryFee: parseFloat(p.deliveryFee),
    serviceMarkupPercent: parseFloat(p.serviceMarkupPercent),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export default router;
