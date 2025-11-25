const db = require('../db/db');
const { calculateBatchTrends } = require('../poller/update-canonical-items');

async function testSingleBatch() {
    const now = Math.floor(Date.now() / 1000);
    
    // Get one batch of items
    const { rows: items } = await db.query(`
        SELECT DISTINCT i.id, i.name, i.icon, i.members, i."limit"
        FROM items i
        LEFT JOIN canonical_items c ON i.id = c.item_id
        LEFT JOIN (
            SELECT item_id, MAX(last_updated) as max_last_updated
            FROM price_instants
            GROUP BY item_id
        ) pi ON i.id = pi.item_id
        WHERE 
            (pi.max_last_updated > c.timestamp_updated OR c.timestamp_updated IS NULL)
            OR (c.timestamp_updated IS NOT NULL AND c.timestamp_updated < $1 - 300)
            OR c.item_id IS NULL
        ORDER BY i.id
        LIMIT 200
    `, [now]);
    
    console.log(`[TEST] Processing batch of ${items.length} items\n`);
    
    const itemIds = items.map(item => item.id);
    const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(',');
    
    const totalStart = Date.now();
    
    // 1. Trends calculation
    let t0 = Date.now();
    const trendsMap = await calculateBatchTrends(itemIds, now);
    console.log(`[TIMING] Trends calculation: ${Date.now() - t0}ms`);
    
    // 2. Batch fetch price_instants
    t0 = Date.now();
    const { rows: allPrices } = await db.query(`
        SELECT item_id, price, timestamp, type
        FROM price_instants
        WHERE item_id IN (${placeholders})
    `, itemIds);
    console.log(`[TIMING] price_instants query: ${Date.now() - t0}ms`);
    
    // 3. Batch fetch volumes - SIMPLIFIED
    t0 = Date.now();
    const { rows: allVolumes } = await db.query(`
        SELECT 
            p5.item_id,
            p5.volume AS vol5m,
            COALESCE(v1.volume, 0) AS vol1h,
            COALESCE(v6.volume, 0) AS vol6h,
            COALESCE(v24.volume, 0) AS vol24h,
            COALESCE(v7.volume, 0) AS vol7d
        FROM (
            SELECT DISTINCT ON (item_id) item_id, volume
            FROM price_5m
            WHERE item_id IN (${placeholders})
            ORDER BY item_id, timestamp DESC
        ) p5
        LEFT JOIN (
            SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
            FROM price_5m
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 1}
            GROUP BY item_id
        ) v1 ON p5.item_id = v1.item_id
        LEFT JOIN (
            SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
            FROM price_5m
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 2}
            GROUP BY item_id
        ) v6 ON p5.item_id = v6.item_id
        LEFT JOIN (
            SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
            FROM price_5m
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 3}
            GROUP BY item_id
        ) v24 ON p5.item_id = v24.item_id
        LEFT JOIN (
            SELECT item_id, COALESCE(SUM(volume), 0)::BIGINT AS volume
            FROM price_1h
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 4}
            GROUP BY item_id
        ) v7 ON p5.item_id = v7.item_id
    `, [...itemIds, now - 3600, now - 21600, now - 86400, now - 604800]);
    console.log(`[TIMING] volumes query: ${Date.now() - t0}ms`);
    
    // 4. Batch fetch prices
    t0 = Date.now();
    const { rows: allPrices5m } = await db.query(`
        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
        FROM price_5m
        WHERE item_id IN (${placeholders})
        ORDER BY item_id, timestamp DESC
    `, itemIds);
    
    const { rows: allPrices1h } = await db.query(`
        SELECT DISTINCT ON (item_id) item_id, avg_high, avg_low
        FROM price_1h
        WHERE item_id IN (${placeholders})
        ORDER BY item_id, timestamp DESC
    `, itemIds);
    console.log(`[TIMING] prices queries: ${Date.now() - t0}ms`);
    
    // 5. Batch fetch turnovers - SIMPLIFIED
    const midExpr = `CASE WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0 WHEN avg_high IS NOT NULL THEN avg_high WHEN avg_low IS NOT NULL THEN avg_low ELSE NULL END`;
    t0 = Date.now();
    const { rows: allTurnovers } = await db.query(`
        SELECT 
            t5.item_id,
            COALESCE(t5.turnover, 0)::NUMERIC(20,0) AS to5m,
            COALESCE(t1.turnover, 0)::NUMERIC(20,0) AS to1h,
            COALESCE(t6.turnover, 0)::NUMERIC(20,0) AS to6h,
            COALESCE(t24.turnover, 0)::NUMERIC(20,0) AS to24h,
            COALESCE(t7.turnover, 0)::NUMERIC(20,0) AS to7d,
            COALESCE(tm.turnover, 0)::NUMERIC(20,0) AS to1m
        FROM (
            SELECT DISTINCT ON (item_id) item_id, 
                COALESCE((${midExpr} * volume), 0)::NUMERIC(20,0) AS turnover
            FROM price_5m
            WHERE item_id IN (${placeholders})
            ORDER BY item_id, timestamp DESC
        ) t5
        LEFT JOIN (
            SELECT item_id, COALESCE(SUM(${midExpr} * volume), 0)::NUMERIC(20,0) AS turnover
            FROM price_5m
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 1}
            GROUP BY item_id
        ) t1 ON t5.item_id = t1.item_id
        LEFT JOIN (
            SELECT item_id, COALESCE(SUM(${midExpr} * volume), 0)::NUMERIC(20,0) AS turnover
            FROM price_5m
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 2}
            GROUP BY item_id
        ) t6 ON t5.item_id = t6.item_id
        LEFT JOIN (
            SELECT item_id, COALESCE(SUM(${midExpr} * volume), 0)::NUMERIC(20,0) AS turnover
            FROM price_5m
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 3}
            GROUP BY item_id
        ) t24 ON t5.item_id = t24.item_id
        LEFT JOIN (
            SELECT item_id, COALESCE(SUM(${midExpr} * volume), 0)::NUMERIC(20,0) AS turnover
            FROM price_1h
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 4}
            GROUP BY item_id
        ) t7 ON t5.item_id = t7.item_id
        LEFT JOIN (
            SELECT item_id, COALESCE(SUM(${midExpr} * volume), 0)::NUMERIC(20,0) AS turnover
            FROM price_6h
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 5}
            GROUP BY item_id
        ) tm ON t5.item_id = tm.item_id
    `, [...itemIds, now - 3600, now - 21600, now - 86400, now - 604800, now - 2592000]);
    console.log(`[TIMING] turnovers query: ${Date.now() - t0}ms`);
    
    // 6. Batch fetch buy/sell rates
    t0 = Date.now();
    const { rows: allBSR } = await db.query(`
        SELECT 
            b5.item_id,
            b5.ratio AS bsr5m,
            b1.ratio AS bsr1h
        FROM (
            SELECT item_id,
                CASE 
                    WHEN SUM(low_volume) = 0 THEN NULL
                    ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                END AS ratio
            FROM price_5m
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 1}
            GROUP BY item_id
        ) b5
        LEFT JOIN (
            SELECT item_id,
                CASE 
                    WHEN SUM(low_volume) = 0 THEN NULL
                    ELSE ROUND(SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0), 2)
                END AS ratio
            FROM price_5m
            WHERE item_id IN (${placeholders}) AND timestamp >= $${itemIds.length + 2}
            GROUP BY item_id
        ) b1 ON b5.item_id = b1.item_id
    `, [...itemIds, now - 300, now - 3600]);
    console.log(`[TIMING] buy/sell rates query: ${Date.now() - t0}ms`);
    
    // 7. Process and prepare bulk insert
    t0 = Date.now();
    const pricesByItem = {};
    for (const price of allPrices) {
        if (!pricesByItem[price.item_id]) {
            pricesByItem[price.item_id] = {};
        }
        pricesByItem[price.item_id][price.type] = price;
    }
    
    const volumesByItem = {};
    for (const vol of allVolumes) {
        volumesByItem[vol.item_id] = {
            volume5m: vol.vol5m,
            volume1h: vol.vol1h,
            volume6h: vol.vol6h,
            volume24h: vol.vol24h,
            volume7d: vol.vol7d
        };
    }
    
    const prices5mByItem = {};
    for (const p of allPrices5m) {
        prices5mByItem[p.item_id] = { high: p.avg_high, low: p.avg_low };
    }
    
    const prices1hByItem = {};
    for (const p of allPrices1h) {
        prices1hByItem[p.item_id] = { high: p.avg_high, low: p.avg_low };
    }
    
    const turnoversByItem = {};
    for (const to of allTurnovers) {
        turnoversByItem[to.item_id] = {
            turnover5m: String(to.to5m),
            turnover1h: String(to.to1h),
            turnover6h: String(to.to6h),
            turnover24h: String(to.to24h),
            turnover7d: String(to.to7d),
            turnover1m: String(to.to1m)
        };
    }
    
    const bsrByItem = {};
    for (const bsr of allBSR) {
        bsrByItem[bsr.item_id] = {
            buySellRate5m: bsr.bsr5m,
            buySellRate1h: bsr.bsr1h
        };
    }
    
    const insertValues = [];
    for (const item of items) {
        const itemId = item.id;
        const trends = trendsMap.get(itemId) || {};
        
        const prices = pricesByItem[itemId];
        if (!prices || !prices.high || !prices.low) {
            continue;
        }
        
        const high = prices.high.price;
        const low = prices.low.price;
        const highTs = prices.high.timestamp;
        const lowTs = prices.low.timestamp;
        
        const margin = Math.floor(high * 0.98) - low;
        const roiPercent = low > 0 ? parseFloat(((margin * 100.0) / low).toFixed(2)) : null;
        const spreadPercent = high > 0 ? parseFloat(((high - low) * 100.0 / high).toFixed(2)) : null;
        const maxProfit = (BigInt(margin) * BigInt(item.limit || 0)).toString();
        const maxInvestment = (BigInt(low) * BigInt(item.limit || 0)).toString();
        
        const vols = volumesByItem[itemId] || {};
        const p5m = prices5mByItem[itemId] || {};
        const p1h = prices1hByItem[itemId] || {};
        const tos = turnoversByItem[itemId] || {};
        const bsr = bsrByItem[itemId] || {};
        
        insertValues.push([
            itemId, item.name, item.icon, item.members, item.limit,
            high, low, highTs, lowTs,
            margin, roiPercent, spreadPercent, maxProfit, maxInvestment,
            vols.volume5m ?? null, vols.volume1h ?? 0, vols.volume6h ?? 0, vols.volume24h ?? 0, vols.volume7d ?? 0,
            p5m.high || null, p5m.low || null, p1h.high || null, p1h.low || null,
            tos.turnover5m || '0', tos.turnover1h || '0', tos.turnover6h || '0', tos.turnover24h || '0', tos.turnover7d || '0', tos.turnover1m || '0',
            bsr.buySellRate5m || null, bsr.buySellRate1h || null,
            trends.trend_5m ?? null, trends.trend_1h ?? null, trends.trend_6h ?? null, trends.trend_24h ?? null, trends.trend_7d ?? null, trends.trend_1m ?? null,
            now
        ]);
    }
    console.log(`[TIMING] Data processing: ${Date.now() - t0}ms`);
    
    // 8. Bulk insert
    t0 = Date.now();
    if (insertValues.length > 0) {
        const valuesPlaceholders = insertValues.map((_, i) => {
            const base = i * 38;
            return `(${Array.from({length: 38}, (_, j) => `$${base + j + 1}`).join(', ')})`;
        }).join(', ');
        
        const allValues = insertValues.flat();
        
        await db.query(`
            INSERT INTO canonical_items (
                item_id, name, icon, members, "limit",
                high, low, high_timestamp, low_timestamp,
                margin, roi_percent, spread_percent, max_profit, max_investment,
                volume_5m, volume_1h, volume_6h, volume_24h, volume_7d,
                price_5m_high, price_5m_low, price_1h_high, price_1h_low,
                turnover_5m, turnover_1h, turnover_6h, turnover_24h, turnover_7d, turnover_1m,
                buy_sell_rate_5m, buy_sell_rate_1h,
                trend_5m, trend_1h, trend_6h, trend_24h, trend_7d, trend_1m,
                timestamp_updated
            ) VALUES ${valuesPlaceholders}
            ON CONFLICT (item_id) DO UPDATE SET
                name = EXCLUDED.name,
                icon = EXCLUDED.icon,
                members = EXCLUDED.members,
                "limit" = EXCLUDED."limit",
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                high_timestamp = EXCLUDED.high_timestamp,
                low_timestamp = EXCLUDED.low_timestamp,
                margin = EXCLUDED.margin,
                roi_percent = EXCLUDED.roi_percent,
                spread_percent = EXCLUDED.spread_percent,
                max_profit = EXCLUDED.max_profit,
                max_investment = EXCLUDED.max_investment,
                volume_5m = EXCLUDED.volume_5m,
                volume_1h = EXCLUDED.volume_1h,
                volume_6h = EXCLUDED.volume_6h,
                volume_24h = EXCLUDED.volume_24h,
                volume_7d = EXCLUDED.volume_7d,
                price_5m_high = EXCLUDED.price_5m_high,
                price_5m_low = EXCLUDED.price_5m_low,
                price_1h_high = EXCLUDED.price_1h_high,
                price_1h_low = EXCLUDED.price_1h_low,
                turnover_5m = EXCLUDED.turnover_5m,
                turnover_1h = EXCLUDED.turnover_1h,
                turnover_6h = EXCLUDED.turnover_6h,
                turnover_24h = EXCLUDED.turnover_24h,
                turnover_7d = EXCLUDED.turnover_7d,
                turnover_1m = EXCLUDED.turnover_1m,
                buy_sell_rate_5m = EXCLUDED.buy_sell_rate_5m,
                buy_sell_rate_1h = EXCLUDED.buy_sell_rate_1h,
                trend_5m = EXCLUDED.trend_5m,
                trend_1h = EXCLUDED.trend_1h,
                trend_6h = EXCLUDED.trend_6h,
                trend_24h = EXCLUDED.trend_24h,
                trend_7d = EXCLUDED.trend_7d,
                trend_1m = EXCLUDED.trend_1m,
                timestamp_updated = EXCLUDED.timestamp_updated
        `, allValues);
    }
    console.log(`[TIMING] Bulk insert: ${Date.now() - t0}ms`);
    
    const totalTime = Date.now() - totalStart;
    console.log(`\n[TOTAL] Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`[RESULT] ${insertValues.length} items processed`);
    
    if (totalTime < 1000) {
        console.log('✅ SUCCESS: Batch completed in under 1 second!');
    } else {
        console.log('⚠️ WARNING: Batch took longer than 1 second');
    }
    
    await db.end();
}

testSingleBatch().catch(console.error);




