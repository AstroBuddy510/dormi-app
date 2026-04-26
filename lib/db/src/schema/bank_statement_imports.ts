import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Bank statement imports — one row per upload/sync batch.
 *
 * Used for audit trail, displaying import history, and deduplication
 * (re-uploading the same file detects existing import + warns).
 */
export const importSources = ["csv", "paystack_api"] as const;
export type ImportSource = typeof importSources[number];

export const importStatuses = ["pending", "completed", "failed"] as const;
export type ImportStatus = typeof importStatuses[number];

export const bankStatementImportsTable = pgTable("bank_statement_imports", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  source: text("source").notNull(), // importSources
  fileName: text("file_name"),
  fileChecksum: text("file_checksum"), // sha256 of upload, null for API
  detectedFormat: text("detected_format"), // 'gcb' | 'ecobank' | 'stanbic' | 'absa' | 'momo-mtn' | 'paystack' | 'generic'

  periodStart: text("period_start"), // earliest statement_date in the batch
  periodEnd: text("period_end"),     // latest statement_date

  lineCount: integer("line_count").notNull().default(0),
  status: text("status").notNull().default("pending"), // importStatuses
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  importedBy: integer("imported_by").notNull(),
  importedByName: text("imported_by_name").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertBankStatementImportSchema = createInsertSchema(bankStatementImportsTable).omit({
  id: true,
  startedAt: true,
});
export type InsertBankStatementImport = z.infer<typeof insertBankStatementImportSchema>;
export type BankStatementImport = typeof bankStatementImportsTable.$inferSelect;
