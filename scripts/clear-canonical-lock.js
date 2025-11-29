const fs = require("fs");
const path = require("path");

const LOCKS_DIR = path.join(__dirname, "..", ".locks");
const lockPath = path.join(LOCKS_DIR, "backfill-canonical.lock");

if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
    console.log("✅ Removed stale canonical lock file");
} else {
    console.log("ℹ️  No lock file found - canonical updater should be able to run");
}
