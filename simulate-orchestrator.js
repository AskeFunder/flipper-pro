require("./load-env");
const axios = require("axios");

const headers = {
    "User-Agent": "flipperpro-dev - @montemarto on Discord"
};

/**
 * Format timestamp to [HH:MM:SS] format
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format time for 5m logs (always shows :00 seconds)
 */
function formatTime5m(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}:00`;
}

// Track when latest poller last succeeded (for calculating next poll time)
let lastLatestSuccessTime = null;

/**
 * Calculate next latest poll time
 * If we have a last success time, use that + 60 seconds
 * Otherwise, use next minute boundary
 */
function getNextLatestBoundary() {
    const now = Date.now();
    
    // If we have a last success time, schedule 60 seconds after that
    if (lastLatestSuccessTime !== null) {
        const nextTime = lastLatestSuccessTime + 60000; // 60 seconds
        // Only use it if it's in the future
        if (nextTime > now) {
            return nextTime;
        }
    }
    
    // Fallback: use next minute boundary
    const date = new Date(now);
    const currentHour = date.getHours();
    const currentMinute = date.getMinutes();
    
    let nextMinute = currentMinute + 1;
    let nextHour = currentHour;
    
    if (nextMinute >= 60) {
        nextMinute = 0;
        nextHour = (currentHour + 1) % 24;
    }
    
    const targetDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        nextHour,
        nextMinute,
        0,
        0
    );
    
    return targetDate.getTime();
}

/**
 * Calculate next 5-minute boundary (aligned to HH:00:00, HH:05:00, HH:10:00, etc.)
 */
function getNext5MinuteBoundary() {
    const now = Date.now();
    const date = new Date(now);
    const currentMinutes = date.getUTCMinutes();
    
    const minutesInHour = currentMinutes;
    const next5MinuteInHour = Math.ceil((minutesInHour + 1) / 5) * 5;
    
    let nextMinutes;
    let nextHours = date.getUTCHours();
    
    if (next5MinuteInHour >= 60) {
        nextMinutes = 0;
        nextHours = (nextHours + 1) % 24;
    } else {
        nextMinutes = next5MinuteInHour;
    }
    
    const targetDate = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        nextHours,
        nextMinutes,
        0,
        0
    ));
    
    return targetDate.getTime();
}

// In-memory state to track last known prices/timestamps (simulating DB state)
const latestState = new Map(); // itemId -> { high: { price, timestamp }, low: { price, timestamp } }

async function simulateLatestPoll() {
    const tickTimeStr = formatTime(Date.now());
    console.log(`[latest] tick @ ${tickTimeStr}`);
    
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelayMs = 5000; // 5 seconds
    
    async function attemptPoll() {
        try {
            const { data } = await axios.get("https://prices.runescape.wiki/api/v1/osrs/latest", { headers });
            const apiData = data.data || {};
            const itemCount = Object.keys(apiData).length;
            
            let priceChanges = 0;
            let timestampOnlyChanges = 0;
            let newItems = 0;
            let unchanged = 0;
            
            for (const [itemIdStr, entry] of Object.entries(apiData)) {
                const itemId = parseInt(itemIdStr, 10);
                const currentState = latestState.get(itemId) || { high: null, low: null };
                
                // Check HIGH price
                if (entry.high !== null && entry.highTime !== null) {
                    if (currentState.high === null) {
                        newItems++;
                        latestState.set(itemId, {
                            ...currentState,
                            high: { price: entry.high, timestamp: entry.highTime }
                        });
                    } else {
                        const priceChanged = currentState.high.price !== entry.high;
                        const timeChanged = currentState.high.timestamp !== entry.highTime;
                        
                        if (priceChanged || timeChanged) {
                            if (priceChanged) {
                                priceChanges++;
                            } else if (timeChanged) {
                                timestampOnlyChanges++;
                            }
                            latestState.set(itemId, {
                                ...currentState,
                                high: { price: entry.high, timestamp: entry.highTime }
                            });
                        } else {
                            unchanged++;
                        }
                    }
                }
                
                // Check LOW price
                if (entry.low !== null && entry.lowTime !== null) {
                    if (currentState.low === null) {
                        newItems++;
                        const updatedState = latestState.get(itemId) || { high: null, low: null };
                        latestState.set(itemId, {
                            ...updatedState,
                            low: { price: entry.low, timestamp: entry.lowTime }
                        });
                    } else {
                        const priceChanged = currentState.low.price !== entry.low;
                        const timeChanged = currentState.low.timestamp !== entry.lowTime;
                        
                        if (priceChanged || timeChanged) {
                            if (priceChanged) {
                                priceChanges++;
                            } else if (timeChanged) {
                                timestampOnlyChanges++;
                            }
                            const updatedState = latestState.get(itemId) || { high: null, low: null };
                            latestState.set(itemId, {
                                ...updatedState,
                                low: { price: entry.low, timestamp: entry.lowTime }
                            });
                        } else {
                            unchanged++;
                        }
                    }
                }
            }
            
            const totalChanges = priceChanges + timestampOnlyChanges + newItems;
            
            // If no changes at all, it's a fail - retry
            if (totalChanges === 0 && unchanged > 0) {
                retryCount++;
                if (retryCount > maxRetries) {
                    console.log(`[latest] FAILED: No changes after ${maxRetries} retries (${unchanged} items unchanged)`);
                    return false;
                }
                console.log(`[latest] retry ${retryCount}/${maxRetries} (no changes detected, ${unchanged} items unchanged)`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                return attemptPoll();
            }
            
            console.log(`[latest] SUCCESS: ${itemCount} items | 💰 Price changes: ${priceChanges} | ⏰ Timestamp-only: ${timestampOnlyChanges} | 🆕 New: ${newItems} | ⏭️ Unchanged: ${unchanged}`);
            return true;
            
        } catch (err) {
            retryCount++;
            if (retryCount > maxRetries) {
                console.log(`[latest] FAILED after ${maxRetries} retries: ${err.message}`);
                return false;
            }
            console.log(`[latest] retry ${retryCount}/${maxRetries} (error: ${err.message})`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            return attemptPoll();
        }
    }
    
    return await attemptPoll();
}

async function simulateGranularityPoll(gran, boundaryTimestamp) {
    const granConfig = {
        "5m": { interval: 300, endpoint: "5m" },
        "1h": { interval: 3600, endpoint: "1h" },
        "6h": { interval: 21600, endpoint: "6h" },
        "24h": { interval: 86400, endpoint: "24h" }
    };
    
    const config = granConfig[gran];
    if (!config) return false;
    
    const boundarySeconds = Math.floor(boundaryTimestamp / 1000);
    const targetApiTimestamp = boundarySeconds - config.interval;
    const targetDateStr = new Date(targetApiTimestamp * 1000).toISOString();
    
    console.log(`[${gran}] attempting to fetch API timestamp ${targetApiTimestamp} (${targetDateStr})`);
    
    let retryCount = 0;
    const maxRetries = 12;
    
    async function attemptPoll() {
        try {
            const apiUrl = `https://prices.runescape.wiki/api/v1/osrs/${config.endpoint}?timestamp=${targetApiTimestamp}`;
            const { data } = await axios.get(apiUrl, { headers });
            
            if (!data.data || Object.keys(data.data).length === 0) {
                retryCount++;
                if (retryCount > maxRetries) {
                    console.log(`[${gran}] FAILED after ${maxRetries} retries`);
                    return false;
                }
                console.log(`[${gran}] retry ${retryCount}/${maxRetries} (empty data)`);
                await new Promise(resolve => setTimeout(resolve, 100)); // Simulated retry delay
                return attemptPoll();
            }
            
            const itemsWithData = Object.keys(data.data).filter(id => {
                const item = data.data[id];
                return item && (item.avgHighPrice != null || item.avgLowPrice != null);
            });
            
            console.log(`[${gran}] SUCCESS: ${itemsWithData.length} items with data`);
            return true;
            
        } catch (err) {
            if (err.response?.status === 404 || err.message?.includes('empty data')) {
                retryCount++;
                if (retryCount > maxRetries) {
                    console.log(`[${gran}] FAILED after ${maxRetries} retries`);
                    return false;
                }
                console.log(`[${gran}] retry ${retryCount}/${maxRetries} (${err.response?.status === 404 ? '404' : 'empty data'})`);
                await new Promise(resolve => setTimeout(resolve, 100)); // Simulated retry delay
                return attemptPoll();
            } else {
                console.log(`[${gran}] ERROR: ${err.message}`);
                return false;
            }
        }
    }
    
    return await attemptPoll();
}

function shouldRun1hForBoundary(boundaryTimestamp) {
    if (!boundaryTimestamp) return false;
    const boundaryDate = new Date(boundaryTimestamp);
    return boundaryDate.getUTCMinutes() === 0;
}

function shouldRun6hForBoundary(boundaryTimestamp) {
    if (!boundaryTimestamp) return false;
    const boundaryDate = new Date(boundaryTimestamp);
    const hour = boundaryDate.getUTCHours();
    return boundaryDate.getUTCMinutes() === 0 && 
           (hour === 0 || hour === 6 || hour === 12 || hour === 18);
}

function shouldRun24hForBoundary(boundaryTimestamp) {
    if (!boundaryTimestamp) return false;
    const boundaryDate = new Date(boundaryTimestamp);
    return boundaryDate.getUTCHours() === 0 && boundaryDate.getUTCMinutes() === 0;
}

async function simulateCanonical() {
    console.log(`[canonical] update starting...`);
    // Simulate canonical update
    await new Promise(resolve => setTimeout(resolve, 10));
    console.log(`[canonical] SUCCESS`);
}

async function simulateCleanup() {
    console.log(`[cleanup] starting...`);
    // Simulate cleanup
    await new Promise(resolve => setTimeout(resolve, 10));
    console.log(`[cleanup] SUCCESS`);
}

let isShuttingDown = false;
let latestRunning = false;
let fiveMinuteRunning = false;
let oneHourRunning = false;
let sixHourRunning = false;
let twentyFourHourRunning = false;
let canonicalRunning = false;

/**
 * Run canonical if ready (not running and no granularity running)
 */
async function runCanonicalIfReady() {
    if (canonicalRunning || 
        fiveMinuteRunning || 
        oneHourRunning || 
        sixHourRunning || 
        twentyFourHourRunning) {
        return;
    }
    
    canonicalRunning = true;
    await simulateCanonical();
    canonicalRunning = false;
}

/**
 * Schedule latest poller (runs every 60 seconds after success)
 */
function scheduleLatestPoller() {
    if (isShuttingDown) {
        return;
    }
    
    if (latestRunning) {
        // Still running, reschedule
        const nextBoundary = getNextLatestBoundary();
        const delay = Math.max(0, nextBoundary - Date.now());
        setTimeout(scheduleLatestPoller, delay);
        return;
    }
    
    const nextBoundary = getNextLatestBoundary();
    const delay = nextBoundary - Date.now();
    
    if (delay < 0) {
        // Boundary already passed, run immediately
        runLatestPollWithRetry();
        return;
    }
    
    const delaySeconds = Math.floor(delay / 1000);
    const delayMs = delay % 1000;
    console.log(`[latest] next tick in ${delaySeconds}s ${delayMs}ms (at ${formatTime(nextBoundary)})`);
    
    setTimeout(() => {
        if (isShuttingDown) {
            return;
        }
        runLatestPollWithRetry();
    }, delay);
}

/**
 * Run latest poll with retry logic if no changes detected
 */
function runLatestPollWithRetry() {
    if (isShuttingDown || latestRunning) {
        return;
    }
    
    latestRunning = true;
    const tickTimeStr = formatTime(Date.now());
    console.log(`[latest] tick @ ${tickTimeStr}`);
    
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelayMs = 5000; // 5 seconds
    
    async function attemptPoll() {
        if (isShuttingDown) {
            latestRunning = false;
            return;
        }
        
        const success = await simulateLatestPoll();
        
        if (success) {
            // Success - record the success time
            lastLatestSuccessTime = Date.now();
            latestRunning = false;
            
            // Run canonical if no granularity is running
            if (!fiveMinuteRunning && !oneHourRunning && !sixHourRunning && !twentyFourHourRunning) {
                console.log(`[latest] → triggering canonical (no granularity running)`);
                await runCanonicalIfReady();
            } else {
                console.log(`[latest] → skipping canonical (granularity running, will run after granularity chain)`);
            }
            
            if (!isShuttingDown) {
                scheduleLatestPoller();
            }
        } else {
            // Failed - reschedule
            latestRunning = false;
            if (!isShuttingDown) {
                scheduleLatestPoller();
            }
        }
    }
    
    attemptPoll();
}

/**
 * Schedule 5m poller (runs every 5 minutes at boundaries)
 */
function schedule5MinutePoller() {
    if (isShuttingDown) {
        return;
    }
    
    if (fiveMinuteRunning) {
        // Still running, reschedule
        const nextBoundary = getNext5MinuteBoundary();
        const delay = Math.max(0, nextBoundary - Date.now());
        setTimeout(schedule5MinutePoller, delay);
        return;
    }
    
    const nextBoundary = getNext5MinuteBoundary();
    const delay = nextBoundary - Date.now();
    
    if (delay < 0) {
        // Boundary already passed, run immediately
        run5mPoll(nextBoundary);
        return;
    }
    
    const delaySeconds = Math.floor(delay / 1000);
    const delayMs = delay % 1000;
    const boundaryStr = formatTime5m(nextBoundary);
    console.log(`[5m] next tick in ${delaySeconds}s ${delayMs}ms (at ${boundaryStr})`);
    
    setTimeout(() => {
        if (isShuttingDown) {
            return;
        }
        run5mPoll(nextBoundary);
    }, delay);
    
    function run5mPoll(boundaryTimestamp) {
        if (isShuttingDown || fiveMinuteRunning) {
            return;
        }
        
        // Priority queue: Wait for latest to finish if it's running
        if (latestRunning) {
            console.log(`[5m] ⏳ waiting for latest to finish (priority queue)...`);
            // Check every second if latest is done
            const checkInterval = setInterval(() => {
                if (isShuttingDown) {
                    clearInterval(checkInterval);
                    return;
                }
                
                if (!latestRunning) {
                    clearInterval(checkInterval);
                    // Latest is done, now run 5m
                    run5mPoll(boundaryTimestamp);
                }
            }, 1000);
            return;
        }
        
        fiveMinuteRunning = true;
        const tickTimeStr = formatTime5m(boundaryTimestamp);
        console.log(`\n[5m] tick @ ${tickTimeStr}`);
        
        simulateGranularityPoll("5m", boundaryTimestamp)
            .then((success) => {
                if (success) {
                    // Chain: 1h, 6h, 24h, canonical, cleanup
                    return Promise.resolve()
                        .then(() => {
                            if (shouldRun1hForBoundary(boundaryTimestamp)) {
                                oneHourRunning = true;
                                console.log(`\n[1h] tick @ ${formatTime5m(Date.now())}`);
                                return simulateGranularityPoll("1h", boundaryTimestamp)
                                    .finally(() => { oneHourRunning = false; });
                            }
                        })
                        .then(() => {
                            if (shouldRun6hForBoundary(boundaryTimestamp)) {
                                sixHourRunning = true;
                                console.log(`\n[6h] tick @ ${formatTime5m(Date.now())}`);
                                return simulateGranularityPoll("6h", boundaryTimestamp)
                                    .finally(() => { sixHourRunning = false; });
                            }
                        })
                        .then(() => {
                            if (shouldRun24hForBoundary(boundaryTimestamp)) {
                                twentyFourHourRunning = true;
                                console.log(`\n[24h] tick @ ${formatTime5m(Date.now())}`);
                                return simulateGranularityPoll("24h", boundaryTimestamp)
                                    .finally(() => { twentyFourHourRunning = false; });
                            }
                        })
                        .then(() => {
                            console.log(`\n[5m] → triggering canonical (after granularity chain)`);
                            return runCanonicalIfReady();
                        })
                        .then(() => {
                            console.log(`[cleanup] starting...`);
                            return simulateCleanup();
                        })
                        .then(() => {
                            fiveMinuteRunning = false;
                            if (!isShuttingDown) {
                                schedule5MinutePoller();
                            }
                        })
                        .catch((err) => {
                            console.error(`[orchestrator] Error in chain:`, err.message);
                            fiveMinuteRunning = false;
                            if (!isShuttingDown) {
                                schedule5MinutePoller();
                            }
                        });
                } else {
                    // Failed, but reschedule anyway
                    fiveMinuteRunning = false;
                    if (!isShuttingDown) {
                        schedule5MinutePoller();
                    }
                }
            });
    }
}

/**
 * Start the simulation
 */
function startSimulation() {
    isShuttingDown = false;
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🧪 Orchestrator Simulation (Full Pipeline - Real Timing)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 FLOW:");
    console.log("   - Latest → Canonical (if no granularity running)");
    console.log("   - 5m → 1h → 6h → 24h → Canonical → Cleanup (if granularity running)");
    console.log("   - Latest has priority over granularities");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    // Start both loops (like real orchestrator)
    scheduleLatestPoller();
    schedule5MinutePoller();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log("\n[simulation] Shutting down gracefully...");
        isShuttingDown = true;
        setTimeout(() => process.exit(0), 1000);
    });
}

startSimulation();
