import { db, pool } from "./index.js";
import { itemsTable, vendorsTable, residentsTable, pricingTable } from "./schema.js";
import { createHash } from "crypto";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

const CATEGORIES = [
  "Vegetables", "Fruits", "Dairy", "Meat", "Household", "Cosmetics", "Staples"
];

const INITIAL_ITEMS = [
  // Vegetables
  { name: "Tomatoes", category: "Vegetables", price: "15.00", unit: "1kg" },
  { name: "Onions", category: "Vegetables", price: "12.00", unit: "1kg" },
  { name: "Pepper (Kpakpo Shito)", category: "Vegetables", price: "10.00", unit: "200g" },
  { name: "Garden Eggs", category: "Vegetables", price: "8.00", unit: "500g" },
  { name: "Spinach (Kontomire)", category: "Vegetables", price: "5.00", unit: "1 bunch" },
  { name: "Cabbage", category: "Vegetables", price: "12.00", unit: "1 head" },
  { name: "Carrots", category: "Vegetables", price: "10.00", unit: "500g" },
  { name: "Spring Onions", category: "Vegetables", price: "4.00", unit: "1 bunch" },
  // Fruits
  { name: "Plantain", category: "Fruits", price: "20.00", unit: "1 bunch (4-5)" },
  { name: "Banana", category: "Fruits", price: "15.00", unit: "1 hand" },
  { name: "Pineapple", category: "Fruits", price: "12.00", unit: "1 large" },
  { name: "Watermelon", category: "Fruits", price: "25.00", unit: "1 large" },
  { name: "Mango", category: "Fruits", price: "10.00", unit: "1 unit" },
  { name: "Oranges", category: "Fruits", price: "10.00", unit: "5 units" },
  // Dairy
  { name: "Fan Ice Milk", category: "Dairy", price: "5.00", unit: "1 pouch" },
  { name: "Eggs", category: "Dairy", price: "65.00", unit: "1 crate (30)" },
  { name: "Fanyogo Yoghurt", category: "Dairy", price: "5.00", unit: "1 pouch" },
  { name: "Butter", category: "Dairy", price: "45.00", unit: "250g" },
  { name: "Cheese", category: "Dairy", price: "35.00", unit: "200g" },
  // Meat
  { name: "Fresh Chicken", category: "Meat", price: "120.00", unit: "1.5kg" },
  { name: "Beef", category: "Meat", price: "85.00", unit: "1kg" },
  { name: "Tilapia", category: "Meat", price: "75.00", unit: "1kg" },
  { name: "Goat Meat", category: "Meat", price: "95.00", unit: "1kg" },
  { name: "Pork", category: "Meat", price: "70.00", unit: "1kg" },
  // Household
  { name: "Sunlight Soap", category: "Household", price: "8.00", unit: "1 bar" },
  { name: "OMO Powder", category: "Household", price: "15.00", unit: "500g" },
  { name: "Toilet Roll", category: "Household", price: "45.00", unit: "Pack of 10" },
  { name: "Dishwashing Liquid", category: "Household", price: "25.00", unit: "500ml" },
  { name: "Broom", category: "Household", price: "15.00", unit: "1 unit" },
  // Cosmetics
  { name: "Close Up Toothpaste", category: "Cosmetics", price: "15.00", unit: "140g" },
  { name: "Toothbrush", category: "Cosmetics", price: "10.00", unit: "1 unit" },
  { name: "Vaseline Lotion", category: "Cosmetics", price: "35.00", unit: "400ml" },
  { name: "Shampoo", category: "Cosmetics", price: "30.00", unit: "250ml" },
  { name: "Deodorant", category: "Cosmetics", price: "25.00", unit: "1 unit" },
  // Staples
  { name: "Rice 5kg (Gino/Fortune)", category: "Staples", price: "185.00", unit: "5kg" },
  { name: "Rice 1kg", category: "Staples", price: "40.00", unit: "1kg" },
  { name: "Cooking Oil", category: "Staples", price: "35.00", unit: "1L" },
  { name: "Bread", category: "Staples", price: "15.00", unit: "1 loaf" },
  { name: "Sugar", category: "Staples", price: "25.00", unit: "1kg" },
  { name: "Flour", category: "Staples", price: "22.00", unit: "1kg" },
  { name: "Maggi Cubes", category: "Staples", price: "15.00", unit: "Pack of 50" },
  { name: "Tomato Paste", category: "Staples", price: "5.00", unit: "1 small tin" },
  { name: "Salt", category: "Staples", price: "5.00", unit: "1kg" },
  { name: "Noodles (Indomie)", category: "Staples", price: "55.00", unit: "Box of 40" },
];

async function seed() {
  console.log("Seeding database...");

  try {
    // 1. Initial Pricing
    await db.insert(pricingTable).values({
      deliveryFee: "30.00",
      serviceMarkupPercent: "18.00",
    }).onConflictDoNothing();

    // 2. Vendors
    const [makola] = await db.insert(vendorsTable).values({
      name: "Makola Fresh Produce",
      phone: "0244000001",
      pin: hashPin("5678"),
      categories: ["Vegetables", "Fruits"],
    }).onConflictDoNothing().returning();

    const [supermarket] = await db.insert(vendorsTable).values({
      name: "Estate Supermarket",
      phone: "0244000002",
      pin: hashPin("5678"),
      categories: ["Dairy", "Staples", "Household", "Cosmetics"],
    }).onConflictDoNothing().returning();

    const [meats] = await db.insert(vendorsTable).values({
      name: "Fresh Meats & More",
      phone: "0244000003",
      pin: hashPin("5678"),
      categories: ["Meat", "Dairy"],
    }).onConflictDoNothing().returning();

    // 3. Items
    for (const item of INITIAL_ITEMS) {
      await db.insert(itemsTable).values(item).onConflictDoNothing();
    }

    // 4. Residents (Demo)
    await db.insert(residentsTable).values([
      { fullName: "Kwesi Boateng", phone: "0244567890", estate: "Airport Hills", blockNumber: "A", houseNumber: "12", subscribeWeekly: true },
      { fullName: "Abena Owusu", phone: "0244567891", estate: "East Legon Hills", blockNumber: "B", houseNumber: "45", subscribeWeekly: false },
    ]).onConflictDoNothing();

    console.log("Seeding completed successfully.");
  } catch (err) {
    console.error("Seeding failed:", err);
  } finally {
    await pool.end();
  }
}

seed();
