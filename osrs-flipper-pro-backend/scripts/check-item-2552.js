require("dotenv").config();
const { Pool } = require("pg");
const taxExemptItems = require("../config/tax-exempt-items");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkItem() {
    try {
        const { rows } = await db.query(`
            SELECT 
                i.id,
                i.name,
                ci.high,
                ci.low,
                ci.margin
            FROM canonical_items ci
            JOIN items i ON i.id = ci.item_id
            WHERE i.id = 2552
        `);
        
        if (rows.length === 0) {
            console.log("Item 2552 not found");
            await db.end();
            return;
        }
        
        const row = rows[0];
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
        
        if (!isTaxExempt && row.margin !== expectedMargin) {
            console.log(`\n⚠️  Item should be tax-exempt but is not recognized!`);
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

checkItem();



