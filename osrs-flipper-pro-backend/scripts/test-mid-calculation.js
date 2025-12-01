require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        console.log("Testing mid calculation with different scenarios:");
        console.log("=".repeat(80));
        
        // Test 1: Both high and low
        const test1 = await db.query(`
            SELECT 
                100::numeric AS avg_high, 90::numeric AS avg_low,
                CASE 
                    WHEN 100::numeric IS NOT NULL AND 90::numeric IS NOT NULL THEN (100::numeric + 90::numeric) / 2.0
                    WHEN 100::numeric IS NOT NULL THEN 100::numeric
                    WHEN 90::numeric IS NOT NULL THEN 90::numeric
                    ELSE NULL
                END AS mid
        `);
        console.log("\nTest 1: Both high and low");
        console.log("  High: 100, Low: 90");
        console.log("  Mid:", test1.rows[0].mid, "(expected: 95)");
        
        // Test 2: Only high
        const test2 = await db.query(`
            SELECT 
                100::numeric AS avg_high, NULL::numeric AS avg_low,
                CASE 
                    WHEN 100::numeric IS NOT NULL AND NULL::numeric IS NOT NULL THEN (100::numeric + NULL::numeric) / 2.0
                    WHEN 100::numeric IS NOT NULL THEN 100::numeric
                    WHEN NULL::numeric IS NOT NULL THEN NULL::numeric
                    ELSE NULL
                END AS mid
        `);
        console.log("\nTest 2: Only high");
        console.log("  High: 100, Low: NULL");
        console.log("  Mid:", test2.rows[0].mid, "(expected: 100)");
        
        // Test 3: Only low
        const test3 = await db.query(`
            SELECT 
                NULL::numeric AS avg_high, 90::numeric AS avg_low,
                CASE 
                    WHEN NULL::numeric IS NOT NULL AND 90::numeric IS NOT NULL THEN (NULL::numeric + 90::numeric) / 2.0
                    WHEN NULL::numeric IS NOT NULL THEN NULL::numeric
                    WHEN 90::numeric IS NOT NULL THEN 90::numeric
                    ELSE NULL
                END AS mid
        `);
        console.log("\nTest 3: Only low");
        console.log("  High: NULL, Low: 90");
        console.log("  Mid:", test3.rows[0].mid, "(expected: 90)");
        
        // Test 4: Both NULL
        const test4 = await db.query(`
            SELECT 
                NULL::numeric AS avg_high, NULL::numeric AS avg_low,
                CASE 
                    WHEN NULL::numeric IS NOT NULL AND NULL::numeric IS NOT NULL THEN (NULL::numeric + NULL::numeric) / 2.0
                    WHEN NULL::numeric IS NOT NULL THEN NULL::numeric
                    WHEN NULL::numeric IS NOT NULL THEN NULL::numeric
                    ELSE NULL
                END AS mid
        `);
        console.log("\nTest 4: Both NULL");
        console.log("  High: NULL, Low: NULL");
        console.log("  Mid:", test4.rows[0].mid, "(expected: NULL)");
        
        // Test 5: Real data from price_5m with only high or low
        console.log("\n" + "=".repeat(80));
        console.log("Real data test - finding candles with only high or only low:");
        const realTest = await db.query(`
            SELECT timestamp, avg_high, avg_low,
                   CASE 
                       WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                       WHEN avg_high IS NOT NULL THEN avg_high
                       WHEN avg_low IS NOT NULL THEN avg_low
                       ELSE NULL
                   END AS mid
            FROM price_5m
            WHERE item_id = 2351
              AND (
                  (avg_high IS NOT NULL AND avg_low IS NULL) OR
                  (avg_high IS NULL AND avg_low IS NOT NULL)
              )
            ORDER BY timestamp DESC
            LIMIT 5
        `);
        
        if (realTest.rows.length > 0) {
            console.log(`Found ${realTest.rows.length} candles with only high or only low:`);
            realTest.rows.forEach((row, i) => {
                console.log(`  ${i + 1}. ${new Date(row.timestamp * 1000).toISOString()}: high=${row.avg_high}, low=${row.avg_low}, mid=${row.mid}`);
            });
        } else {
            console.log("No candles found with only high or only low (all have both)");
        }
        
    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();

