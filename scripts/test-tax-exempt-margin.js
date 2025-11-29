require("dotenv").config();
const { Pool } = require("pg");
const taxExemptItems = require("../config/tax-exempt-items");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function testTaxExemptMargin() {
    console.log("🧪 Testing tax-exempt items margin calculation...\n");

    try {
        // Get all tax-exempt items from database
        const taxExemptArray = Array.from(taxExemptItems);
        const placeholders = taxExemptArray.map((_, i) => `$${i + 1}`).join(',');
        
        const { rows: items } = await db.query(`
            SELECT i.id, i.name, c.high, c.low, c.margin
            FROM items i
            JOIN canonical_items c ON c.item_id = i.id
            WHERE i.name IN (${placeholders})
            ORDER BY i.name
        `, taxExemptArray);

        console.log(`Found ${items.length} tax-exempt items in database\n`);

        if (items.length === 0) {
            console.log("⚠️  No tax-exempt items found in database");
            console.log("   This might mean:");
            console.log("   - Items haven't been synced yet");
            console.log("   - Item names don't match exactly");
            return;
        }

        let passed = 0;
        let failed = 0;
        const failures = [];

        for (const item of items) {
            const isTaxExempt = taxExemptItems.has(item.name);
            
            if (!isTaxExempt) {
                console.log(`⚠️  Item ${item.id} (${item.name}) is in database but not in tax-exempt list`);
                continue;
            }

            if (item.high == null || item.low == null) {
                console.log(`⏭️  Item ${item.id} (${item.name}): No price data, skipping`);
                continue;
            }

            // Calculate expected margin (no tax for tax-exempt items)
            const expectedMargin = item.high - item.low; // No tax
            const actualMargin = item.margin;

            // Also calculate what margin WOULD be with tax (for comparison)
            const tax = Math.floor(item.high * 0.02);
            const marginWithTax = item.high - tax - item.low;

            // Check if margin matches expected (no tax) or if tax was incorrectly applied
            if (actualMargin === expectedMargin) {
                // Perfect match - correct!
                passed++;
                console.log(`✅ Item ${item.id} (${item.name}): margin=${actualMargin} (correct, no tax)`);
            } else if (actualMargin === marginWithTax && marginWithTax !== expectedMargin) {
                // Margin matches the "with tax" calculation - tax was incorrectly applied!
                failed++;
                failures.push({
                    id: item.id,
                    name: item.name,
                    high: item.high,
                    low: item.low,
                    expected: expectedMargin,
                    actual: actualMargin,
                    withTax: marginWithTax,
                    issue: 'Has tax applied (should be exempt)'
                });
                console.log(`❌ Item ${item.id} (${item.name}): margin=${actualMargin}, expected=${expectedMargin} (tax was applied!)`);
            } else {
                // Some other value - might be correct if close, or might be wrong
                const diff = Math.abs(actualMargin - expectedMargin);
                if (diff <= 1 && actualMargin >= marginWithTax) {
                    // Close enough and at least as good as with-tax (probably correct)
                    passed++;
                    console.log(`✅ Item ${item.id} (${item.name}): margin=${actualMargin}, expected=${expectedMargin} (close, probably correct)`);
                } else {
                    // Significantly different - likely a problem
                    failed++;
                    failures.push({
                        id: item.id,
                        name: item.name,
                        high: item.high,
                        low: item.low,
                        expected: expectedMargin,
                        actual: actualMargin,
                        withTax: marginWithTax,
                        issue: actualMargin === marginWithTax ? 'Has tax applied (should be exempt)' : 'Unexpected margin value'
                    });
                    console.log(`❌ Item ${item.id} (${item.name}): margin=${actualMargin}, expected=${expectedMargin} (difference: ${diff})`);
                }
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Total tax-exempt items tested: ${items.length}`);
        console.log(`   ✅ Passed: ${passed}`);
        console.log(`   ❌ Failed: ${failed}`);

        if (failures.length > 0) {
            console.log(`\n❌ Failed items:`);
            failures.forEach(f => {
                console.log(`   - Item ${f.id} (${f.name}):`);
                console.log(`     High: ${f.high}, Low: ${f.low}`);
                console.log(`     Expected margin (no tax): ${f.expected}`);
                console.log(`     Actual margin: ${f.actual}`);
                console.log(`     Margin with tax: ${f.withTax}`);
                console.log(`     Issue: ${f.issue}`);
            });
        }

        // Also check a few non-tax-exempt items to ensure they DO have tax
        console.log(`\n🔍 Checking non-tax-exempt items (should have tax)...`);
        const { rows: nonExemptItems } = await db.query(`
            SELECT i.id, i.name, c.high, c.low, c.margin
            FROM items i
            JOIN canonical_items c ON c.item_id = i.id
            WHERE i.name NOT IN (${placeholders})
              AND c.high IS NOT NULL
              AND c.low IS NOT NULL
              AND c.high > 50
              AND c.high != c.low
            ORDER BY RANDOM()
            LIMIT 20
        `, taxExemptArray);

        let nonExemptPassed = 0;
        let nonExemptFailed = 0;
        const nonExemptFailures = [];

        for (const item of nonExemptItems) {
            const tax = Math.floor(item.high * 0.02);
            const expectedMarginWithTax = item.high - tax - item.low;
            const expectedMarginWithoutTax = item.high - item.low;
            const actualMargin = item.margin;

            // Check if margin matches the "with tax" calculation
            if (actualMargin === expectedMarginWithTax) {
                nonExemptPassed++;
                console.log(`✅ Item ${item.id} (${item.name}): margin=${actualMargin}, tax=${tax} (correct, has tax)`);
            } else if (actualMargin === expectedMarginWithoutTax) {
                nonExemptFailed++;
                nonExemptFailures.push({
                    id: item.id,
                    name: item.name,
                    high: item.high,
                    low: item.low,
                    expectedWithTax: expectedMarginWithTax,
                    expectedWithoutTax: expectedMarginWithoutTax,
                    actual: actualMargin,
                    issue: 'Missing tax (should have tax applied)'
                });
                console.log(`❌ Item ${item.id} (${item.name}): margin=${actualMargin}, expected with tax=${expectedMarginWithTax} (tax NOT applied!)`);
            } else {
                // Some other value
                const diff = Math.abs(actualMargin - expectedMarginWithTax);
                if (diff <= 1) {
                    nonExemptPassed++;
                    console.log(`✅ Item ${item.id} (${item.name}): margin=${actualMargin}, expected=${expectedMarginWithTax} (close, probably correct)`);
                } else {
                    nonExemptFailed++;
                    nonExemptFailures.push({
                        id: item.id,
                        name: item.name,
                        high: item.high,
                        low: item.low,
                        expectedWithTax: expectedMarginWithTax,
                        expectedWithoutTax: expectedMarginWithoutTax,
                        actual: actualMargin,
                        issue: 'Unexpected margin value'
                    });
                    console.log(`⚠️  Item ${item.id} (${item.name}): margin=${actualMargin}, expected=${expectedMarginWithTax} (difference: ${diff})`);
                }
            }
        }

        console.log(`\n📊 Non-tax-exempt items summary:`);
        console.log(`   Total tested: ${nonExemptItems.length}`);
        console.log(`   ✅ Passed (has tax): ${nonExemptPassed}`);
        console.log(`   ❌ Failed (missing tax): ${nonExemptFailed}`);

        if (nonExemptFailures.length > 0) {
            console.log(`\n❌ Non-tax-exempt items with issues:`);
            nonExemptFailures.forEach(f => {
                console.log(`   - Item ${f.id} (${f.name}):`);
                console.log(`     High: ${f.high}, Low: ${f.low}`);
                console.log(`     Expected margin (with tax): ${f.expectedWithTax}`);
                console.log(`     Expected margin (without tax): ${f.expectedWithoutTax}`);
                console.log(`     Actual margin: ${f.actual}`);
                console.log(`     Issue: ${f.issue}`);
            });
        }

    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await db.end();
    }
}

testTaxExemptMargin();

