const axios = require("axios");

// Configuration
const CAPTURE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const OSRS_WIKI_API_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";

// State
const itemCache = new Map(); // itemId -> { lastHigh, lastLow, initialized }
let startTime = null;
let isRunning = false;
let currentTickPromise = null;

// Statistics
const stats = {
    realUpdates: 0,
    timestampOnly: 0,
    fetchFailures: 0,
    skippedTicks: 0,
    totalTicks: 0,
};

/**
 * Format timestamp to [HH:MM:SS] format
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `[${hours}:${minutes}:${seconds}]`;
}

/**
 * Calculate next 10-second boundary
 */
function getNextTickTime() {
    const now = Date.now();
    const currentSeconds = Math.floor(now / 1000);
    const currentSecondInMinute = currentSeconds % 60;
    
    // Find next 10-second boundary (0, 10, 20, 30, 40, 50)
    let nextSecondInMinute;
    if (currentSecondInMinute < 10) {
        nextSecondInMinute = 10;
    } else if (currentSecondInMinute < 20) {
        nextSecondInMinute = 20;
    } else if (currentSecondInMinute < 30) {
        nextSecondInMinute = 30;
    } else if (currentSecondInMinute < 40) {
        nextSecondInMinute = 40;
    } else if (currentSecondInMinute < 50) {
        nextSecondInMinute = 50;
    } else {
        // Next minute, so next boundary is :00 of next minute
        nextSecondInMinute = 60;
    }
    
    // Calculate seconds until next boundary
    const secondsUntilNext = nextSecondInMinute - currentSecondInMinute;
    const nextTickSeconds = currentSeconds + secondsUntilNext;
    const nextTickMs = nextTickSeconds * 1000;
    
    return nextTickMs;
}

/**
 * Fetch latest prices from OSRS Wiki API
 */
async function fetchLatestPrices() {
    try {
        const response = await axios.get(OSRS_WIKI_API_URL, {
            headers: {
                "User-Agent": "flipperpro-clock-analyzer",
            },
            timeout: 10000, // 10 second timeout
        });
        
        return response.data;
    } catch (err) {
        if (err.code === "ECONNABORTED") {
            throw new Error("Request timeout");
        } else if (err.response) {
            throw new Error(`HTTP ${err.response.status}: ${err.response.statusText}`);
        } else {
            throw new Error(`API fetch failed: ${err.message}`);
        }
    }
}

/**
 * Process a single tick - fetch and analyze price changes
 */
async function processTick() {
    const tickStartTime = Date.now();
    const tickTimeStr = formatTime(tickStartTime);
    
    try {
        // Fetch latest prices from OSRS Wiki
        const latestData = await fetchLatestPrices();
        
        if (!latestData || Object.keys(latestData).length === 0) {
            console.log(`${tickTimeStr} ❌ API FETCH FAILED — no data received`);
            stats.fetchFailures++;
            stats.totalTicks++;
            return;
        }
        
        // Process each item
        // OSRS Wiki API returns: { [itemId]: { high, highTime, low, lowTime } }
        let hasRealUpdate = false;
        let realUpdateItems = [];
        
        for (const [itemIdStr, itemData] of Object.entries(latestData)) {
            const itemId = parseInt(itemIdStr, 10);
            const { high, low } = itemData;
            
            // Skip if missing data
            if (high == null || low == null) {
                continue;
            }
            
            // Get or initialize cache entry
            if (!itemCache.has(itemId)) {
                itemCache.set(itemId, {
                    lastHigh: high,
                    lastLow: low,
                    initialized: true,
                });
                // First observation - mark as init (but don't log as update)
                continue;
            }
            
            const cached = itemCache.get(itemId);
            
            // Check for price changes
            const highChanged = cached.lastHigh !== high;
            const lowChanged = cached.lastLow !== low;
            
            if (highChanged || lowChanged) {
                // Real price change!
                hasRealUpdate = true;
                realUpdateItems.push(itemId);
                
                // Update cache
                cached.lastHigh = high;
                cached.lastLow = low;
            }
        }
        
        // Log result
        if (hasRealUpdate) {
            // Log each item with real update
            for (const itemId of realUpdateItems) {
                console.log(`${tickTimeStr} ✅ REAL PRICE CHANGE — item ${itemId}`);
            }
            stats.realUpdates += realUpdateItems.length;
        } else {
            console.log(`${tickTimeStr} ⚠️ Timestamp update only — no price change`);
            stats.timestampOnly++;
        }
        
        stats.totalTicks++;
        
    } catch (err) {
        const errorTimeStr = formatTime(Date.now());
        console.log(`${errorTimeStr} ❌ API FETCH FAILED — ${err.message}`);
        stats.fetchFailures++;
        stats.totalTicks++;
    }
}

/**
 * Schedule next tick at the correct 10-second boundary
 */
function scheduleNextTick() {
    const now = Date.now();
    const elapsed = now - startTime;
    
    // Check if we've reached 2 hours
    if (elapsed >= CAPTURE_DURATION_MS) {
        // Time's up!
        isRunning = false;
        printSummary();
        process.exit(0);
        return;
    }
    
    // Calculate next tick time
    const nextTickTime = getNextTickTime();
    const delay = Math.max(0, nextTickTime - now);
    
    setTimeout(() => {
        // Check if previous tick is still running
        if (currentTickPromise !== null) {
            const skipTimeStr = formatTime(Date.now());
            console.log(`${skipTimeStr} ⏳ Previous tick still running — skipping this slot`);
            stats.skippedTicks++;
            stats.totalTicks++;
            scheduleNextTick();
            return;
        }
        
        // Mark tick as in progress
        currentTickPromise = Promise.resolve();
        
        // Process tick
        processTick()
            .then(() => {
                currentTickPromise = null;
                scheduleNextTick();
            })
            .catch((err) => {
                currentTickPromise = null;
                const errorTimeStr = formatTime(Date.now());
                console.error(`${errorTimeStr} ❌ TICK ERROR:`, err.message);
                scheduleNextTick();
            });
    }, delay);
}

/**
 * Print summary statistics
 */
function printSummary() {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000 / 60; // minutes
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ 2-hour capture complete");
    console.log("=".repeat(60));
    console.log(`Duration: ${duration.toFixed(2)} minutes`);
    console.log(`Total ticks: ${stats.totalTicks}`);
    console.log(`Real price changes: ${stats.realUpdates}`);
    console.log(`Timestamp-only updates: ${stats.timestampOnly}`);
    console.log(`Fetch failures: ${stats.fetchFailures}`);
    console.log(`Skipped ticks (overlap): ${stats.skippedTicks}`);
    console.log("=".repeat(60));
}

/**
 * Main entry point
 */
async function main() {
    console.log("🚀 Starting 2-hour clock-aligned OSRS Wiki capture script");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Duration: 2 hours`);
    console.log(`Tick interval: 10 seconds (clock-aligned)`);
    console.log(`Target boundaries: :00, :10, :20, :30, :40, :50`);
    console.log(`API: ${OSRS_WIKI_API_URL}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    // Start capture
    startTime = Date.now();
    isRunning = true;
    
    // Schedule first tick immediately (will align to next boundary)
    scheduleNextTick();
    
    // Handle graceful shutdown
    process.on("SIGINT", () => {
        console.log("\n\n⚠️  Interrupted by user");
        isRunning = false;
        printSummary();
        process.exit(0);
    });
    
    process.on("SIGTERM", () => {
        console.log("\n\n⚠️  Terminated");
        isRunning = false;
        printSummary();
        process.exit(0);
    });
}

// Run
main().catch((err) => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
});

