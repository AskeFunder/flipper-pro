require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migration = `
-- Create dirty_items table to act as a change queue
-- This table tracks which items need canonical updates
CREATE TABLE IF NOT EXISTS dirty_items (
    item_id INT PRIMARY KEY,
    touched_at INT NOT NULL
);
`;

// Note: CREATE INDEX CONCURRENTLY cannot be run inside a transaction
const index = {
  name: "idx_dirty_items_item_id",
  sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dirty_items_item_id
        ON dirty_items (item_id);`,
  description: "Index for fast lookups by item_id"
};

(async () => {
  try {
    console.log("🔨 Creating dirty_items table...");
    
    // Create table
    await db.query(migration);
    console.log("   ✅ dirty_items table created");
    
    // Create index (CONCURRENTLY, outside transaction)
    console.log("   Creating index (CONCURRENTLY - this may take a while)...");
    try {
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
    
    console.log("\n✅ dirty_items table and index created successfully");
  } catch (err) {
    console.error("❌ Failed to create dirty_items table:", err.message);
    process.exit(1);
  } finally {
    await db.end();
  }
})();



