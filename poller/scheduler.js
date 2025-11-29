const { exec } = require("child_process");
const { Pool } = require("pg");
require("dotenv").config();
const { logProcess } = require("./process-logger");
const { isBackfillRunning } = require("./lock-utils");

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

let lastPollTimestamp = null;
let lastBackfillMinute = null;
let lastBackfill_1h = null;
let lastBackfill_6h = null;
let lastBackfill_24h = null;
let lastLatestPollSecond = null;
let lastLatestCleanupMinute = null;
let lastCanonicalUpdateTime = null;
let canonicalUpdateRunning = false; // Lock to prevent multiple simultaneous canonical updates
let pollLatestRunning = false; // Lock to prevent multiple simultaneous poll-latest processes

function run(cmd, label, onComplete) {
    const startTime = Date.now();
    const time = new Date().toISOString();
    console.log(`\n[${time}] 🟡 Starting ${label}: ${cmd}`);
    
    // Log process start
    logProcess(label, "started", { command: cmd });

    const childProcess = exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        const duration = (Date.now() - startTime) / 1000; // Duration in seconds
        
        if (err) {
            console.error(`❌ ${label} failed: ${err.message}`);
            logProcess(label, "failed", { 
                duration: duration,
                error: err.message,
                command: cmd
            });
        } else {
            if (stderr) {
                console.warn(`⚠️ ${label} stderr: ${stderr}`);
            }
            console.log(`✅ ${label} completed in ${duration.toFixed(2)}s:\n${stdout}`);
            logProcess(label, "completed", { 
                duration: duration,
                command: cmd
            });
        }
        // Call completion callback if provided
        if (onComplete) {
            onComplete();
        }
    });
}

/**
 * Get canonical update frequency in seconds based on dirty items count
 * @param {number} dirtyCount - Number of items in dirty_items queue
 * @returns {number} Frequency in seconds
 */
function getCanonicalFrequency(dirtyCount) {
    if (dirtyCount === 0) {
        return 60; // Every 60s
    } else if (dirtyCount <= 200) {
        return 30; // Every 30s
    } else if (dirtyCount <= 1000) {
        return 15; // Every 15s
    } else {
        return 30; // Every 30s even with > 1000 items (prevents system overload)
    }
}

/**
 * Check if canonical update should run based on dynamic frequency
 */
async function checkCanonicalUpdate() {
    // Prevent multiple simultaneous canonical updates
    // Check both in-memory lock and file-based lock to prevent race conditions
    if (canonicalUpdateRunning || isBackfillRunning("canonical")) {
        logProcess("UPDATE CANONICAL", "blocked", { 
            reason: "Process already running (lock active)"
        });
        return;
    }
    
    try {
        const { rows } = await db.query(`
            SELECT COUNT(*)::INT AS count FROM dirty_items
        `);
        const dirtyCount = rows[0].count;
        const frequency = getCanonicalFrequency(dirtyCount);
        
        const now = Date.now();
        const timeSinceLastUpdate = lastCanonicalUpdateTime ? (now - lastCanonicalUpdateTime) / 1000 : Infinity;
        
        // Immediate if > 1000 dirty items
        if (frequency === 0 || timeSinceLastUpdate >= frequency) {
            lastCanonicalUpdateTime = now;
            canonicalUpdateRunning = true; // Set lock
            
            run("node poller/update-canonical-items.js", "UPDATE CANONICAL", () => {
                canonicalUpdateRunning = false; // Release lock when done
            });
            
            if (frequency === 0) {
                console.log(`[SCHEDULER] Canonical: Immediate (${dirtyCount} dirty items)`);
            } else {
                console.log(`[SCHEDULER] Canonical: ${frequency}s frequency (${dirtyCount} dirty items)`);
            }
        }
    } catch (err) {
        console.error("[SCHEDULER] Error checking canonical update:", err.message);
        canonicalUpdateRunning = false; // Release lock on error
    }
}

function tick() {
    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();
    const totalMinutes = hours * 60 + minutes;
    const pollKey = `${hours}:${minutes}:${seconds}`;
    const today = now.getUTCDate();

    // --- PRODUCTION MODE: Poll /latest every 15 seconds ---
    if (seconds % 15 === 0 && lastLatestPollSecond !== seconds) {
        if (pollLatestRunning) {
            logProcess("POLL LATEST", "blocked", { 
                reason: "Previous execution still running (lock active)"
            });
        } else {
            lastLatestPollSecond = seconds;
            pollLatestRunning = true; // Set lock
            run("node poller/poll-latest.js", "POLL LATEST", () => {
                pollLatestRunning = false; // Release lock when done
                // Trigger canonical update immediately after latest completes
                // This ensures dirty items from latest update are processed right away
                checkCanonicalUpdate();
            });
        }
    }
    
    // --- PRODUCTION MODE: Dynamic canonical update based on dirty queue size ---
    // Also check periodically (not just after latest) to catch items from other sources
    checkCanonicalUpdate();

    // --- PRODUCTION MODE: Cleanup all (granularities + latest) every 10 minutes at :01 ---
    if (minutes % 10 === 1 && seconds === 0 && lastLatestCleanupMinute !== minutes) {
        lastLatestCleanupMinute = minutes;
        run("node poller/cleanup-timeseries.js", "FULL CLEANUP");
    }

    // --- PRODUCTION MODE: Poll 5m at every 5min :30 ---
    if (minutes % 5 === 0 && seconds === 30 && pollKey !== lastPollTimestamp) {
        lastPollTimestamp = pollKey;
        console.log(`🔁 Triggering 5m poll`);
        run("node poller/poll-granularities.js 5m", "POLL 5m");
        setTimeout(() => {
            run("node poller/cleanup-timeseries.js", "CLEANUP 5m");
        }, 2000);
    }

    // --- PRODUCTION MODE: Poll 1h at every hour :00:30 ---
    if (minutes === 0 && seconds === 30 && hours !== lastBackfill_1h) {
        lastBackfill_1h = hours;
        console.log(`🔁 Triggering 1h poll`);
        run("node poller/poll-granularities.js 1h", "POLL 1h");
        setTimeout(() => {
            run("node poller/cleanup-timeseries.js", "CLEANUP 1h");
        }, 2000);
    }

    // --- PRODUCTION MODE: Poll 6h at every 6 hours :00:30 (00:00, 06:00, 12:00, 18:00) ---
    if (hours % 6 === 0 && minutes === 0 && seconds === 30 && hours !== lastBackfill_6h) {
        lastBackfill_6h = hours;
        console.log(`🔁 Triggering 6h poll`);
        run("node poller/poll-granularities.js 6h", "POLL 6h");
        setTimeout(() => {
            run("node poller/cleanup-timeseries.js", "CLEANUP 6h");
        }, 2000);
    }

    // --- PRODUCTION MODE: Poll 24h daily at 02:00:30 ---
    if (hours === 2 && minutes === 0 && seconds === 30 && today !== lastBackfill_24h) {
        lastBackfill_24h = today;
        console.log(`🔁 Triggering 24h poll`);
        run("node poller/poll-granularities.js 24h", "POLL 24h");
        setTimeout(() => {
            run("node poller/cleanup-timeseries.js", "CLEANUP 24h");
        }, 2000);
    }

    // --- PRODUCTION MODE: Backfill DISABLED (manual only) ---
    // All backfill tasks must be run manually
}

// --- Start Scheduler ---
console.log("🟢 Scheduler started in PRODUCTION MODE");
console.log("✅ ENABLED:");
console.log("   - poll-latest (every 15 seconds)");
console.log("   - poll-granularities (5m/1h/6h/24h)");
console.log("   - update-canonical-items (dynamic frequency)");
console.log("   - cleanup-timeseries (every 10 minutes)");
console.log("❌ DISABLED:");
console.log("   - backfill-timeseries (manual only)");

setInterval(tick, 1000);

// Setup cleanup handlers to always close connections
const cleanup = async () => {
    try {
        await db.end();
    } catch (err) {
        // Ignore errors during cleanup
    }
};

process.on("SIGINT", async () => {
    console.log("\n[SCHEDULER] Shutting down gracefully...");
    await cleanup();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("\n[SCHEDULER] Shutting down gracefully...");
    await cleanup();
    process.exit(0);
});

process.on("uncaughtException", async (err) => {
    console.error("[SCHEDULER] Uncaught exception:", err.message);
    await cleanup();
    process.exit(1);
});

process.on("unhandledRejection", async (err) => {
    console.error("[SCHEDULER] Unhandled rejection:", err);
    await cleanup();
    process.exit(1);
});
