import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "../../../../lib/db/src/index.js";
import { ordersTable } from "../../../../lib/db/src/schema/index.js";
import { eq } from "drizzle-orm";
import { getGatewayKeys } from "../lib/gatewayKeys.js";

const router: IRouter = Router();

/**
 * Paystack webhook endpoint.
 *
 * Paystack signs each event payload with HMAC-SHA512 using your secret key
 * and sends it in the `x-paystack-signature` header.  We recompute the digest
 * from the raw request body (captured in app.ts) and reject anything that
 * doesn't match — this is the only way to trust a webhook.
 *
 * Handled events:
 *   - charge.success  → mark the matching order as paid (idempotent)
 *
 * Other events are acknowledged with 200 so Paystack doesn't retry.
 */
router.post("/", async (req: any, res) => {
  try {
    const { secretKey } = await getGatewayKeys();
    if (!secretKey) {
      return res.status(500).json({ error: "misconfigured" });
    }

    const signature = req.headers["x-paystack-signature"] as string | undefined;
    const rawBody: Buffer | undefined = req.rawBody;
    if (!signature || !rawBody) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const expected = crypto
      .createHmac("sha512", secretKey)
      .update(rawBody)
      .digest("hex");

    // Use timingSafeEqual to avoid timing attacks.
    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ error: "invalid_signature" });
    }

    const event = req.body;
    if (event?.event === "charge.success") {
      const reference: string | undefined = event.data?.reference;
      const amount: number | undefined = event.data?.amount; // pesewas
      const currency: string | undefined = event.data?.currency;

      if (reference && currency === "GHS" && typeof amount === "number") {
        const [order] = await db
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.paystackReference, reference))
          .limit(1);

        if (order && order.paymentStatus !== "paid") {
          const expectedPesewas = Math.round(parseFloat(order.total) * 100);
          if (amount === expectedPesewas) {
            await db
              .update(ordersTable)
              .set({ paymentStatus: "paid" })
              .where(eq(ordersTable.id, order.id));
          } else {
            console.warn(
              `[paystack-webhook] amount mismatch for ${reference}: paid ${amount}, expected ${expectedPesewas}`,
            );
          }
        }
      }
    }

    // Always 200 on valid signature — Paystack retries on non-2xx.
    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("[paystack-webhook] error:", err);
    return res.status(500).json({ error: "internal_error", message: err.message });
  }
});

export default router;
