// scripts/debug-trends.js
require("dotenv").config();
const { Pool } = require("pg");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

function midpoint(row) {
    if (row.avg_high != null && row.avg_low != null) {
        return (row.avg_high + row.avg_low) / 2;
    } else if (row.avg_high != null) {
        return row.avg_high;
    } else if (row.avg_low != null) {
        return row.avg_low;
    }
    return null;
}

function trendPct(current, previous) {
    if (current == null || previous == null || previous === 0) return null;
    return Math.round(((current - previous) * 10000) / previous) / 100;
}

async function getTwoLatestRows(itemId, table) {
    const res = await db.query(
        `SELECT timestamp, avg_high, avg_low
         FROM ${table}
         WHERE item_id = $1
         ORDER BY timestamp DESC
         LIMIT 2`,
        [itemId]
    );
    return res.rows;
}

async function getNewestAndOldestInRange(itemId, table, seconds) {
    const now = Math.floor(Date.now() / 1000);
    const floor = now - seconds;
    const res = await db.query(
        `SELECT timestamp, avg_high, avg_low
         FROM ${table}
         WHERE item_id = $1 AND timestamp >= $2
         ORDER BY timestamp ASC`,
        [itemId, floor]
    );
    return res.rows.length >= 2
        ? [res.rows[res.rows.length - 1], res.rows[0]]
        : [res.rows[0] || null, null];
}

async function debug(itemId) {
    console.log(`\n🔍 Debugging trends for item_id = ${itemId}\n`);

    const granularities = [
        { label: "5m", table: "price_5m", type: "latest2" },
        { label: "1h", table: "price_5m", type: "range", seconds: 3600 },
        { label: "6h", table: "price_5m", type: "range", seconds: 6 * 3600 },
        { label: "24h", table: "price_5m", type: "range", seconds: 24 * 3600 },
        { label: "7d", table: "price_1h", type: "range", seconds: 7 * 86400 },
        { label: "1m", table: "price_6h", type: "range", seconds: 30 * 86400 },
    ];


    for (const g of granularities) {
        let curr = null, prev = null;

        if (g.type === "latest2") {
            [curr, prev] = await getTwoLatestRows(itemId, g.table);
        } else if (g.type === "range") {
            [curr, prev] = await getNewestAndOldestInRange(itemId, g.table, g.seconds);
        }

        const midCurr = curr ? midpoint(curr) : null;
        const midPrev = prev ? midpoint(prev) : null;
        const pct = trendPct(midCurr, midPrev);

        console.log(`📈 ${g.label.toUpperCase()} TREND`);
        console.log("  Current:", curr);
        console.log("  Previous:", prev);
        console.log("  Midpoints:", { midCurr, midPrev });
        console.log("  % Change:", pct, "\n");
    }

    const inst = await db.query(
        `SELECT type, price, timestamp
         FROM price_instants
         WHERE item_id = $1
         ORDER BY type`, [itemId]
    );
    console.log("💱 Current price_instants:", inst.rows);

    await db.end();
}

const [, , itemId] = process.argv;
if (!itemId) {
    console.error("Usage: node debug-trends.js <item_id>");
    process.exit(1);
}

debug(itemId).catch(err => {
    console.error("❌ Error in debug:", err);
    process.exit(1);
});
