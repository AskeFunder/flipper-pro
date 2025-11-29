require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Note: CREATE INDEX CONCURRENTLY cannot be run inside a transaction
// and must be executed separately for each index
const indexes = [
  {
    name: "idx_price_instants_item_type",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_instants_item_type
          ON price_instants (item_id, type);`,
    description: "Required for ON CONFLICT (item_id, type)"
  },
  {
    name: "idx_price_instants_item_type_timestamp",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_instants_item_type_timestamp
          ON price_instants (item_id, type, timestamp);`,
    description: "Required for FAST timestamp-based change detection"
  },
  {
    name: "idx_items_id",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_id
          ON items (id);`,
    description: "Required for canonical JOIN later"
  }
];

(async () => {
  try {
    console.log("🔨 Creating indexes (CONCURRENTLY - this may take a while)...");
    
    for (const index of indexes) {
      try {
        console.log(`   Creating ${index.name}...`);
        await db.query(index.sql);
        console.log(`   ✅ ${index.name} created (${index.description})`);
      } catch (err) {
        // If index already exists, that's okay
        if (err.message.includes("already exists") || err.code === "42P07") {
          console.log(`   ⚠️  ${index.name} already exists, skipping`);
        } else {
          throw err;
        }
      }
    }
    
    console.log("\n✅ All indexes created successfully");
    
    // Refresh planner stats so PostgreSQL uses the new indexes
    console.log("\n📊 Refreshing planner statistics...");
    try {
      await db.query("ANALYZE price_instants;");
      console.log("   ✅ Analyzed price_instants");
      
      await db.query("ANALYZE items;");
      console.log("   ✅ Analyzed items");
      
      console.log("\n✅ Planner statistics refreshed");
    } catch (err) {
      console.error("⚠️  Warning: Failed to refresh planner stats:", err.message);
      // Don't exit on ANALYZE failure, indexes are still created
    }
  } catch (err) {
    console.error("❌ Failed to create indexes:", err.message);
    process.exit(1);
  } finally {
    await db.end();
  }
})();

