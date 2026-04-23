import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { ordersTable } from "../../../../lib/db/src/schema/index.js";
import { eq } from "drizzle-orm";
import { getGatewayKeys } from "../lib/gatewayKeys.js";

const router: IRouter = Router();

router.post("/verify", async (req, res) => {
  try {
    const { reference, orderId } = req.body;

    if (!reference) {
      return res.status(400).json({ error: "missing_reference", message: "Payment reference is required." });
    }

    // If an orderId is provided, load the order so we can amount-check the charge.
    let expectedPesewas: number | undefined;
    if (orderId) {
      const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
      if (!order) {
        return res.status(404).json({ error: "order_not_found", message: "Order not found." });
      }
      expectedPesewas = Math.round(parseFloat(order.total) * 100);
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

    const amountOk =
      expectedPesewas === undefined ||
      (typeof psData.data?.amount === "number" && psData.data.amount === expectedPesewas);
    const currencyOk = psData.data?.currency === "GHS";
    const chargeOk = psData.status && psData.data?.status === "success";

    if (!chargeOk || !amountOk || !currencyOk) {
      if (orderId) {
        await db.update(ordersTable)
          .set({ paymentStatus: "failed" })
          .where(eq(ordersTable.id, orderId));
      }
      return res.status(402).json({
        error: "payment_not_successful",
        message: "Payment was not completed successfully, or amount/currency did not match.",
      });
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
