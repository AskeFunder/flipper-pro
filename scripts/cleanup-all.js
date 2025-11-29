const Database = require("better-sqlite3");
const db = new Database("flipperpro.db");

const CONFIG = {
    "5m": {
        table: "price_5m",
        retentionHours: 24,
        bufferSeconds: 300        // 5 minutes
    },
    "1h": {
        table: "price_1h",
        retentionHours: 24 * 7,
        bufferSeconds: 3600       // 1 hour
    },
    "6h": {
        table: "price_6h",
        retentionHours: 24 * 30,
        bufferSeconds: 21600      // 6 hours
    },
    "24h": {
        table: "price_24h",
        retentionHours: 24 * 365,
        bufferSeconds: 86400      // 1 day
    }
};

function cleanupGranularity(granularity) {
    const cfg = CONFIG[granularity];
    const cutoff = Math.floor(Date.now() / 1000) - (cfg.retentionHours * 3600 + cfg.bufferSeconds);

    const stmt = db.prepare(`DELETE FROM ${cfg.table} WHERE timestamp < ?`);
    const result = stmt.run(cutoff);

    console.log(`🧹 [${granularity}] Deleted ${result.changes} rows older than ${cfg.retentionHours}h + buffer (cutoff: ${cutoff})`);
}

function runCleanup() {
    console.log("🚿 Running cleanup for all granularities...\n");
    Object.keys(CONFIG).forEach(cleanupGranularity);
    db.close();
    console.log("\n✅ Cleanup complete.\n");
}

runCleanup();
