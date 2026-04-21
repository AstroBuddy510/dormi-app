import { Router, type IRouter } from "express";
import { db } from "../../../lib/db/src/index.js";
import { ordersTable } from "../../../lib/db/src/schema/index.js";
import { eq } from "drizzle-orm";
import { getGatewayKeys } from "../lib/gatewayKeys";

const router: IRouter = Router();

router.post("/verify", async (req, res) => {
  try {
    const { reference, orderId } = req.body;

    if (!reference) {
      return res.status(400).json({ error: "missing_reference", message: "Payment reference is required." });
    }

    const { secretKey } = await getGatewayKeys();
    if (!secretKey) {
      return res.status(500).json({ error: "misconfigured", message: "Payment gateway not configured." });
    }

    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    if (!psRes.ok) {
      return res.status(502).json({ error: "paystack_error", message: "Could not verify payment with Paystack." });
    }

    const psData = (await psRes.json()) as any;

    if (!psData.status || psData.data?.status !== "success") {
      if (orderId) {
        await db.update(ordersTable)
          .set({ paymentStatus: "failed" })
          .where(eq(ordersTable.id, orderId));
      }
      return res.status(402).json({ error: "payment_not_successful", message: "Payment was not completed successfully." });
    }

    if (orderId) {
      await db.update(ordersTable)
        .set({ paymentStatus: "paid", paystackReference: reference })
        .where(eq(ordersTable.id, orderId));
    }

    return res.json({
      verified: true,
      reference: psData.data.reference,
      amount: psData.data.amount,
      currency: psData.data.currency,
      channel: psData.data.channel,
      paidAt: psData.data.paid_at,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "internal_error", message: err.message });
  }
});

export default router;
