require("dotenv").config();
const db = require("../db/db");
const fs = require("fs");
const path = require("path");

(async () => {
    try {
        console.log("=".repeat(80));
        console.log("🔍 CHECKING CANONICAL UPDATE STATUS");
        console.log("=".repeat(80));
        
        // 1. Check dirty_items queue
        const dirtyCount = await db.query("SELECT COUNT(*) as count FROM dirty_items");
        const dirtyItemsCount = parseInt(dirtyCount.rows[0].count);
        console.log(`\n📊 Dirty items queue: ${dirtyItemsCount} items`);
        
        if (dirtyItemsCount > 0) {
            const oldestDirty = await db.query(`
                SELECT MIN(touched_at) as oldest
                FROM dirty_items
            `);
            if (oldestDirty.rows[0].oldest) {
                const age = Math.floor(Date.now() / 1000) - oldestDirty.rows[0].oldest;
                console.log(`   Oldest item age: ${age}s (${Math.floor(age/60)} minutes)`);
            }
        }
        
        // 2. Check canonical_items last update
        const lastUpdate = await db.query(`
            SELECT 
                MAX(timestamp_updated) as latest_update,
                COUNT(*) as total_items,
                COUNT(CASE WHEN timestamp_updated > EXTRACT(EPOCH FROM NOW()) - 300 THEN 1 END) as updated_last_5min,
                COUNT(CASE WHEN timestamp_updated > EXTRACT(EPOCH FROM NOW()) - 3600 THEN 1 END) as updated_last_hour
            FROM canonical_items
        `);
        
        const latestUpdate = lastUpdate.rows[0].latest_update;
        const totalItems = parseInt(lastUpdate.rows[0].total_items);
        const updatedLast5Min = parseInt(lastUpdate.rows[0].updated_last_5min);
        const updatedLastHour = parseInt(lastUpdate.rows[0].updated_last_hour);
        
        console.log(`\n📊 Canonical items: ${totalItems} total`);
        console.log(`   Updated in last 5 minutes: ${updatedLast5Min}`);
        console.log(`   Updated in last hour: ${updatedLastHour}`);
        
        if (latestUpdate) {
            const age = Math.floor(Date.now() / 1000) - latestUpdate;
            const ageMinutes = Math.floor(age / 60);
            const ageHours = Math.floor(ageMinutes / 60);
            console.log(`   Last update: ${new Date(latestUpdate * 1000).toISOString()}`);
            console.log(`   Age: ${age}s (${ageMinutes} minutes, ${ageHours} hours)`);
            
            if (age > 300) {
                console.log(`   ⚠️  WARNING: No updates in last 5 minutes!`);
            }
        } else {
            console.log(`   ❌ No updates found!`);
        }
        
        // 3. Check for lock file
        const lockFile = path.join(__dirname, "..", "poller", "locks", "canonical.lock");
        const lockExists = fs.existsSync(lockFile);
        console.log(`\n🔒 Lock file: ${lockExists ? "EXISTS" : "NOT FOUND"}`);
        
        if (lockExists) {
            try {
                const lockContent = fs.readFileSync(lockFile, "utf8");
                const lockData = JSON.parse(lockContent);
                const lockAge = Math.floor(Date.now() / 1000) - lockData.timestamp;
                console.log(`   Lock created: ${new Date(lockData.timestamp * 1000).toISOString()}`);
                console.log(`   Lock age: ${lockAge}s (${Math.floor(lockAge/60)} minutes)`);
                
                if (lockAge > 600) {
                    console.log(`   ⚠️  WARNING: Lock is very old (>10 minutes) - process may be stuck!`);
                }
            } catch (err) {
                console.log(`   ⚠️  Could not read lock file: ${err.message}`);
            }
        }
        
        // 4. Check process logs for recent canonical updates
        console.log(`\n📋 Recent process activity:`);
        console.log(`   Run: node poller/view-process-logs.js 10 | grep -i canonical`);
        
        // 5. Check if scheduler is running (check for process logs)
        const logsDir = path.join(__dirname, "..", "logs");
        if (fs.existsSync(logsDir)) {
            const logFiles = fs.readdirSync(logsDir).filter(f => f.includes("process"));
            if (logFiles.length > 0) {
                // Get most recent log file
                const logFilesWithTime = logFiles.map(f => {
                    const stat = fs.statSync(path.join(logsDir, f));
                    return { name: f, mtime: stat.mtime };
                }).sort((a, b) => b.mtime - a.mtime);
                
                if (logFilesWithTime.length > 0) {
                    const latestLog = logFilesWithTime[0];
                    const logAge = Date.now() - latestLog.mtime.getTime();
                    console.log(`\n📝 Latest log file: ${latestLog.name}`);
                    console.log(`   Last modified: ${Math.floor(logAge/1000)}s ago`);
                    
                    if (logAge > 300000) { // 5 minutes
                        console.log(`   ⚠️  WARNING: No log activity in last 5 minutes - scheduler may not be running!`);
                    }
                }
            }
        }
        
        // 6. Summary and recommendations
        console.log("\n" + "=".repeat(80));
        console.log("📋 SUMMARY & RECOMMENDATIONS");
        console.log("=".repeat(80));
        
        const issues = [];
        
        if (dirtyItemsCount > 0 && updatedLast5Min === 0) {
            issues.push(`❌ ${dirtyItemsCount} items in queue but no updates in last 5 minutes`);
        }
        
        if (latestUpdate && (Date.now() / 1000 - latestUpdate) > 300) {
            issues.push(`❌ Last update was ${Math.floor((Date.now() / 1000 - latestUpdate) / 60)} minutes ago`);
        }
        
        if (lockExists && lockAge > 600) {
            issues.push(`❌ Lock file exists and is ${Math.floor(lockAge/60)} minutes old - process may be stuck`);
        }
        
        if (issues.length === 0) {
            console.log("✅ Canonical update appears to be running normally");
        } else {
            console.log("⚠️  Issues detected:");
            issues.forEach(issue => console.log(`   ${issue}`));
            console.log("\n💡 Recommendations:");
            if (lockExists && lockAge > 600) {
                console.log("   1. Check if update-canonical-items.js process is stuck");
                console.log("   2. If stuck, clear lock: node scripts/clear-canonical-lock.js");
            }
            if (dirtyItemsCount > 0 && updatedLast5Min === 0) {
                console.log("   3. Check scheduler is running: node poller/scheduler.js");
                console.log("   4. Manually trigger update: node poller/update-canonical-items.js");
            }
        }
        
        console.log("\n" + "=".repeat(80));
        
    } catch (err) {
        console.error("❌ Error:", err.message);
        console.error(err.stack);
    } finally {
        await db.end();
    }
})();



