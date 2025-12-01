#!/usr/bin/env node

/**
 * Diagnose canonical item data issues
 * Usage: node scripts/diagnose-canonical-item.js <item_id>
 */

require("dotenv").config();
const db = require("../db/db");

const itemId = parseInt(process.argv[2]);

if (!itemId) {
    console.error("Usage: node scripts/diagnose-canonical-item.js <item_id>");
    process.exit(1);
}

async function diagnose() {
    try {
        // Get canonical data
        const canonical = await db.query(`
            SELECT 
                item_id, name,
                trend_24h, buy_sell_rate_24h,
                high, low,
                volume_24h,
                price_24h_high, price_24h_low
            FROM canonical_items
            WHERE item_id = $1
        `, [itemId]);

        if (canonical.rows.length === 0) {
            console.log(`❌ Item ${itemId} not found in canonical_items`);
            process.exit(1);
        }

        const item = canonical.rows[0];
        console.log(`\n📊 Canonical Data for Item ${itemId} (${item.name}):`);
        console.log("=".repeat(60));
        console.log(`Trend 24h: ${item.trend_24h}%`);
        console.log(`Buy/Sell Rate 24h: ${item.buy_sell_rate_24h}`);
        console.log(`Current High: ${item.high}, Low: ${item.low}`);
        console.log(`Volume 24h: ${item.volume_24h}`);
        console.log(`Price 24h High: ${item.price_24h_high}, Low: ${item.price_24h_low}`);

        // Check price_5m data for buy/sell rate calculation
        const now = Math.floor(Date.now() / 1000);
        const bsrData = await db.query(`
            SELECT 
                SUM(CASE WHEN timestamp >= $2 THEN high_volume ELSE 0 END) as high_vol_sum,
                SUM(CASE WHEN timestamp >= $2 THEN low_volume ELSE 0 END) as low_vol_sum,
                COUNT(*) as candle_count,
                MIN(timestamp) as min_ts,
                MAX(timestamp) as max_ts
            FROM price_5m
            WHERE item_id = $1 AND timestamp >= $2
        `, [itemId, now - 86400]);

        if (bsrData.rows.length > 0) {
            const bsr = bsrData.rows[0];
            const calculatedBSR = bsr.low_vol_sum > 0 
                ? (parseFloat(bsr.high_vol_sum) / parseFloat(bsr.low_vol_sum)).toFixed(2)
                : null;
            
            console.log(`\n📈 Buy/Sell Rate 24h Calculation:`);
            console.log(`   High Volume Sum: ${bsr.high_vol_sum}`);
            console.log(`   Low Volume Sum: ${bsr.low_vol_sum}`);
            console.log(`   Calculated BSR: ${calculatedBSR}`);
            console.log(`   Stored BSR: ${item.buy_sell_rate_24h}`);
            console.log(`   Candle Count: ${bsr.candle_count}`);
            console.log(`   Time Range: ${new Date(bsr.min_ts * 1000).toISOString()} to ${new Date(bsr.max_ts * 1000).toISOString()}`);
        }

        // Check trend calculation - get latest and 24h ago prices
        const trendData = await db.query(`
            SELECT 
                timestamp,
                avg_high,
                avg_low,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END as mid_price
            FROM price_5m
            WHERE item_id = $1 
              AND timestamp >= $2
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY timestamp DESC
            LIMIT 1
        `, [itemId, now - 300]);

        const trendData24h = await db.query(`
            SELECT 
                timestamp,
                avg_high,
                avg_low,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END as mid_price
            FROM price_5m
            WHERE item_id = $1 
              AND timestamp >= $2
              AND timestamp <= $3
              AND ABS(timestamp - $4) <= 3600
              AND (avg_high IS NOT NULL OR avg_low IS NOT NULL)
            ORDER BY ABS(timestamp - $4) ASC, timestamp DESC
            LIMIT 1
        `, [itemId, now - 172800, now - 86400, now - 86400]);

        if (trendData.rows.length > 0 && trendData24h.rows.length > 0) {
            const nowPrice = parseFloat(trendData.rows[0].mid_price);
            const thenPrice = parseFloat(trendData24h.rows[0].mid_price);
            const calculatedTrend = thenPrice > 0 ? ((nowPrice - thenPrice) / thenPrice) * 100 : null;

            console.log(`\n📈 Trend 24h Calculation:`);
            console.log(`   Now Price (${new Date(trendData.rows[0].timestamp * 1000).toISOString()}): ${nowPrice}`);
            console.log(`   Then Price (${new Date(trendData24h.rows[0].timestamp * 1000).toISOString()}): ${thenPrice}`);
            console.log(`   Calculated Trend: ${calculatedTrend?.toFixed(2)}%`);
            console.log(`   Stored Trend: ${item.trend_24h}%`);
            console.log(`   Difference: ${calculatedTrend && item.trend_24h ? (calculatedTrend - parseFloat(item.trend_24h)).toFixed(2) : 'N/A'}%`);
        } else {
            console.log(`\n⚠️  Could not find price data for trend calculation`);
            if (trendData.rows.length === 0) {
                console.log(`   No recent price_5m data found`);
            }
            if (trendData24h.rows.length === 0) {
                console.log(`   No 24h ago price_5m data found`);
            }
        }

        // Show recent price_5m candles
        const recentCandles = await db.query(`
            SELECT 
                timestamp,
                avg_high,
                avg_low,
                high_volume,
                low_volume,
                CASE 
                    WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
                    WHEN avg_high IS NOT NULL THEN avg_high
                    WHEN avg_low IS NOT NULL THEN avg_low
                    ELSE NULL
                END as mid_price
            FROM price_5m
            WHERE item_id = $1 
              AND timestamp >= $2
            ORDER BY timestamp DESC
            LIMIT 10
        `, [itemId, now - 86400]);

        if (recentCandles.rows.length > 0) {
            console.log(`\n📋 Recent Price 5m Candles (last 24h):`);
            recentCandles.rows.forEach((candle, i) => {
                console.log(`   ${i + 1}. ${new Date(candle.timestamp * 1000).toISOString()}: Mid=${candle.mid_price?.toFixed(0)}, High=${candle.avg_high}, Low=${candle.avg_low}, HV=${candle.high_volume}, LV=${candle.low_volume}`);
            });
        }

    } catch (err) {
        console.error("Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
}

diagnose();




