import { db } from "../../../../lib/db/src/index.js";
import { taxSettingsTable } from "../../../../lib/db/src/schema/index.js";

export interface OrderTaxBreakdown {
  base: number;          // serviceFee + deliveryFee, rounded to 2dp
  vatAmount: number;
  nhilAmount: number;
  getfundAmount: number;
  taxTotal: number;      // sum of all enabled levies
}

/**
 * Compute applicable taxes on the platform-revenue base. Reads the live
 * tax_settings table — only rows with enabled=true contribute. All taxes
 * apply to the SAME base (Ghana 2026 reform), so we sum independently.
 *
 * Base = serviceFee + deliveryFee (platform revenue only — never on goods).
 */
export async function computeOrderTaxes(serviceFee: number, deliveryFee: number): Promise<OrderTaxBreakdown> {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const base = round2(serviceFee + deliveryFee);
  const rows = await db.select().from(taxSettingsTable);
  const rateOf = (code: string) => {
    const r = rows.find(x => x.code === code);
    if (!r || !r.enabled) return 0;
    return parseFloat(r.rate);
  };
  const vatAmount = round2(base * rateOf("VAT"));
  const nhilAmount = round2(base * rateOf("NHIL"));
  const getfundAmount = round2(base * rateOf("GETFUND"));
  const taxTotal = round2(vatAmount + nhilAmount + getfundAmount);
  return { base, vatAmount, nhilAmount, getfundAmount, taxTotal };
}
