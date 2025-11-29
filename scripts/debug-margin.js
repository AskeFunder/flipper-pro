require("dotenv").config();
const { Pool } = require("pg");
const taxExemptItems = require("../config/tax-exempt-items");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Example: high=688, low=670
const high = 688;
const low = 670;

async function debugMargin() {
    try {
        // Find items with high around 688 and low around 670
        const { rows } = await db.query(`
            SELECT 
                i.id,
                i.name,
                ci.high,
                ci.low,
                ci.margin
            FROM canonical_items ci
            JOIN items i ON i.id = ci.item_id
            WHERE ci.high BETWEEN 680 AND 700
              AND ci.low BETWEEN 660 AND 680
            ORDER BY ABS(ci.high - 688) + ABS(ci.low - 670)
            LIMIT 10
        `);
        
        console.log(`Found ${rows.length} items with similar prices:\n`);
        rows.forEach(row => {
            const isTaxExempt = taxExemptItems.has(row.name);
            const tax = isTaxExempt ? 0 : Math.floor(row.high * 0.02);
            const expectedMargin = row.high - tax - row.low;
            
            console.log(`Item ${row.id}: "${row.name}"`);
            console.log(`  High: ${row.high}, Low: ${row.low}`);
            console.log(`  Canonical margin: ${row.margin}`);
            console.log(`  Is tax-exempt: ${isTaxExempt}`);
            console.log(`  Tax: ${tax}`);
            console.log(`  Expected margin: ${expectedMargin}`);
            console.log(`  Match: ${row.margin === expectedMargin ? '✓' : '✗'}`);
            console.log();
        });
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

debugMargin();



