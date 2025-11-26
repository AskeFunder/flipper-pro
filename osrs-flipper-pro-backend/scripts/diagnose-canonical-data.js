require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function diagnoseCanonicalData() {
    console.log("🔍 Diagnosing canonical_items data integrity...\n");

    try {
        // 1. Items with price but missing timestamp
        console.log("1️⃣ Checking for items with price but missing timestamp...");
        const { rows: missingTimestamps } = await db.query(`
            SELECT 
                item_id,
                name,
                high,
                low,
                high_timestamp,
                low_timestamp,
                CASE 
                    WHEN high IS NOT NULL AND high_timestamp IS NULL THEN 'high'
                    WHEN low IS NOT NULL AND low_timestamp IS NULL THEN 'low'
                    WHEN high IS NOT NULL AND low_timestamp IS NULL AND low IS NOT NULL AND low_timestamp IS NULL THEN 'both'
                END AS missing_type
            FROM canonical_items
            WHERE (high IS NOT NULL AND high_timestamp IS NULL)
               OR (low IS NOT NULL AND low_timestamp IS NULL)
            ORDER BY item_id
            LIMIT 50
        `);
        console.log(`   Found ${missingTimestamps.length} items with missing timestamps`);
        if (missingTimestamps.length > 0) {
            console.log("   Examples:");
            missingTimestamps.slice(0, 10).forEach(row => {
                console.log(`   - Item ${row.item_id} (${row.name}): ${row.missing_type} timestamp missing`);
            });
        }
        console.log();

        // 2. Items with high and low but missing ROI%
        console.log("2️⃣ Checking for items with high/low but missing ROI%...");
        const { rows: missingROI } = await db.query(`
            SELECT 
                item_id,
                name,
                high,
                low,
                roi_percent,
                margin
            FROM canonical_items
            WHERE high IS NOT NULL 
              AND low IS NOT NULL 
              AND low > 0
              AND roi_percent IS NULL
            ORDER BY item_id
            LIMIT 50
        `);
        console.log(`   Found ${missingROI.length} items with missing ROI% (should be calculable)`);
        if (missingROI.length > 0) {
            console.log("   Examples:");
            missingROI.slice(0, 10).forEach(row => {
                const expectedMargin = Math.floor((row.high || 0) * 0.98) - (row.low || 0);
                const expectedROI = row.low > 0 ? (expectedMargin / row.low) * 100 : null;
                console.log(`   - Item ${row.item_id} (${row.name}): high=${row.high}, low=${row.low}, expected ROI=${expectedROI?.toFixed(2)}%`);
            });
        }
        console.log();

        // 3. Items with price_5m data but missing trend_5m
        console.log("3️⃣ Checking for items with price_5m data but missing trend_5m...");
        const { rows: missingTrend5m } = await db.query(`
            SELECT 
                c.item_id,
                c.name,
                c.price_5m_high,
                c.price_5m_low,
                c.trend_5m,
                COUNT(p5m.id) as price_5m_count,
                MAX(p5m.timestamp) as latest_5m_ts,
                MIN(p5m.timestamp) as earliest_5m_ts
            FROM canonical_items c
            LEFT JOIN price_5m p5m ON p5m.item_id = c.item_id
            WHERE (c.price_5m_high IS NOT NULL OR c.price_5m_low IS NOT NULL)
              AND c.trend_5m IS NULL
            GROUP BY c.item_id, c.name, c.price_5m_high, c.price_5m_low, c.trend_5m
            HAVING COUNT(p5m.id) >= 2
            ORDER BY c.item_id
            LIMIT 50
        `);
        console.log(`   Found ${missingTrend5m.length} items with price_5m data but missing trend_5m`);
        if (missingTrend5m.length > 0) {
            console.log("   Examples:");
            missingTrend5m.slice(0, 10).forEach(row => {
                const timeSpan = row.latest_5m_ts && row.earliest_5m_ts 
                    ? `${Math.floor((row.latest_5m_ts - row.earliest_5m_ts) / 60)} minutes`
                    : 'unknown';
                console.log(`   - Item ${row.item_id} (${row.name}): ${row.price_5m_count} records, span: ${timeSpan}, trend_5m is NULL`);
            });
        }
        console.log();

        // 3b. Deep dive into item 2351 trend calculation
        console.log("3b️⃣ Deep dive: Why is trend_5m missing for item 2351?");
        const now = Math.floor(Date.now() / 1000);
        const { rows: trendCheck } = await db.query(`
            WITH latest_5m AS (
                SELECT DISTINCT ON (item_id) 
                    item_id,
                    avg_high,
                    avg_low,
                    timestamp
                FROM price_5m
                WHERE item_id = 2351
                ORDER BY item_id, timestamp DESC
            ),
            historical_5m AS (
                SELECT DISTINCT ON (item_id)
                    item_id,
                    avg_high,
                    avg_low,
                    timestamp
                FROM price_5m
                WHERE item_id = 2351
                  AND timestamp <= $1 - 300
                ORDER BY item_id, timestamp DESC
            )
            SELECT 
                l.item_id,
                l.avg_high as latest_high,
                l.avg_low as latest_low,
                l.timestamp as latest_ts,
                h.avg_high as historical_high,
                h.avg_low as historical_low,
                h.timestamp as historical_ts,
                CASE 
                    WHEN h.avg_high = 0 OR h.avg_high IS NULL THEN NULL
                    ELSE ROUND(((l.avg_high - h.avg_high)::numeric / h.avg_high * 100), 2)
                END as calculated_trend_high,
                CASE 
                    WHEN h.avg_low = 0 OR h.avg_low IS NULL THEN NULL
                    ELSE ROUND(((l.avg_low - h.avg_low)::numeric / h.avg_low * 100), 2)
                END as calculated_trend_low
            FROM latest_5m l
            LEFT JOIN historical_5m h ON h.item_id = l.item_id
        `, [now]);
        if (trendCheck.length > 0) {
            const tc = trendCheck[0];
            console.log(`   Latest 5m: high=${tc.latest_high}, low=${tc.latest_low}, ts=${tc.latest_ts}`);
            console.log(`   Historical 5m: high=${tc.historical_high}, low=${tc.historical_low}, ts=${tc.historical_ts}`);
            console.log(`   Calculated trend (high): ${tc.calculated_trend_high}%`);
            console.log(`   Calculated trend (low): ${tc.calculated_trend_low}%`);
            console.log(`   Time difference: ${tc.latest_ts && tc.historical_ts ? tc.latest_ts - tc.historical_ts : 'N/A'} seconds`);
        } else {
            console.log("   No price_5m data found for trend calculation");
        }
        console.log();

        // 4. Items with volume_7d but missing turnover_1m
        console.log("4️⃣ Checking for items with volume data but missing turnover_1m...");
        const { rows: missingTurnover1m } = await db.query(`
            SELECT 
                item_id,
                name,
                volume_7d,
                turnover_7d,
                turnover_1m
            FROM canonical_items
            WHERE volume_7d IS NOT NULL 
              AND volume_7d > 0
              AND turnover_1m IS NULL
            ORDER BY item_id
            LIMIT 50
        `);
        console.log(`   Found ${missingTurnover1m.length} items with volume_7d but missing turnover_1m`);
        if (missingTurnover1m.length > 0) {
            console.log("   Examples:");
            missingTurnover1m.slice(0, 10).forEach(row => {
                console.log(`   - Item ${row.item_id} (${row.name}): volume_7d=${row.volume_7d}, turnover_7d=${row.turnover_7d}, turnover_1m=NULL`);
            });
        }
        console.log();

        // 5. Items with calculated fields that should exist
        console.log("5️⃣ Checking for items with high/low but missing calculated fields...");
        const { rows: missingCalculated } = await db.query(`
            SELECT 
                item_id,
                name,
                high,
                low,
                margin,
                roi_percent,
                spread_percent,
                max_profit,
                max_investment
            FROM canonical_items
            WHERE high IS NOT NULL 
              AND low IS NOT NULL
              AND (
                  margin IS NULL
                  OR roi_percent IS NULL
                  OR spread_percent IS NULL
                  OR max_profit IS NULL
                  OR max_investment IS NULL
              )
            ORDER BY item_id
            LIMIT 50
        `);
        console.log(`   Found ${missingCalculated.length} items with missing calculated fields`);
        if (missingCalculated.length > 0) {
            console.log("   Examples:");
            missingCalculated.slice(0, 10).forEach(row => {
                const missing = [];
                if (row.margin === null) missing.push("margin");
                if (row.roi_percent === null) missing.push("roi_percent");
                if (row.spread_percent === null) missing.push("spread_percent");
                if (row.max_profit === null) missing.push("max_profit");
                if (row.max_investment === null) missing.push("max_investment");
                console.log(`   - Item ${row.item_id} (${row.name}): missing ${missing.join(", ")}`);
            });
        }
        console.log();

        // 6. Specific item check (2351 - Iron bar) - Compare canonical vs source data
        console.log("6️⃣ Checking specific item 2351 (Iron bar) - Comparing canonical vs source data...");
        const { rows: ironBar } = await db.query(`
            SELECT 
                c.*,
                pi_high.price as instant_high,
                pi_high.timestamp as instant_high_ts,
                pi_low.price as instant_low,
                pi_low.timestamp as instant_low_ts,
                (SELECT COUNT(*) FROM price_5m WHERE item_id = 2351) as price_5m_count,
                (SELECT COUNT(*) FROM price_1h WHERE item_id = 2351) as price_1h_count,
                (SELECT COUNT(*) FROM price_6h WHERE item_id = 2351) as price_6h_count,
                (SELECT COUNT(*) FROM price_24h WHERE item_id = 2351) as price_24h_count
            FROM canonical_items c
            LEFT JOIN price_instants pi_high ON pi_high.item_id = c.item_id AND pi_high.type = 'high'
            LEFT JOIN price_instants pi_low ON pi_low.item_id = c.item_id AND pi_low.type = 'low'
            WHERE c.item_id = 2351
        `);
        if (ironBar.length > 0) {
            const item = ironBar[0];
            console.log("   📊 Canonical Items Data:");
            console.log(`   - Name: ${item.name}`);
            console.log(`   - High: ${item.high}, High TS: ${item.high_timestamp}`);
            console.log(`   - Low: ${item.low}, Low TS: ${item.low_timestamp}`);
            console.log(`   - ROI%: ${item.roi_percent}`);
            console.log(`   - Margin: ${item.margin}`);
            console.log(`   - Trend 5m: ${item.trend_5m}`);
            console.log(`   - Volume 1h: ${item.volume_1h}, Volume 7d: ${item.volume_7d}`);
            console.log(`   - Turnover 1m: ${item.turnover_1m}`);
            console.log();
            console.log("   📥 Source Data (price_instants):");
            console.log(`   - Instant High: ${item.instant_high}, TS: ${item.instant_high_ts}`);
            console.log(`   - Instant Low: ${item.instant_low}, TS: ${item.instant_low_ts}`);
            console.log();
            console.log("   📈 Aggregated Data Counts:");
            console.log(`   - Price 5m records: ${item.price_5m_count}`);
            console.log(`   - Price 1h records: ${item.price_1h_count}`);
            console.log(`   - Price 6h records: ${item.price_6h_count}`);
            console.log(`   - Price 24h records: ${item.price_24h_count}`);
            console.log();
            
            // Check what SHOULD be calculated
            console.log("   🔍 Expected Calculations:");
            if (item.instant_high && item.instant_low && item.instant_low > 0) {
                const expectedMargin = Math.floor((item.instant_high || 0) * 0.98) - (item.instant_low || 0);
                const expectedROI = (expectedMargin / item.instant_low) * 100;
                console.log(`   - Expected Margin: ${expectedMargin} (actual: ${item.margin})`);
                console.log(`   - Expected ROI%: ${expectedROI.toFixed(2)}% (actual: ${item.roi_percent})`);
                if (item.margin !== expectedMargin || Math.abs((item.roi_percent || 0) - expectedROI) > 0.01) {
                    console.log(`   ⚠️  MISMATCH: Calculations don't match source data!`);
                }
            }
            if (item.instant_low && !item.low_timestamp) {
                console.log(`   ⚠️  PROBLEM: Has low price (${item.instant_low}) but no low_timestamp!`);
            }
            if (item.instant_high && !item.high_timestamp) {
                console.log(`   ⚠️  PROBLEM: Has high price (${item.instant_high}) but no high_timestamp!`);
            }
            if (item.price_5m_count >= 2 && !item.trend_5m) {
                console.log(`   ⚠️  PROBLEM: Has ${item.price_5m_count} price_5m records but trend_5m is NULL!`);
            }
        } else {
            console.log("   Item 2351 not found in canonical_items");
        }
        console.log();

        // 7. Summary statistics
        console.log("7️⃣ Summary Statistics...");
        const { rows: stats } = await db.query(`
            SELECT 
                COUNT(*) as total_items,
                COUNT(CASE WHEN high IS NOT NULL AND high_timestamp IS NULL THEN 1 END) as missing_high_ts,
                COUNT(CASE WHEN low IS NOT NULL AND low_timestamp IS NULL THEN 1 END) as missing_low_ts,
                COUNT(CASE WHEN high IS NOT NULL AND low IS NOT NULL AND low > 0 AND roi_percent IS NULL THEN 1 END) as missing_roi,
                COUNT(CASE WHEN price_5m_high IS NOT NULL AND trend_5m IS NULL THEN 1 END) as missing_trend_5m,
                COUNT(CASE WHEN volume_7d IS NOT NULL AND volume_7d > 0 AND turnover_1m IS NULL THEN 1 END) as missing_turnover_1m
            FROM canonical_items
        `);
        const s = stats[0];
        console.log(`   Total items: ${s.total_items}`);
        console.log(`   Missing high timestamp: ${s.missing_high_ts}`);
        console.log(`   Missing low timestamp: ${s.missing_low_ts}`);
        console.log(`   Missing ROI%: ${s.missing_roi}`);
        console.log(`   Missing trend_5m: ${s.missing_trend_5m}`);
        console.log(`   Missing turnover_1m: ${s.missing_turnover_1m}`);
        console.log();

        // 8. Check what the API would return for item 2351
        console.log("8️⃣ Simulating API response for item 2351...");
        const { rows: apiResponse } = await db.query(`
            SELECT * FROM canonical_items WHERE item_id = 2351
        `);
        if (apiResponse.length > 0) {
            const api = apiResponse[0];
            console.log("   API would return:");
            console.log(`   - low: ${api.low}`);
            console.log(`   - low_timestamp: ${api.low_timestamp}`);
            console.log(`   - roi_percent: ${api.roi_percent}`);
            console.log(`   - trend_5m: ${api.trend_5m}`);
            console.log(`   - volume_1h: ${api.volume_1h}`);
            console.log(`   - turnover_1m: ${api.turnover_1m}`);
            console.log();
            console.log("   Fields that are NULL (would show as missing in frontend):");
            const nullFields = [];
            Object.keys(api).forEach(key => {
                if (api[key] === null && key !== 'name' && key !== 'icon') {
                    nullFields.push(key);
                }
            });
            if (nullFields.length > 0) {
                console.log(`   - ${nullFields.join(", ")}`);
            } else {
                console.log("   - None (all expected fields have values)");
            }
        }
        console.log();

        console.log("✅ Diagnosis complete!");

    } catch (err) {
        console.error("❌ Error during diagnosis:", err);
    } finally {
        await db.end();
    }
}

diagnoseCanonicalData();

