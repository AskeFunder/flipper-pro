require("dotenv").config();
const { Pool } = require("pg");
const axios = require("axios");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const HEADERS = {
    "User-Agent": "flipperpro-dev - @montemarto"
};

const CONFIG = {
    "5m": {
        intervalSeconds: 300,
        retentionHours: 24 + (5 / 60), // 24.083 hours
        table: "price_5m",
        endpoint: "5m"
    }
};

async function getLatestTimestamp(table) {
    const { rows } = await db.query(`SELECT MAX(timestamp) as latest FROM ${table}`);
    return rows[0]?.latest || null;
}

function getExpectedTimestamps(intervalSeconds, retentionHours, latestTimestamp) {
    const end = latestTimestamp;
    
    const extraStepHours = intervalSeconds / 3600;
    const baseHours = retentionHours - extraStepHours;
    const baseRetentionSeconds = baseHours * 3600;
    const numIntervals = Math.floor(baseRetentionSeconds / intervalSeconds);
    const startCandidate = end - (numIntervals * intervalSeconds);
    const remainder = startCandidate % intervalSeconds;
    const alignedStart = remainder === 0 ? startCandidate : startCandidate + (intervalSeconds - remainder);
    
    const timestamps = [];
    for (let t = alignedStart; t <= end; t += intervalSeconds) {
        timestamps.push(t);
    }
    return timestamps;
}

(async () => {
    try {
        const cfg = CONFIG["5m"];
        const latestTimestamp = await getLatestTimestamp(cfg.table);
        
        if (!latestTimestamp) {
            console.log("❌ No data found in database");
            await db.end();
            return;
        }
        
        console.log(`📊 Latest timestamp in database: ${latestTimestamp} (${new Date(latestTimestamp * 1000).toISOString()})`);
        
        const expectedTimestamps = getExpectedTimestamps(cfg.intervalSeconds, cfg.retentionHours, latestTimestamp);
        const { rows: actualRows } = await db.query(`SELECT DISTINCT timestamp FROM ${cfg.table} ORDER BY timestamp`);
        const actual = new Set(actualRows.map(r => r.timestamp));
        const missing = expectedTimestamps.filter(ts => !actual.has(ts));
        
        console.log(`\n📋 Missing timestamps (${missing.length}):`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        for (const ts of missing) {
            const date = new Date(ts * 1000).toISOString();
            console.log(`\n🔍 Checking timestamp: ${ts} (${date})`);
            
            // Check API
            try {
                const url = `https://prices.runescape.wiki/api/v1/osrs/${cfg.endpoint}?timestamp=${ts}`;
                const { data } = await axios.get(url, { headers: HEADERS });
                
                if (data && data.data) {
                    const itemCount = Object.keys(data.data).length;
                    console.log(`   ✅ API has data: ${itemCount} items`);
                    
                    // Check if any items have actual price data
                    let itemsWithData = 0;
                    for (const itemId in data.data) {
                        const item = data.data[itemId];
                        if (item.avgHighPrice || item.avgLowPrice) {
                            itemsWithData++;
                        }
                    }
                    console.log(`   📊 Items with price data: ${itemsWithData}`);
                    
                    if (itemsWithData > 0) {
                        console.log(`   ⚠️  API HAS DATA but it's not in database!`);
                    } else {
                        console.log(`   ℹ️  API returned empty data`);
                    }
                } else {
                    console.log(`   ❌ API returned no data`);
                }
            } catch (err) {
                console.log(`   ❌ API error: ${err.message}`);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await db.end();
    }
})();



