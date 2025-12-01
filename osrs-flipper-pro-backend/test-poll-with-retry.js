// test-poll-with-retry.js
// Waits for database connections to free up, then runs poll-latest.js

require("dotenv").config();
const { Pool } = require("pg");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

const MAX_RETRIES = 10;
const RETRY_DELAY = 5000; // 5 seconds

async function checkDatabaseConnections() {
    const testPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1
    });
    
    try {
        await testPool.query("SELECT 1");
        await testPool.end();
        return true;
    } catch (err) {
        await testPool.end();
        if (err.message.includes("remaining connection slots")) {
            return false;
        }
        throw err;
    }
}

async function waitForConnections() {
    console.log("⏳ Waiting for database connections to free up...");
    
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const available = await checkDatabaseConnections();
            if (available) {
                console.log("✅ Database connections available!");
                return true;
            }
            console.log(`⏳ Attempt ${i + 1}/${MAX_RETRIES}: Still waiting... (${RETRY_DELAY / 1000}s delay)`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        } catch (err) {
            console.error("❌ Error checking connections:", err.message);
            return false;
        }
    }
    
    console.log("❌ Timeout waiting for connections");
    return false;
}

async function runPollLatest() {
    console.log("🚀 Running poll-latest.js...");
    try {
        const { stdout, stderr } = await execAsync("node poller/poll-latest.js", {
            cwd: __dirname,
            env: { ...process.env }
        });
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
        process.exit(0);
    } catch (err) {
        console.error("❌ Error running poll-latest:", err.message);
        if (err.stdout) console.log(err.stdout);
        if (err.stderr) console.error(err.stderr);
        process.exit(1);
    }
}

(async () => {
    const available = await waitForConnections();
    if (available) {
        await runPollLatest();
    } else {
        console.log("\n💡 Tip: Stop other node processes or wait longer for connections to timeout");
        process.exit(1);
    }
})();






