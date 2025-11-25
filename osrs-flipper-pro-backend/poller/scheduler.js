const { exec } = require("child_process");

let lastPollTimestamp = null;
let lastBackfillMinute = null;
let lastBackfill_1h = null;
let lastBackfill_6h = null;
let lastBackfill_24h = null;
let lastLatestPollSecond = null;
let lastLatestCleanupMinute = null;

function run(cmd, label) {
    const time = new Date().toISOString();
    console.log(`\n[${time}] 🟡 Starting ${label}: ${cmd}`);

    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            console.error(`❌ ${label} failed: ${err.message}`);
            return;
        }
        if (stderr) {
            console.warn(`⚠️ ${label} stderr: ${stderr}`);
        }
        console.log(`✅ ${label} completed:\n${stdout}`);
    });
}

function tick() {
    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();
    const totalMinutes = hours * 60 + minutes;
    const pollKey = `${hours}:${minutes}:${seconds}`;
    const today = now.getUTCDate();

    // --- Poll /latest every 15 seconds ---
    if (seconds % 15 === 0 && lastLatestPollSecond !== seconds) {
        lastLatestPollSecond = seconds;
        run("node poller/poll-latest.js", "POLL LATEST");
        // Update canonical items after latest poll (with small delay to ensure data is committed)
        setTimeout(() => {
            run("node poller/update-canonical-items.js", "UPDATE CANONICAL");
        }, 2000);
    }

    // --- Cleanup all (granularities + latest) every 10 minutes at :01 ---
    if (minutes % 10 === 1 && seconds === 0 && lastLatestCleanupMinute !== minutes) {
        lastLatestCleanupMinute = minutes;
        run("node poller/cleanup-timeseries.js", "FULL CLEANUP");
    }

    // --- Poll 5m at every 5min :30 ---
    if (minutes % 5 === 0 && seconds === 30 && pollKey !== lastPollTimestamp) {
        lastPollTimestamp = pollKey;
        console.log(`🔁 Triggering 5m poll`);
        run("node poller/poll-granularities.js 5m", "POLL 5m");

        setTimeout(() => {
            run("node poller/cleanup-timeseries.js", "CLEANUP 5m");
        }, 2000);
    }

    // --- Backfill 5m at mm:(mod 5 === 2), e.g., 02, 07, 12...
    if (minutes % 5 === 2 && seconds === 0 && lastBackfillMinute !== totalMinutes) {
        lastBackfillMinute = totalMinutes;
        console.log("🛠️ Backfilling 5m");
        run("node poller/backfill-timeseries.js 5m", "BACKFILL 5m");
    }

    // --- Poll 1h at hh:00:30 ---
    if (minutes === 0 && seconds === 30) {
        console.log("⏳ Polling 1h");
        run("node poller/poll-granularities.js 1h", "POLL 1h");
    }

    // --- Backfill 1h at hh:02:00 if hh % 2 === 0 ---
    if (minutes === 2 && seconds === 0 && hours % 2 === 0 && lastBackfill_1h !== hours) {
        lastBackfill_1h = hours;
        console.log("🛠️ Backfilling 1h");
        run("node poller/backfill-timeseries.js 1h", "BACKFILL 1h");
    }

    // --- Poll 6h at hh:00:30 (if hh % 6 === 0) ---
    if (hours % 6 === 0 && minutes === 0 && seconds === 30) {
        console.log("⏳ Polling 6h");
        run("node poller/poll-granularities.js 6h", "POLL 6h");
    }

    // --- Backfill 6h at hh:02:00 (same hh % 6 === 0) ---
    if (hours % 6 === 0 && minutes === 2 && seconds === 0 && lastBackfill_6h !== hours) {
        lastBackfill_6h = hours;
        console.log("🛠️ Backfilling 6h");
        run("node poller/backfill-timeseries.js 6h", "BACKFILL 6h");
    }

    // --- Poll 24h at 02:00:30 ---
    if (hours === 2 && minutes === 0 && seconds === 30) {
        console.log("⏳ Polling 24h");
        run("node poller/poll-granularities.js 24h", "POLL 24h");
    }

    // --- Backfill 24h at 02:02:00 ---
    if (hours === 2 && minutes === 2 && seconds === 0 && lastBackfill_24h !== today) {
        lastBackfill_24h = today;
        console.log("🛠️ Backfilling 24h");
        run("node poller/backfill-timeseries.js 24h", "BACKFILL 24h");
    }
}

// --- Start Scheduler ---
console.log("🟢 Scheduler started");

// --- Initial backfill on startup ---
console.log("🚀 Running initial backfill for all granularities");
run("node poller/backfill-timeseries.js 5m", "INIT BACKFILL 5m");
run("node poller/backfill-timeseries.js 1h", "INIT BACKFILL 1h");
run("node poller/backfill-timeseries.js 6h", "INIT BACKFILL 6h");
run("node poller/backfill-timeseries.js 24h", "INIT BACKFILL 24h");

setInterval(tick, 1000);
