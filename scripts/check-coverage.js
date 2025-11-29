const db = require("../db/db");

const CONFIG = {
    "5m": {
        table: "price_5m",
        expectedCount: 288,
        maxAgeSeconds: 60 * 60 * 24 + 60 * 5 // 24h + 5min
    },
    "1h": {
        table: "price_1h",
        expectedCount: 168,
        maxAgeSeconds: 60 * 60 * 169 // 168h
    },
    "6h": {
        table: "price_6h",
        expectedCount: 120,
        maxAgeSeconds: 60 * 60 * 24 * 30 + 60 * 60 * 6 // 30d + 6h
    },
    "24h": {
        table: "price_24h",
        expectedCount: 365,
        maxAgeSeconds: null // no age check
    }
};

function formatAge(secondsAgo) {
    const h = Math.floor(secondsAgo / 3600);
    const m = Math.floor((secondsAgo % 3600) / 60);
    return `${h}h ${m}m ago`;
}

async function getItemIds() {
    const { rows } = await db.query("SELECT id FROM items");
    return rows.map(r => r.id);
}

async function getCountFor(itemId, tableName) {
    const { rows } = await db.query(`SELECT COUNT(*) AS total FROM ${tableName} WHERE item_id = $1`, [itemId]);
    return parseInt(rows[0].total, 10);
}

async function getOldestTimestamp(tableName) {
    const { rows } = await db.query(`SELECT MIN(timestamp) AS min FROM ${tableName}`);
    return rows[0].min;
}

(async () => {
    const itemIds = await getItemIds();
    const totalItems = itemIds.length;

    let summary = {};
    for (const granularity of Object.keys(CONFIG)) {
        summary[granularity] = {
            ok: 0,
            partial: 0,
            missing: 0,
            oldestTooOld: false,
            oldestTimestamp: null,
            oldestAgeString: null
        };
    }

    console.log(`🔍 Checking coverage for ${totalItems} items across all granularities...\n`);

    for (const itemId of itemIds) {
        for (const [granularity, cfg] of Object.entries(CONFIG)) {
            const count = await getCountFor(itemId, cfg.table);

            if (count === cfg.expectedCount) {
                summary[granularity].ok++;
            } else if (count === 0) {
                summary[granularity].missing++;
                console.log(`❌ ${granularity} | Item ${itemId} is missing entirely`);
            } else {
                summary[granularity].partial++;
                console.log(`⚠️  ${granularity} | Item ${itemId} has ${count} rows (expected ${cfg.expectedCount})`);
            }
        }
    }

    // Age check
    for (const [granularity, cfg] of Object.entries(CONFIG)) {
        const oldest = await getOldestTimestamp(cfg.table);
        summary[granularity].oldestTimestamp = oldest;

        if (!oldest) continue;

        const now = Math.floor(Date.now() / 1000);
        const age = now - oldest;
        summary[granularity].oldestAgeString = formatAge(age);

        if (cfg.maxAgeSeconds && age > cfg.maxAgeSeconds) {
            summary[granularity].oldestTooOld = true;
        }
    }

    // Summary output
    console.log(`\n📊 Coverage Summary (out of ${totalItems} items):`);
    for (const [granularity, stats] of Object.entries(summary)) {
        const cfg = CONFIG[granularity];
        console.log(`\n🔹 ${granularity.toUpperCase()} (${cfg.expectedCount} rows/item)`);

        console.log(`✅ OK:       ${stats.ok}`);
        console.log(`⚠️  PARTIAL:  ${stats.partial}`);
        console.log(`❌ MISSING:  ${stats.missing}`);

        if (stats.oldestTimestamp) {
            const date = new Date(stats.oldestTimestamp * 1000).toISOString();
            console.log(`🕒 Oldest timestamp: ${date} (${stats.oldestAgeString})`);
            if (cfg.maxAgeSeconds) {
                if (stats.oldestTooOld) {
                    console.log(`⛔ TOO OLD — Data older than allowed retention (${cfg.maxAgeSeconds}s)`);
                } else {
                    console.log(`✅ Age OK — within retention window`);
                }
            } else {
                console.log(`ℹ️  No age check for this granularity`);
            }
        } else {
            console.log(`❓ No data found in table`);
        }
    }
    // === Latest Data Stats ===
    const latestCounts = await db.query(`
  SELECT
    (SELECT COUNT(*) FROM price_instants) AS instants,
    (SELECT COUNT(*) FROM price_instant_log) AS instant_log
`);

    const latestStats = latestCounts.rows[0];

    console.log(`\n📈 Latest price snapshot stats:`);
    console.log(`📦 price_instants:     ${latestStats.instants} rows`);
    console.log(`📜 price_instant_log:  ${latestStats.instant_log} rows`);


    await db.end();
})();
