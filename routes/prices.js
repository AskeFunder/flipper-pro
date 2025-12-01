const express = require('express');
const router = express.Router();
const db = require('../db/db');
const taxExemptItems = require('../config/tax-exempt-items');

// ─── Trend Helpers ─────────────────────────────────────────────────────────────
function calcTrend(curr, prev) {
    if (curr == null || prev == null || prev === 0) return null;
    return Math.round(((curr - prev) * 10000) / prev) / 100;
}

async function getTrendPct(table, itemId) {
    const res = await db.query(`
        SELECT avg_high, avg_low
        FROM ${table}
        WHERE item_id = $1
        ORDER BY timestamp DESC
        LIMIT 2
    `, [itemId]);

    if (res.rows.length < 2) return null;
    const [curr, prev] = res.rows.map(r => r.avg_high ?? r.avg_low ?? null);
    return calcTrend(curr, prev);
}

async function getTrendRange(table, itemId, seconds) {
    const now = Math.floor(Date.now() / 1000);
    const floor = now - seconds;
    const res = await db.query(`
        SELECT avg_high, avg_low
        FROM ${table}
        WHERE item_id = $1 AND timestamp >= $2
        ORDER BY timestamp ASC
    `, [itemId, floor]);

    if (res.rows.length < 2) return null;
    const oldest = res.rows[0].avg_high ?? res.rows[0].avg_low ?? null;
    const newest = res.rows[res.rows.length - 1].avg_high ?? res.rows[res.rows.length - 1].avg_low ?? null;
    return calcTrend(newest, oldest);
}

// ─── GET /prices/latest/:id ────────────────────────────────────────────────────
// Returns { high, low, margin, roi, ts, lowTs, trend_5m ... trend_1m }
router.get('/latest/:id', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    try {
        // Get item name to check if tax-exempt
        const itemQuery = await db.query(`SELECT name FROM items WHERE id = $1`, [itemId]);
        const itemName = itemQuery.rows.length > 0 ? itemQuery.rows[0].name : null;
        const isTaxExempt = itemName && taxExemptItems.has(itemName);
        
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
        if (rows.length === 0) return res.status(404).json({ error: 'No data for item ' + itemId });

        const row = rows[0];
        const high = row.high;
        const low = row.low;
        const ts = row.ts;
        const lowTs = row.lowTs || row.lowts; // Handle both cases for PostgreSQL case sensitivity
        // Tax is 2% of high price, rounded down to nearest whole number (unless item is tax-exempt)
        const tax = isTaxExempt ? 0 : Math.floor(high * 0.02);
        const margin = high - tax - low;
        const roi = low > 0 ? parseFloat(((margin * 100.0 / low).toFixed(2))) : 0;

        const [trend_5m, trend_1h, trend_6h, trend_24h] = await Promise.all([
            getTrendPct("price_5m", itemId),
            getTrendPct("price_1h", itemId),
            getTrendPct("price_6h", itemId),
            getTrendPct("price_24h", itemId)
        ]);
        const trend_7d = await getTrendRange("price_24h", itemId, 7 * 86400);
        const trend_1m = await getTrendRange("price_24h", itemId, 30 * 86400);

        return res.json({
            high,
            low,
            margin,
            roi,
            ts,
            lowTs,
            trend_5m,
            trend_1h,
            trend_6h,
            trend_24h,
            trend_7d,
            trend_1m
        });
    } catch (err) {
        console.error(`[GET /prices/latest/${itemId}] DB ERROR:`, err.stack || err);
        return res.status(500).json({ error: 'Database error' });
    }
});

// ─── GET /prices/latest?ids=1,2,3 ───────────────────────────────────────────────
// Returns { [itemId]: { high, low, margin, roi, ts, lowTs } }
router.get('/latest', async (req, res) => {
    const idsParam = req.query.ids;
    if (!idsParam) return res.status(400).json({ error: 'Missing ids parameter' });

    const ids = idsParam.split(',').map(x => parseInt(x, 10)).filter(x => !isNaN(x));
    if (ids.length === 0) return res.status(400).json({ error: 'Invalid ids parameter' });

    const placeholders = ids.map((_, i) => '$' + (i + 1)).join(',');
    const sql = `
        SELECT item_id, type, price, timestamp
        FROM price_instants
        WHERE item_id IN (${placeholders})
    `;
    try {
        // Get item names to check tax-exempt status
        const itemNamesQuery = await db.query(`
            SELECT id, name FROM items WHERE id IN (${placeholders})
        `, ids);
        const taxExemptMap = new Map();
        itemNamesQuery.rows.forEach(row => {
            taxExemptMap.set(row.id, taxExemptItems.has(row.name));
        });
        
        const { rows } = await db.query(sql, ids);
        const out = {};

        for (const { item_id, type, price, timestamp } of rows) {
            out[item_id] = out[item_id] || {};
            out[item_id][type] = { price, timestamp };
        }

        Object.entries(out).forEach(([key, val]) => {
            const itemId = parseInt(key, 10);
            const high = val.high?.price ?? null;
            const ts = val.high?.timestamp ?? null;
            const low = val.low?.price ?? null;
            const lowTs = val.low?.timestamp ?? null;
            // Tax is 2% of high price, rounded down to nearest whole number (unless item is tax-exempt)
            const isTaxExempt = taxExemptMap.get(itemId) || false;
            const tax = (high != null && !isTaxExempt) ? Math.floor(high * 0.02) : 0;
            const margin = (high != null && low != null)
                ? high - tax - low
                : null;
            const roi = (margin != null && low > 0)
                ? parseFloat(((margin * 100.0 / low).toFixed(2)))
                : null;
            out[key] = { high, low, margin, roi, ts, lowTs };
        });

        return res.json(out);
    } catch (err) {
        console.error('[GET /prices/latest?ids] DB ERROR:', err.stack || err);
        return res.status(500).json({ error: 'Database error' });
    }
});

// ─── GET /prices/chart/:granularity/:id?since=TIMESTAMP ────────────────────────
// Returns [ { ts, high, low } ] (and volume for granularities other than 4h)
// For 5m, 1h, 6h, 24h: uses price_{granularity} table with avg_high and avg_low
// For 4h: uses price_instant_log with aggregated high/low prices
router.get('/chart/:granularity/:id', async (req, res) => {
    const { granularity, id } = req.params;
    const valid = ['4h', '5m', '1h', '6h', '24h'];
    if (!valid.includes(granularity)) {
        return res.status(400).json({ error: 'Invalid granularity: ' + granularity });
    }
    const itemId = parseInt(id, 10);
    const since = parseInt(req.query.since || 0, 10);

    try {
        let rows;
        if (granularity === '4h') {
            const sql = `
                SELECT
                    timestamp AS ts,
                    MAX(CASE WHEN type='high' THEN price END) AS high,
                    MAX(CASE WHEN type='low'  THEN price END) AS low
                FROM price_instant_log
                WHERE item_id = $1
                  AND timestamp > $2
                GROUP BY timestamp
                ORDER BY timestamp ASC
            `;
            ({ rows } = await db.query(sql, [itemId, since]));
        } else {
            // For 5m, 1h, 6h, 24h: use price_{granularity} table
            // Returns avg_high as 'high' and avg_low as 'low' for chart display
            const table = `price_${granularity}`;
            const sql = `
                SELECT
                    timestamp AS ts,
                    avg_high AS high,
                    avg_low  AS low,
                    volume
                FROM ${table}
                WHERE item_id = $1
                  AND timestamp > $2
                ORDER BY timestamp ASC
            `;
            ({ rows } = await db.query(sql, [itemId, since]));
        }

        return res.json(rows);
    } catch (err) {
        console.error(`[GET /prices/chart/${granularity}/${itemId}] DB ERROR:`, err.stack || err);
        return res.status(500).json({ error: 'Database error' });
    }
});

// ─── GET /prices/recent/:id ────────────────────────────────────────────────────
// Returns last 20 trades from price_instant_log: [ { ts, type, price } ]
router.get('/recent/:id', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });

    const sql = `
        SELECT timestamp AS ts, type, price
        FROM price_instant_log
        WHERE item_id = $1
        ORDER BY timestamp DESC
        LIMIT 20
    `;
    try {
        const { rows } = await db.query(sql, [itemId]);

        // Convert "low" → "buy", "high" → "sell"
        const normalized = rows.map(({ ts, type, price }) => ({
            ts,
            price,
            type: type === 'low' ? 'buy' : 'sell'
        }));

        return res.json(normalized);
    } catch (err) {
        console.error(`[GET /prices/recent/${itemId}] DB ERROR:`, err.stack || err);
        return res.status(500).json({ error: 'Database error' });
    }
});

// ─── GET /prices/sparkline/:itemId?days=7 ────────────────────────────────────────
// Returns array of { timestamp, price } for sparkline rendering
// Uses price_1h table, limited to 168 points (7 days * 24 hours)
router.get('/sparkline/:itemId', async (req, res) => {
    const itemId = parseInt(req.params.itemId, 10);
    const days = parseInt(req.query.days || '7', 10);
    const limit = days * 24; // 168 points for 7 days
    
    try {
        const now = Math.floor(Date.now() / 1000);
        const since = now - (days * 86400); // days in seconds
        
        const sql = `
            SELECT 
                timestamp,
                COALESCE(avg_high, avg_low) AS price
            FROM price_1h
            WHERE item_id = $1 
              AND timestamp >= $2
            ORDER BY timestamp ASC
            LIMIT $3
        `;
        
        const { rows } = await db.query(sql, [itemId, since, limit]);
        
        // Return array of { timestamp, price }
        // Only include rows with valid prices (null/NaN filtered out)
        const data = rows
            .map(row => {
                const price = row.price != null ? parseFloat(row.price) : null;
                return {
                    timestamp: row.timestamp,
                    price: (price != null && !isNaN(price)) ? price : null
                };
            })
            .filter(row => row.price != null); // Filter out null prices
        
        return res.json(data);
    } catch (err) {
        console.error(`[GET /prices/sparkline/${itemId}] DB ERROR:`, err.stack || err);
        return res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
