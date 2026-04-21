import { Router, type IRouter } from "express";
import { db } from "../../../lib/db/src/index.js";
import { paymentGatewayTable } from "../../../lib/db/src/schema/index.js";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function maskKey(key: string): string {
  if (!key || key.length < 12) return key ? "****" : "";
  return key.slice(0, 10) + "•".repeat(Math.min(key.length - 14, 20)) + key.slice(-4);
}

async function ensureRow() {
  const [row] = await db.select().from(paymentGatewayTable).limit(1);
  if (row) return row;
  const [created] = await db.insert(paymentGatewayTable).values({
    provider: "paystack",
    publicKey: process.env.VITE_PAYSTACK_PUBLIC_KEY ?? "",
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
    mode: "test",
    isActive: true,
  }).returning();
  return created;
}

router.get("/", async (_req, res) => {
  const row = await ensureRow();
  res.json({
    provider: row.provider,
    publicKey: row.publicKey,
    maskedSecretKey: maskKey(row.secretKey),
    mode: row.mode,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
  });
});

router.put("/", async (req, res) => {
  const { publicKey, secretKey, mode, isActive } = req.body as {
    publicKey?: string;
    secretKey?: string;
    mode?: string;
    isActive?: boolean;
  };

  const row = await ensureRow();

  const updates: Partial<typeof row> = { updatedAt: new Date() };
  if (publicKey !== undefined) updates.publicKey = publicKey.trim();
  if (secretKey !== undefined && secretKey.trim()) updates.secretKey = secretKey.trim();
  if (mode !== undefined) updates.mode = mode;
  if (isActive !== undefined) updates.isActive = isActive;

  const [updated] = await db.update(paymentGatewayTable)
    .set(updates)
    .where(eq(paymentGatewayTable.id, row.id))
    .returning();

  res.json({
    provider: updated.provider,
    publicKey: updated.publicKey,
    maskedSecretKey: maskKey(updated.secretKey),
    mode: updated.mode,
    isActive: updated.isActive,
    updatedAt: updated.updatedAt,
  });
});

export default router;
