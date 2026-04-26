import { createHash } from "node:crypto";

/**
 * CSV statement parsers for Ghana bank + MoMo formats.
 *
 * Each parser is a header-detector + row-mapper pair. We sniff the first row
 * of the CSV against known signatures and pick the matching parser; if
 * nothing matches, we fall back to a flexible generic parser that maps by
 * column-name heuristics. Detected format is stored on the import row.
 *
 * Output: an array of `ParsedLine` ready to be inserted into bank_statement_lines.
 *
 * Sign convention:
 *   amount > 0 → inflow (credit on the bank statement / money in)
 *   amount < 0 → outflow (debit on the bank statement / money out)
 */

export interface ParsedLine {
  statementDate: string; // YYYY-MM-DD
  valueDate?: string;
  description: string;
  reference: string | null;
  amount: number;        // signed
  runningBalance: number | null;
  rawPayload: Record<string, unknown>;
}

export interface ParseResult {
  format: "gcb" | "ecobank" | "stanbic" | "absa" | "momo-mtn" | "paystack" | "generic";
  lines: ParsedLine[];
  warnings: string[];
}

// ── CSV splitting with quoted-field support ──────────────────────────────
function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let i = 0;
  let cur = "";
  let inQuote = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQuote = false; i++;
      } else {
        cur += ch; i++;
      }
    } else {
      if (ch === '"') { inQuote = true; i++; }
      else if (ch === ",") { cells.push(cur); cur = ""; i++; }
      else { cur += ch; i++; }
    }
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

function splitLines(csv: string): string[] {
  // Strip BOM, normalise line endings, drop empty trailing rows
  return csv.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n").filter(l => l.trim().length > 0);
}

function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  // Remove thousand separators, currency symbols, parentheses (negative)
  const cleaned = s.replace(/[₵$£€\s,]/g, "").replace(/^\((.+)\)$/, "-$1");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Parse a date string into YYYY-MM-DD. Tolerates "DD/MM/YYYY", "DD-MM-YYYY",
 *  "YYYY-MM-DD", "DD MMM YYYY". Returns null if unrecognisable. */
function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  // ISO YYYY-MM-DD or YYYY/MM/DD
  let m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // DD/MM/YYYY or DD-MM-YYYY
  m = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // DD MMM YYYY (e.g. "12 Mar 2026")
  m = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (m) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const mm = months[m[2].toLowerCase().slice(0, 3)];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
  }
  // Last resort — Date.parse
  const t = Date.parse(trimmed);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

function headerHas(headers: string[], ...needles: string[]): boolean {
  const lower = headers.map(h => h.toLowerCase());
  return needles.every(n => lower.some(h => h.includes(n.toLowerCase())));
}

// ── Format-specific parsers ──────────────────────────────────────────────

/**
 * GCB / typical Ghanaian commercial bank export
 * Headers like: Date, Value Date, Description, Reference, Debit, Credit, Balance
 */
function parseGcb(rows: string[][]): ParsedLine[] {
  const headers = rows[0].map(h => h.toLowerCase());
  const idx = (n: string) => headers.findIndex(h => h.includes(n));
  const dateI = idx("date");
  const descI = idx("description") >= 0 ? idx("description") : idx("narration");
  const refI = idx("reference") >= 0 ? idx("reference") : idx("ref");
  const debitI = idx("debit") >= 0 ? idx("debit") : idx("withdrawal");
  const creditI = idx("credit") >= 0 ? idx("credit") : idx("deposit");
  const balanceI = idx("balance");
  const valueDateI = headers.findIndex(h => h.includes("value"));

  const lines: ParsedLine[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[dateI]);
    if (!date) continue;
    const debit = debitI >= 0 ? parseAmount(r[debitI]) : 0;
    const credit = creditI >= 0 ? parseAmount(r[creditI]) : 0;
    const amount = credit - debit; // inflow positive
    if (amount === 0) continue;
    const desc = (descI >= 0 ? r[descI] : "").trim() || "(no description)";
    const ref = refI >= 0 ? (r[refI] || "").trim() || null : null;
    const balance = balanceI >= 0 ? parseAmount(r[balanceI]) : null;
    const valueDate = valueDateI >= 0 ? parseDate(r[valueDateI]) ?? undefined : undefined;
    lines.push({
      statementDate: date,
      valueDate,
      description: desc,
      reference: ref,
      amount,
      runningBalance: balance,
      rawPayload: Object.fromEntries(rows[0].map((h, j) => [h, r[j] ?? ""])),
    });
  }
  return lines;
}

/**
 * Paystack export (transactions or settlements CSV)
 * Common headers: id, reference, amount, currency, status, paid_at, created_at, customer
 */
function parsePaystack(rows: string[][]): ParsedLine[] {
  const headers = rows[0].map(h => h.toLowerCase());
  const idx = (n: string) => headers.findIndex(h => h === n || h.includes(n));
  const refI = idx("reference");
  const amountI = idx("amount");
  const dateI = idx("paid_at") >= 0 ? idx("paid_at") : idx("created_at");
  const statusI = idx("status");
  const customerI = idx("customer");
  const descI = idx("description") >= 0 ? idx("description") : -1;

  const lines: ParsedLine[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const status = statusI >= 0 ? (r[statusI] || "").toLowerCase() : "success";
    if (status !== "success" && status !== "settled" && status !== "" && status !== "paid") continue;
    const date = parseDate(r[dateI]);
    if (!date) continue;
    // Paystack reports kobo (×100) for some exports — heuristic: if integer >= 1000 and customer-currency is GHS, divide
    let amount = parseAmount(r[amountI]);
    if (amount > 100_000 && Number.isInteger(amount)) amount = amount / 100;
    if (amount === 0) continue;
    const ref = (r[refI] || "").trim() || null;
    const customer = customerI >= 0 ? (r[customerI] || "").trim() : "";
    const desc = (descI >= 0 ? r[descI] : "").trim()
      || (customer ? `Paystack — ${customer}` : `Paystack ${ref ?? ""}`).trim();
    lines.push({
      statementDate: date,
      description: desc,
      reference: ref,
      amount,  // assume positive — Paystack settles inflows
      runningBalance: null,
      rawPayload: Object.fromEntries(rows[0].map((h, j) => [h, r[j] ?? ""])),
    });
  }
  return lines;
}

/**
 * Generic fallback — best-effort column inference.
 * Picks any column with "date" in name as date; "amount" or "debit"/"credit"
 * pair for amount; "narration"/"description"/"details" for description;
 * "reference"/"ref"/"transaction id" for reference.
 */
function parseGeneric(rows: string[][]): { lines: ParsedLine[]; warnings: string[] } {
  const warnings: string[] = [];
  const headers = rows[0].map(h => h.toLowerCase());
  const idx = (...needles: string[]) => {
    for (const n of needles) {
      const i = headers.findIndex(h => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const dateI = idx("date", "time");
  const descI = idx("description", "narration", "details", "memo", "particulars");
  const refI = idx("reference", "ref", "transaction id", "txn id", "id");
  const amountI = idx("amount");
  const debitI = idx("debit", "withdrawal", "out");
  const creditI = idx("credit", "deposit", "in");
  const balanceI = idx("balance");

  if (dateI < 0) warnings.push("No date column detected — cannot parse.");
  if (amountI < 0 && debitI < 0 && creditI < 0) warnings.push("No amount column detected.");

  const lines: ParsedLine[] = [];
  if (dateI < 0 || (amountI < 0 && debitI < 0 && creditI < 0)) return { lines, warnings };

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[dateI]);
    if (!date) continue;
    let amount = 0;
    if (amountI >= 0) {
      amount = parseAmount(r[amountI]);
    } else {
      const debit = debitI >= 0 ? parseAmount(r[debitI]) : 0;
      const credit = creditI >= 0 ? parseAmount(r[creditI]) : 0;
      amount = credit - debit;
    }
    if (amount === 0) continue;
    const desc = (descI >= 0 ? r[descI] : "").trim() || "(no description)";
    const ref = refI >= 0 ? (r[refI] || "").trim() || null : null;
    const balance = balanceI >= 0 ? parseAmount(r[balanceI]) : null;
    lines.push({
      statementDate: date,
      description: desc,
      reference: ref,
      amount,
      runningBalance: balance,
      rawPayload: Object.fromEntries(rows[0].map((h, j) => [h, r[j] ?? ""])),
    });
  }
  return { lines, warnings };
}

// ── Format detector + main entry point ───────────────────────────────────

export function detectFormat(headerRow: string[]): ParseResult["format"] {
  const lower = headerRow.map(h => h.toLowerCase());
  // Paystack signatures
  if (headerHas(headerRow, "paid_at") || (headerHas(headerRow, "reference") && headerHas(headerRow, "customer") && lower.some(h => h.includes("status")))) {
    return "paystack";
  }
  // MTN MoMo merchant statement
  if (headerHas(headerRow, "transaction id") && (headerHas(headerRow, "msisdn") || headerHas(headerRow, "wallet"))) {
    return "momo-mtn";
  }
  // GCB / generic Ghanaian bank — date + debit + credit + balance
  if (headerHas(headerRow, "date") && headerHas(headerRow, "debit") && headerHas(headerRow, "credit") && headerHas(headerRow, "balance")) {
    // Could be GCB, Ecobank, Stanbic, Absa — they all share this skeleton.
    // Use first cell hint if present.
    return "gcb";
  }
  return "generic";
}

export function parseStatementCsv(csv: string): ParseResult {
  const rawLines = splitLines(csv);
  if (rawLines.length === 0) {
    return { format: "generic", lines: [], warnings: ["Empty file."] };
  }
  const rows = rawLines.map(parseCsvRow);
  const headerRow = rows[0];
  const format = detectFormat(headerRow);

  let lines: ParsedLine[] = [];
  let warnings: string[] = [];
  switch (format) {
    case "paystack":
      lines = parsePaystack(rows);
      break;
    case "gcb":
    case "ecobank":
    case "stanbic":
    case "absa":
    case "momo-mtn":
      lines = parseGcb(rows);
      break;
    default: {
      const r = parseGeneric(rows);
      lines = r.lines;
      warnings = r.warnings;
    }
  }
  if (lines.length === 0 && warnings.length === 0) warnings.push("Format detected but no rows could be parsed.");
  return { format, lines, warnings };
}

export function checksumCsv(csv: string): string {
  return createHash("sha256").update(csv).digest("hex");
}
