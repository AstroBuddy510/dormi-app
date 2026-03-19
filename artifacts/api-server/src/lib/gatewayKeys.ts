import { db } from "@workspace/db";
import { paymentGatewayTable } from "@workspace/db/schema";

export async function getGatewayKeys(): Promise<{ publicKey: string; secretKey: string; mode: string }> {
  const [row] = await db.select().from(paymentGatewayTable).limit(1);
  if (row && row.secretKey) {
    return { publicKey: row.publicKey, secretKey: row.secretKey, mode: row.mode };
  }
  return {
    publicKey: process.env.VITE_PAYSTACK_PUBLIC_KEY ?? "",
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
    mode: "test",
  };
}
