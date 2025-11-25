const db = require("../db/db");

const CONFIG = {
    "5m": {
        table: "price_5m",
        retentionHours: 24,
        bufferSeconds: 300
    },
    "1h": {
        table: "price_1h",
        retentionHours: 24 * 7,
        bufferSeconds: 3600
    },
    "6h": {
        table: "price_6h",
        retentionHours: 24 * 30,
        bufferSeconds: 21600
    },
    "24h": {
        table: "price_24h",
        retentionHours: 24 * 365,
        bufferSeconds: 86400
    }
};

async function cleanupGranularity(granularity) {
    const cfg = CONFIG[granularity];
    const cutoff = Math.floor(Date.now() / 1000) - (cfg.retentionHours * 3600 + cfg.bufferSeconds);

    const { rowCount } = await db.query(
        `DELETE FROM ${cfg.table} WHERE timestamp < $1`,
        [cutoff]
    );

    console.log(`🧹 [${granularity}] Deleted ${rowCount} rows older than ${cfg.retentionHours}h + buffer (cutoff: ${cutoff})`);
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

runCleanup().catch(err => {
    console.error("❌ Cleanup script error:", err.message);
});
