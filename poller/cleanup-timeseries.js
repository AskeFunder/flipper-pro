require("dotenv").config();
const db = require("../db/db");

const CONFIG = {
    "5m": {
        table: "price_5m",
        intervalSeconds: 300,
        // Used for 12h and 24h graphs. Longest is 24h, so need 24h + 5m (one extra granularity step)
        retentionHours: 24 + (5 / 60), // 24.083 hours
        bufferSeconds: 300
    },
    "1h": {
        table: "price_1h",
        intervalSeconds: 3600,
        // Used for 1w graph. Need 1w + 1h (one extra granularity step)
        retentionHours: (24 * 7) + 1, // 169 hours
        bufferSeconds: 3600
    },
    "6h": {
        table: "price_6h",
        intervalSeconds: 21600,
        // Used for 1mo graph. Need 1mo + 6h (one extra granularity step)
        retentionHours: (24 * 30) + 6, // 726 hours
        bufferSeconds: 21600
    },
    "24h": {
        table: "price_24h",
        intervalSeconds: 86400,
        // Used for 3mo and 1y graphs. Longest is 1y, so need 1y + 24h (one extra granularity step)
        retentionHours: (24 * 365) + 24, // 8784 hours
        bufferSeconds: 86400
    }
};

async function cleanupGranularity(granularity) {
    const cfg = CONFIG[granularity];
    // Get the latest timestamp from the database to use as the reference point
    // This ensures we keep data relative to the actual latest data, not "now"
    const { rows: latestRows } = await db.query(`SELECT MAX(timestamp) as latest FROM ${cfg.table}`);
    const latestTimestamp = latestRows[0]?.latest;
    
    // If no data exists, nothing to clean
    if (!latestTimestamp) {
        console.log(`🧹 [${granularity}] No data to clean`);
        return;
    }
    
    // Calculate cutoff based on the latest timestamp in the database, not "now"
    // This ensures we keep data that's within retention relative to the actual latest data point
    const retentionSeconds = cfg.retentionHours * 3600 + cfg.bufferSeconds;
    const rawCutoff = latestTimestamp - retentionSeconds;
    
    // Align cutoff down to the nearest interval boundary to ensure we don't delete
    // timestamps that are still within the retention window
    const alignedCutoff = Math.floor(rawCutoff / cfg.intervalSeconds) * cfg.intervalSeconds;
    
    // Subtract one more interval to ensure we don't delete the last point that's still
    // within the retention window (this accounts for the fact that timestamps are at END of intervals)
    const safeCutoff = alignedCutoff - cfg.intervalSeconds;

    const { rowCount } = await db.query(
        `DELETE FROM ${cfg.table} WHERE timestamp < $1`,
        [safeCutoff]
    );

    console.log(`🧹 [${granularity}] Deleted ${rowCount} rows older than ${cfg.retentionHours}h + buffer from latest (${latestTimestamp}) (cutoff: ${safeCutoff}, aligned: ${alignedCutoff}, raw: ${rawCutoff})`);
}

async function cleanupLatest() {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 14460; // 4 hours + 1 minute

    // Cleanup price_instant_log
    const { rows: keepRows } = await db.query(`
    SELECT item_id, type, timestamp
    FROM price_instant_log
    ORDER BY seen_at DESC
    LIMIT 20
  `);
    const keepKeys = new Set(keepRows.map(r => `${r.item_id}-${r.type}-${r.timestamp}`));

    const { rows: oldRows } = await db.query(`
    SELECT item_id, type, timestamp
    FROM price_instant_log
    WHERE seen_at < $1
  `, [cutoff]);

    let deletedLog = 0;
    try {
        await db.query("BEGIN");

        for (const row of oldRows) {
            const key = `${row.item_id}-${row.type}-${row.timestamp}`;
            if (!keepKeys.has(key)) {
                await db.query(`
          DELETE FROM price_instant_log
          WHERE item_id = $1 AND type = $2 AND timestamp = $3
        `, [row.item_id, row.type, row.timestamp]);
                deletedLog++;
            }
        }

        await db.query("COMMIT");
        console.log(`🧹 [instant_log] Deleted ${deletedLog} old rows from price_instant_log (cutoff: ${cutoff})`);
    } catch (err) {
        await db.query("ROLLBACK");
        console.error("❌ Cleanup failed for price_instant_log:", err.message);
    }

    // Cleanup price_instants (keep only recent ones, except the 20 newest)
    const cutoffInstants = now - 14460;

    const { rows: keepInstants } = await db.query(`
    SELECT item_id, type
    FROM price_instants
    ORDER BY last_updated DESC
    LIMIT 20
  `);
    const keepInstantKeys = new Set(keepInstants.map(r => `${r.item_id}-${r.type}`));

    const { rows: staleInstants } = await db.query(`
    SELECT item_id, type
    FROM price_instants
    WHERE last_updated < $1
  `, [cutoffInstants]);

    let deletedInstants = 0;
    for (const row of staleInstants) {
        const key = `${row.item_id}-${row.type}`;
        if (!keepInstantKeys.has(key)) {
            await db.query(`
        DELETE FROM price_instants
        WHERE item_id = $1 AND type = $2
      `, [row.item_id, row.type]);
            deletedInstants++;
        }
    }

    console.log(`🧹 [instants] Deleted ${deletedInstants} stale price_instants (cutoff: ${cutoffInstants})`);
}

async function runCleanup() {
    for (const granularity of Object.keys(CONFIG)) {
        await cleanupGranularity(granularity);
    }

    await cleanupLatest();
    await db.end();
}

// Setup cleanup handlers to always close connections
const cleanup = async () => {
    try {
        // Add a timeout for db.end() to prevent hanging
        await Promise.race([
            db.end(),
            new Promise((resolve) => setTimeout(() => {
                console.warn("[CLEANUP] db.end() timed out, forcing exit.");
                resolve();
            }, 5000)) // 5 seconds timeout
        ]);
    } catch (err) {
        // Ignore errors during cleanup
    }
};

process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
});

process.on("uncaughtException", async (err) => {
    console.error("❌ Uncaught exception:", err.message);
    await cleanup();
    process.exit(1);
});

process.on("unhandledRejection", async (err) => {
    console.error("❌ Unhandled rejection:", err);
    await cleanup();
    process.exit(1);
});

runCleanup()
    .then(async () => {
        await cleanup();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error("❌ Cleanup script error:", err.message);
        await cleanup();
        process.exit(1);
    });
