require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function testApiLatest(itemId) {
    console.log(`Testing /api/prices/latest/${itemId}...\n`);

    try {
        // Simulate the exact query from the API
        const sql = `
            SELECT
                h.price      AS high,
                h.timestamp  AS ts,
                l.price      AS low,
                l.timestamp  AS "lowTs"
            FROM price_instants h
            JOIN price_instants l
              ON h.item_id = l.item_id
             AND l.type    = 'low'
            WHERE h.item_id = $1
              AND h.type    = 'high'
        `;
        const { rows } = await db.query(sql, [itemId]);
        
        console.log(`Query returned ${rows.length} rows`);
        
        if (rows.length === 0) {
            console.log("⚠️  No data returned - checking why...");
            
            // Check if high exists
            const { rows: highRows } = await db.query(`
                SELECT price, timestamp, type FROM price_instants 
                WHERE item_id = $1 AND type = 'high'
            `, [itemId]);
            console.log(`High records: ${highRows.length}`);
            if (highRows.length > 0) {
                console.log(`  - High: ${highRows[0].price}, TS: ${highRows[0].timestamp}`);
            }
            
            // Check if low exists
            const { rows: lowRows } = await db.query(`
                SELECT price, timestamp, type FROM price_instants 
                WHERE item_id = $1 AND type = 'low'
            `, [itemId]);
            console.log(`Low records: ${lowRows.length}`);
            if (lowRows.length > 0) {
                console.log(`  - Low: ${lowRows[0].price}, TS: ${lowRows[0].timestamp}`);
            }
            
            if (highRows.length > 0 && lowRows.length === 0) {
                console.log("❌ PROBLEM: Has high but no low - JOIN fails!");
            } else if (highRows.length === 0 && lowRows.length > 0) {
                console.log("❌ PROBLEM: Has low but no high - JOIN fails!");
            } else if (highRows.length === 0 && lowRows.length === 0) {
                console.log("❌ PROBLEM: No price_instants records at all!");
            }
        } else {
            console.log("✅ Data returned:");
            console.log("Full row object:", JSON.stringify(rows[0], null, 2));
            
            const row = rows[0];
            const high = row.high;
            const low = row.low;
            const ts = row.ts;
            const lowTs = row.lowTs || row.lowts; // Handle both cases
            
            console.log(`  - High: ${high}, TS: ${ts}`);
            console.log(`  - Low: ${low}, TS: ${lowTs}`);
            
            if (lowTs === null || lowTs === undefined) {
                console.log("⚠️  PROBLEM: lowTs is still null/undefined!");
                console.log("  Row keys:", Object.keys(row));
            } else {
                console.log("✅ lowTs is now accessible!");
            }
            
            const margin = Math.floor(high * 0.98) - low;
            const roi = low > 0 ? parseFloat(((margin * 100.0 / low).toFixed(2))) : 0;
            console.log(`  - Calculated Margin: ${margin}`);
            console.log(`  - Calculated ROI: ${roi}%`);
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await db.end();
    }
}

const itemId = process.argv[2] || 2351;
testApiLatest(parseInt(itemId, 10));

