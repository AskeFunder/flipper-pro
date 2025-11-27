const fs = require("fs");
const path = require("path");

const LOCKS_DIR = path.join(__dirname, "..", ".locks");

// Ensure locks directory exists
if (!fs.existsSync(LOCKS_DIR)) {
    fs.mkdirSync(LOCKS_DIR, { recursive: true });
}

function getLockPath(granularity) {
    return path.join(LOCKS_DIR, `backfill-${granularity}.lock`);
}

function isBackfillRunning(granularity) {
    const lockPath = getLockPath(granularity);
    return fs.existsSync(lockPath);
}

function createLock(granularity) {
    const lockPath = getLockPath(granularity);
    const lockData = {
        granularity,
        pid: process.pid,
        started: new Date().toISOString()
    };
    fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2));
}

function removeLock(granularity) {
    const lockPath = getLockPath(granularity);
    if (fs.existsSync(lockPath)) {
        try {
            fs.unlinkSync(lockPath);
        } catch (err) {
            // Ignore errors when removing lock
        }
    }
}

// Clean up lock on process exit
function setupLockCleanup(granularity) {
    const cleanup = () => removeLock(granularity);
    process.on("exit", cleanup);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("uncaughtException", (err) => {
        cleanup();
        throw err;
    });
}

module.exports = {
    isBackfillRunning,
    createLock,
    removeLock,
    setupLockCleanup
};








