require("dotenv").config();
const fs = require("fs");
const path = require("path");

const LOCKS_DIR = path.join(__dirname, "..", ".locks");
const lockPath = path.join(LOCKS_DIR, "backfill-canonical.lock");

console.log("Checking canonical lock...");
console.log("Lock file path:", lockPath);
console.log("Lock file exists:", fs.existsSync(lockPath));

if (fs.existsSync(lockPath)) {
    try {
        const lockData = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        console.log("\nLock file contents:");
        console.log(JSON.stringify(lockData, null, 2));
        
        // Check if the process is still running
        try {
            process.kill(lockData.pid, 0); // Signal 0 just checks if process exists
            console.log("\n⚠️  Process", lockData.pid, "is still running!");
        } catch (err) {
            console.log("\n✅ Process", lockData.pid, "is NOT running (stale lock)");
            console.log("   This lock should be removed!");
        }
    } catch (err) {
        console.error("Error reading lock file:", err.message);
    }
} else {
    console.log("\n✅ No lock file found - canonical update should be able to run");
}




