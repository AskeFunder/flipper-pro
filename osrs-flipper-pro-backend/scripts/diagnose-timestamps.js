require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const CONFIG = {
    "5m": {
        intervalSeconds: 300,
        retentionHours: 24 + (5 / 60), // 24.083 hours
        table: "price_5m"
    },
    "1h": {
        intervalSeconds: 3600,
        retentionHours: (24 * 7) + 1, // 169 hours
        table: "price_1h"
    },
    "6h": {
        intervalSeconds: 21600,
        retentionHours: (24 * 30) + 6, // 726 hours
        table: "price_6h"
    },
    "24h": {
        intervalSeconds: 86400,
        retentionHours: (24 * 365) + 24, // 8784 hours
        table: "price_24h"
    }
};

async function getLatestTimestamp(table) {
    const { rows } = await db.query(`SELECT MAX(timestamp) as latest FROM ${table}`);
    return rows[0]?.latest || null;
}

function getExpectedTimestamps(intervalSeconds, retentionHours, latestTimestamp = null) {
    let end;
    
    if (latestTimestamp) {
        // Use the latest timestamp from database as the end point
        end = latestTimestamp;
    } else {
        // Fallback: calculate from current time
        const now = Math.floor(Date.now() / 1000);
        const alignedNow = now - (now % intervalSeconds);
        end = alignedNow - intervalSeconds;
    }
    // The retentionHours includes the extra granularity step, but we want exactly N intervals
    // For 5m: 24.083 hours = 24h + 5m → we want 289 points (24 hours = 288 intervals)
    // For 1h: 169 hours = 168h + 1h → we want 169 points (168 hours = 168 intervals)  
    // For 6h: 726 hours = 720h + 6h → we want 121 points (720 hours = 120 intervals)
    // For 24h: 8784 hours = 8760h + 24h → we want 366 points (8760 hours = 365 intervals)
    // So we subtract the extra step to get base hours
    const extraStepHours = intervalSeconds / 3600; // Convert interval to hours
    const baseHours = retentionHours - extraStepHours;
    const baseRetentionSeconds = baseHours * 3600;
    // Calculate how many intervals this gives us
    const numIntervals = Math.floor(baseRetentionSeconds / intervalSeconds);
    // Start from end, go back by exactly numIntervals
    const startCandidate = end - (numIntervals * intervalSeconds);
    // Align start UP (towards end) to the next interval boundary
    const remainder = startCandidate % intervalSeconds;
    const alignedStart = remainder === 0 ? startCandidate : startCandidate + (intervalSeconds - remainder);
    const timestamps = [];

    for (let t = alignedStart; t <= end; t += intervalSeconds) {
        timestamps.push(t);
    }

    return { timestamps, start: alignedStart, end };
}

(async () => {
    try {
        for (const [granularity, cfg] of Object.entries(CONFIG)) {
        console.log(`\n📊 [${granularity}] Analysis:`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        // Get the latest timestamp from database
        const latestTimestamp = await getLatestTimestamp(cfg.table);
        const { timestamps: expected, start: expectedStart, end: expectedEnd } = 
            getExpectedTimestamps(cfg.intervalSeconds, cfg.retentionHours, latestTimestamp);
            
            const { rows: actualRows } = await db.query(`
                SELECT DISTINCT timestamp 
                FROM ${cfg.table} 
                ORDER BY timestamp
            `);
            const actual = new Set(actualRows.map(r => r.timestamp));
            const expectedSet = new Set(expected);
            
            const missing = expected.filter(ts => !actual.has(ts));
            const extra = actualRows.map(r => r.timestamp).filter(ts => !expectedSet.has(ts));
            
            console.log(`Expected: ${expected.length} points`);
            console.log(`Actual:   ${actual.size} points`);
            console.log(`Missing:  ${missing.length} points`);
            console.log(`Extra:    ${extra.length} points`);
            console.log(`\nExpected range: ${new Date(expectedStart * 1000).toISOString()} → ${new Date(expectedEnd * 1000).toISOString()}`);
            
            if (missing.length > 0) {
                console.log(`\nMissing timestamps (first 10):`);
                missing.slice(0, 10).forEach(ts => {
                    console.log(`  ${ts} (${new Date(ts * 1000).toISOString()})`);
                });
            }
            
            if (extra.length > 0) {
                console.log(`\nExtra timestamps (first 10):`);
                extra.slice(0, 10).forEach(ts => {
                    console.log(`  ${ts} (${new Date(ts * 1000).toISOString()})`);
                });
            }
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await db.end();
    }
})();

