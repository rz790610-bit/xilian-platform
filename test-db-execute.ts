import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

process.env.DATABASE_URL = "mysql://portai:portai123@localhost:3306/portai_nexus";

async function test() {
  const db = drizzle(process.env.DATABASE_URL!);

  // Test 1: sql.raw
  const r1 = await db.execute(sql.raw("SELECT VERSION() as version"));
  console.log("=== sql.raw ===");
  console.log("type:", typeof r1, "isArray:", Array.isArray(r1));
  console.log("r1 length:", r1.length);
  for (let i = 0; i < Math.min(r1.length, 3); i++) {
    console.log("r1[" + i + "]:", JSON.stringify(r1[i]).substring(0, 200));
  }
  
  // Test 2: sql template with param
  const tableName = 'devices';
  const r2 = await db.execute(sql.raw("SELECT COLUMN_NAME as name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '" + tableName + "' LIMIT 3"));
  console.log("\n=== sql.raw with table name ===");
  console.log("r2 length:", r2.length);
  for (let i = 0; i < Math.min(r2.length, 3); i++) {
    console.log("r2[" + i + "]:", JSON.stringify(r2[i]).substring(0, 200));
  }

  // Test 3: sql template literal
  const r3 = await db.execute(sql\`SELECT COLUMN_NAME as name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \${tableName} LIMIT 3\`);
  console.log("\n=== sql template literal ===");
  console.log("r3 length:", r3.length);
  for (let i = 0; i < Math.min(r3.length, 3); i++) {
    console.log("r3[" + i + "]:", JSON.stringify(r3[i]).substring(0, 200));
  }
  
  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
