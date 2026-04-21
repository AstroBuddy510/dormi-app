import app from "./app.js";
import { seedDefaultAdmin } from "./routes/auth.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      resident_id INTEGER REFERENCES residents(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'info',
      read_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("Tables verified.");
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await ensureTables();
  await seedDefaultAdmin();
});