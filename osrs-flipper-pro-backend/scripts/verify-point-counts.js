require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const EXPECTED_COUNTS = {
    "5m": 289,   // 24.083 hours = 24h + 5m
    "1h": 169,   // 169 hours = 1w + 1h
    "6h": 121,   // 726 hours = 1mo + 6h
    "24h": 366   // 8784 hours = 1y + 24h
};

(async () => {
    try {
        const tables = {
            "5m": "price_5m",
            "1h": "price_1h",
            "6h": "price_6h",
            "24h": "price_24h"
        };

        console.log("📊 Verifying Point Counts:");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        for (const [granularity, table] of Object.entries(tables)) {
            const query = `
                SELECT 
                    COUNT(DISTINCT timestamp) as unique_timestamps,
                    MIN(timestamp) as earliest,
                    MAX(timestamp) as latest,
                    to_char(to_timestamp(MIN(timestamp)), 'YYYY-MM-DD HH24:MI:SS') AS earliest_utc,
                    to_char(to_timestamp(MAX(timestamp)), 'YYYY-MM-DD HH24:MI:SS') AS latest_utc
                FROM ${table};
            `;
            const { rows } = await db.query(query);
            
            const actual = rows[0].unique_timestamps;
            const expected = EXPECTED_COUNTS[granularity];
            const status = actual === expected ? "✅" : "❌";
            
            const spanSeconds = rows[0].latest - rows[0].earliest;
            const spanHours = spanSeconds / 3600;
            
            console.log(`${status} [${granularity}]`);
            console.log(`   Expected: ${expected} points`);
            console.log(`   Actual:   ${actual} points`);
            console.log(`   Span:     ${spanHours.toFixed(3)} hours`);
            console.log(`   Range:    ${rows[0].earliest_utc} → ${rows[0].latest_utc}`);
            console.log();
        }
        
    } catch (err) {
        console.error("❌ Error querying database:", err);
    } finally {
        await db.end();
    }
})();



