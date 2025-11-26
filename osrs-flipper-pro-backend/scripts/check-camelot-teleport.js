require("dotenv").config();
const { Pool } = require("pg");
const taxExemptItems = require("../config/tax-exempt-items");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkCamelotTeleport() {
    try {
        // Find Camelot teleport item
        const { rows: items } = await db.query(`
            SELECT i.id, i.name, c.high, c.low, c.margin, c.roi_percent
            FROM items i
            JOIN canonical_items c ON c.item_id = i.id
            WHERE i.name LIKE '%Camelot%' OR i.name LIKE '%camelot%'
        `);

        console.log(`Found ${items.length} Camelot teleport items:\n`);

        for (const item of items) {
            console.log(`Item ID: ${item.id}`);
            console.log(`Name: "${item.name}"`);
            console.log(`High: ${item.high}, Low: ${item.low}`);
            console.log(`Canonical margin: ${item.margin}`);
            console.log(`Canonical ROI%: ${item.roi_percent}`);
            
            // Check if it's tax-exempt
            const isTaxExempt = taxExemptItems.has(item.name);
            console.log(`Is tax-exempt: ${isTaxExempt}`);
            
            // Calculate expected margins
            const tax = Math.floor(item.high * 0.02);
            const expectedMarginNoTax = item.high - item.low;
            const expectedMarginWithTax = item.high - tax - item.low;
            
            console.log(`Expected margin (no tax): ${expectedMarginNoTax}`);
            console.log(`Expected margin (with tax): ${expectedMarginWithTax}`);
            console.log(`Tax amount: ${tax}`);
            
            if (isTaxExempt) {
                if (item.margin === expectedMarginNoTax) {
                    console.log(`✅ CORRECT: Margin matches expected (no tax)`);
                } else if (item.margin === expectedMarginWithTax) {
                    console.log(`❌ WRONG: Margin has tax applied (should be exempt)`);
                    console.log(`   Difference: ${expectedMarginNoTax - item.margin} gp (tax was incorrectly applied)`);
                } else {
                    const diff = Math.abs(item.margin - expectedMarginNoTax);
                    if (diff <= 1) {
                        console.log(`✅ CORRECT: Margin is close to expected (no tax, diff: ${diff})`);
                    } else {
                        console.log(`⚠️  UNEXPECTED: Margin doesn't match either calculation (diff from no-tax: ${diff})`);
                    }
                }
            } else {
                if (item.margin === expectedMarginWithTax) {
                    console.log(`✅ CORRECT: Margin matches expected (with tax)`);
                } else if (item.margin === expectedMarginNoTax) {
                    console.log(`❌ WRONG: Margin missing tax (should have tax applied)`);
                    console.log(`   Difference: ${item.margin - expectedMarginWithTax} gp (tax was not applied)`);
                } else {
                    const diff = Math.abs(item.margin - expectedMarginWithTax);
                    if (diff <= 1) {
                        console.log(`✅ CORRECT: Margin is close to expected (with tax, diff: ${diff})`);
                    } else {
                        console.log(`⚠️  UNEXPECTED: Margin doesn't match expected (diff: ${diff})`);
                    }
                }
            }
            
            // Also check what API would return
            const { rows: apiData } = await db.query(`
                SELECT
                    h.price AS high,
                    l.price AS low,
                    h.timestamp AS ts,
                    l.timestamp AS "lowTs"
                FROM price_instants h
                JOIN price_instants l ON h.item_id = l.item_id AND l.type = 'low'
                WHERE h.item_id = $1 AND h.type = 'high'
            `, [item.id]);
            
            if (apiData.length > 0) {
                const api = apiData[0];
                const apiHigh = api.high;
                const apiLow = api.low;
                const apiTax = isTaxExempt ? 0 : Math.floor(apiHigh * 0.02);
                const apiMargin = apiHigh - apiTax - apiLow;
                console.log(`\nAPI would return:`);
                console.log(`  High: ${apiHigh}, Low: ${apiLow}`);
                console.log(`  Tax: ${apiTax} (tax-exempt: ${isTaxExempt})`);
                console.log(`  Margin: ${apiMargin}`);
            }
            
            console.log(`\n${'='.repeat(50)}\n`);
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await db.end();
    }
}

checkCamelotTeleport();

