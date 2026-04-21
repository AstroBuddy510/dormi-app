import { db } from "./lib/db/src/index.ts";
import { adminsTable } from "./lib/db/src/schema.ts";

async function checkAdmins() {
  try {
    const admins = await db.select().from(adminsTable);
    console.log("--- ADMINS IN DATABASE ---");
    console.log(JSON.stringify(admins, null, 2));
    console.log("--------------------------");
    process.exit(0);
  } catch (err) {
    console.error("Error checking admins:", err);
    process.exit(1);
  }
}

checkAdmins();
