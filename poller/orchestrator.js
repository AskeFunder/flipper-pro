// Environment variables are loaded by load-env.js before this module is required
const { runLatestPollOnce } = require("./latestPoller");
const { run5mPollOnce } = require("./fiveMinutePoller");
const { pollGranularity } = require("./poll-granularities");
const updateCanonicalItems = require("./update-canonical-items");
const { runCleanup } = require("./cleanup-timeseries");

// State for tracking execution
let latestRunning = false;
let fiveMinuteRunning = false;
let oneHourRunning = false;
let sixHourRunning = false;
let twentyFourHourRunning = false;
let canonicalRunning = false;

// Shutdown flag to stop all loops gracefully
let isShuttingDown = false;

// Track when latest poller last succeeded (for calculating next poll time)
let lastLatestSuccessTime = null;

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
 * Uses absolute UTC boundaries - never drifts, completely independent of latest phase
 */
function getNext5MinuteBoundary() {
    const now = Date.now();
    
    // Get current UTC time components
    const date = new Date(now);
    const currentMinutes = date.getUTCMinutes();
    
    // Find next 5-minute boundary
    // Examples: :23 -> :25, :25 -> :30, :57 -> :00 (next hour)
    const minutesInHour = currentMinutes;
    const next5MinuteInHour = Math.ceil((minutesInHour + 1) / 5) * 5;
    
    let nextMinutes;
    let nextHours = date.getUTCHours();
    
    if (next5MinuteInHour >= 60) {
        // Roll over to next hour
        nextMinutes = 0;
        nextHours = (nextHours + 1) % 24;
    } else {
        nextMinutes = next5MinuteInHour;
    }
    
    // Create target date for next boundary (always at :00 seconds)
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

/**
 * Check if boundary matches 1h requirement (at :00:00 of every hour)
 */
function shouldRun1hForBoundary(boundaryTimestamp) {
    if (!boundaryTimestamp) return false;
    const boundaryDate = new Date(boundaryTimestamp);
    return boundaryDate.getUTCMinutes() === 0;
}

/**
 * Check if boundary matches 6h requirement (at 00:00, 06:00, 12:00, 18:00)
 */
function shouldRun6hForBoundary(boundaryTimestamp) {
    if (!boundaryTimestamp) return false;
    const boundaryDate = new Date(boundaryTimestamp);
    const hour = boundaryDate.getUTCHours();
    return boundaryDate.getUTCMinutes() === 0 && 
           (hour === 0 || hour === 6 || hour === 12 || hour === 18);
}

/**
 * Check if boundary matches 24h requirement (at 00:00:00 daily)
 */
function shouldRun24hForBoundary(boundaryTimestamp) {
    if (!boundaryTimestamp) return false;
    const boundaryDate = new Date(boundaryTimestamp);
    return boundaryDate.getUTCHours() === 0 && boundaryDate.getUTCMinutes() === 0;
}

/**
 * Run 1h poll with retry logic (staggered, similar to 5m)
 */
async function run1hWithRetry() {
    if (oneHourRunning) {
        return;
    }
    
    // Priority queue: Wait for latest to finish if it's running
    if (latestRunning) {
        console.log(`[orchestrator] ⏳ 1h waiting for latest to finish (priority queue)...`);
        // Check every second if latest is done
        const checkInterval = setInterval(() => {
            if (isShuttingDown) {
                clearInterval(checkInterval);
                return;
            }
            
            if (!latestRunning) {
                clearInterval(checkInterval);
                // Latest is done, now run 1h
                run1hWithRetry();
            }
        }, 1000);
        return;
    }
    
    oneHourRunning = true;
    console.log(`[orchestrator] 1h tick @ ${formatTime5m(Date.now())}`);
    
    // Calculate target API timestamp (1 hour ago)
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = 3600;
    const alignedNow = now - (now % intervalSeconds);
    const targetApiTimestamp = alignedNow - intervalSeconds;
    
    let retryCount = 0;
    const maxRetries = 12; // 12 retries * 10s = 2 minutes max wait
    const retryDelayMs = 10000; // 10 seconds between retries
    
    function attemptPoll() {
        if (isShuttingDown) {
            oneHourRunning = false;
            return Promise.resolve();
        }
        
        return pollGranularity("1h")
            .then(() => {
                if (retryCount > 0) {
                    console.log(`[orchestrator] ✅ 1h succeeded after ${retryCount} retry${retryCount > 1 ? 'ies' : ''}`);
                } else {
                    console.log(`[orchestrator] ✅ 1h succeeded on first attempt`);
                }
                oneHourRunning = false;
            })
            .catch((err) => {
                retryCount++;
                
                if (retryCount > maxRetries) {
                    console.log(`[orchestrator] ❌ 1h FAILED after ${maxRetries} retries — giving up`);
                    oneHourRunning = false;
                    return Promise.resolve(); // Resolve to continue chain
                }
                
                console.log(`[orchestrator] 🔄 1h retry ${retryCount}/${maxRetries} in ${retryDelayMs/1000}s`);
                
                if (isShuttingDown) {
                    oneHourRunning = false;
                    return Promise.resolve();
                }
                
                return new Promise((resolve) => {
                    setTimeout(() => {
                        attemptPoll().then(resolve);
                    }, retryDelayMs);
                });
            });
    }
    
    return attemptPoll();
}

/**
 * Run 1h poll if boundary matches (staggered after 5m)
 */
async function run1hIfNeeded(boundaryTimestamp) {
    if (oneHourRunning) {
        return;
    }
    
    if (shouldRun1hForBoundary(boundaryTimestamp)) {
        try {
            await run1hWithRetry();
        } catch (err) {
            console.error(`[orchestrator] ❌ 1h failed:`, err.message);
            if (err.stack) {
                console.error(err.stack);
            }
            oneHourRunning = false; // Reset flag on error
        }
    }
}

/**
 * Run 6h poll with retry logic (staggered, similar to 5m)
 */
async function run6hWithRetry() {
    if (sixHourRunning) {
        return;
    }
    
    // Priority queue: Wait for latest to finish if it's running
    if (latestRunning) {
        console.log(`[orchestrator] ⏳ 6h waiting for latest to finish (priority queue)...`);
        // Check every second if latest is done
        const checkInterval = setInterval(() => {
            if (isShuttingDown) {
                clearInterval(checkInterval);
                return;
            }
            
            if (!latestRunning) {
                clearInterval(checkInterval);
                // Latest is done, now run 6h
                run6hWithRetry();
            }
        }, 1000);
        return;
    }
    
    sixHourRunning = true;
    console.log(`[orchestrator] 6h tick @ ${formatTime5m(Date.now())}`);
    
    // Calculate target API timestamp (6 hours ago)
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = 21600;
    const alignedNow = now - (now % intervalSeconds);
    const targetApiTimestamp = alignedNow - intervalSeconds;
    
    let retryCount = 0;
    const maxRetries = 12;
    const retryDelayMs = 10000;
    
    function attemptPoll() {
        if (isShuttingDown) {
            sixHourRunning = false;
            return Promise.resolve();
        }
        
        return pollGranularity("6h")
            .then(() => {
                if (retryCount > 0) {
                    console.log(`[orchestrator] ✅ 6h succeeded after ${retryCount} retry${retryCount > 1 ? 'ies' : ''}`);
                } else {
                    console.log(`[orchestrator] ✅ 6h succeeded on first attempt`);
                }
                sixHourRunning = false;
            })
            .catch((err) => {
                retryCount++;
                
                if (retryCount > maxRetries) {
                    console.log(`[orchestrator] ❌ 6h FAILED after ${maxRetries} retries — giving up`);
                    sixHourRunning = false;
                    return Promise.resolve();
                }
                
                console.log(`[orchestrator] 🔄 6h retry ${retryCount}/${maxRetries} in ${retryDelayMs/1000}s`);
                
                if (isShuttingDown) {
                    sixHourRunning = false;
                    return Promise.resolve();
                }
                
                return new Promise((resolve) => {
                    setTimeout(() => {
                        attemptPoll().then(resolve);
                    }, retryDelayMs);
                });
            });
    }
    
    return attemptPoll();
}

/**
 * Run 6h poll if boundary matches (staggered after 1h)
 */
async function run6hIfNeeded(boundaryTimestamp) {
    if (sixHourRunning) {
        return;
    }
    
    if (shouldRun6hForBoundary(boundaryTimestamp)) {
        try {
            await run6hWithRetry();
        } catch (err) {
            console.error(`[orchestrator] ❌ 6h failed:`, err.message);
            if (err.stack) {
                console.error(err.stack);
            }
            sixHourRunning = false; // Reset flag on error
        }
    }
}

/**
 * Run 24h poll with retry logic (staggered, similar to 5m)
 */
async function run24hWithRetry() {
    if (twentyFourHourRunning) {
        return;
    }
    
    // Priority queue: Wait for latest to finish if it's running
    if (latestRunning) {
        console.log(`[orchestrator] ⏳ 24h waiting for latest to finish (priority queue)...`);
        // Check every second if latest is done
        const checkInterval = setInterval(() => {
            if (isShuttingDown) {
                clearInterval(checkInterval);
                return;
            }
            
            if (!latestRunning) {
                clearInterval(checkInterval);
                // Latest is done, now run 24h
                run24hWithRetry();
            }
        }, 1000);
        return;
    }
    
    twentyFourHourRunning = true;
    console.log(`[orchestrator] 24h tick @ ${formatTime5m(Date.now())}`);
    
    // Calculate target API timestamp (24 hours ago)
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = 86400;
    const alignedNow = now - (now % intervalSeconds);
    const targetApiTimestamp = alignedNow - intervalSeconds;
    
    let retryCount = 0;
    const maxRetries = 12;
    const retryDelayMs = 10000;
    
    function attemptPoll() {
        if (isShuttingDown) {
            twentyFourHourRunning = false;
            return Promise.resolve();
        }
        
        return pollGranularity("24h")
            .then(() => {
                if (retryCount > 0) {
                    console.log(`[orchestrator] ✅ 24h succeeded after ${retryCount} retry${retryCount > 1 ? 'ies' : ''}`);
                } else {
                    console.log(`[orchestrator] ✅ 24h succeeded on first attempt`);
                }
                twentyFourHourRunning = false;
            })
            .catch((err) => {
                retryCount++;
                
                if (retryCount > maxRetries) {
                    console.log(`[orchestrator] ❌ 24h FAILED after ${maxRetries} retries — giving up`);
                    twentyFourHourRunning = false;
                    return Promise.resolve();
                }
                
                console.log(`[orchestrator] 🔄 24h retry ${retryCount}/${maxRetries} in ${retryDelayMs/1000}s`);
                
                if (isShuttingDown) {
                    twentyFourHourRunning = false;
                    return Promise.resolve();
                }
                
                return new Promise((resolve) => {
                    setTimeout(() => {
                        attemptPoll().then(resolve);
                    }, retryDelayMs);
                });
            });
    }
    
    return attemptPoll();
}

/**
 * Run 24h poll if boundary matches (staggered after 6h)
 */
async function run24hIfNeeded(boundaryTimestamp) {
    if (twentyFourHourRunning) {
        return;
    }
    
    if (shouldRun24hForBoundary(boundaryTimestamp)) {
        try {
            await run24hWithRetry();
        } catch (err) {
            console.error(`[orchestrator] ❌ 24h failed:`, err.message);
            if (err.stack) {
                console.error(err.stack);
            }
            twentyFourHourRunning = false; // Reset flag on error
        }
    }
}

/**
 * Run canonical update if all granularities are done
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
    console.log(`[orchestrator] canonical update starting...`);
    
    try {
        await updateCanonicalItems();
        console.log(`[orchestrator] ✅ canonical completed`);
    } catch (err) {
        console.error(`[orchestrator] ❌ canonical failed:`, err.message);
    } finally {
        canonicalRunning = false;
    }
}

/**
 * Run cleanup if all granularities and canonical are done
 */
async function runCleanupIfReady() {
    if (canonicalRunning || 
        fiveMinuteRunning || 
        oneHourRunning || 
        sixHourRunning || 
        twentyFourHourRunning) {
        return;
    }
    
    console.log(`[orchestrator] cleanup starting...`);
    
    try {
        await runCleanup();
        console.log(`[orchestrator] ✅ cleanup completed`);
    } catch (err) {
        console.error(`[orchestrator] ❌ cleanup failed:`, err.message);
    }
}

/**
 * Schedule and run latest poller with phase-shifted 60-second intervals
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
    console.log(`[orchestrator] next latest in ${delaySeconds}s ${delayMs}ms (at ${formatTime(nextBoundary)})`);
    
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
    console.log(`[orchestrator] latest tick @ ${tickTimeStr}`);
    
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelayMs = 5000; // 5 seconds between retries
    
    function attemptPoll() {
        if (isShuttingDown) {
            latestRunning = false;
            return;
        }
        
        return runLatestPollOnce()
            .then(() => {
                // Success - record the success time and schedule next poll
                lastLatestSuccessTime = Date.now();
                latestRunning = false;
                if (!isShuttingDown) {
                    scheduleLatestPoller();
                }
            })
            .catch((err) => {
                // Check if it's a "no changes" error that should be retried
                if (err.message?.includes('No changes detected')) {
                    retryCount++;
                    if (retryCount > maxRetries) {
                        console.log(`[orchestrator] latest FAILED: No changes after ${maxRetries} retries - giving up`);
                        latestRunning = false;
                        // Still schedule next poll (use fallback boundary)
                        if (!isShuttingDown) {
                            scheduleLatestPoller();
                        }
                        return;
                    }
                    
                    console.log(`[orchestrator] latest retry ${retryCount}/${maxRetries} (no changes detected, will retry in ${retryDelayMs/1000}s)`);
                    
                    if (isShuttingDown) {
                        latestRunning = false;
                        return;
                    }
                    
                    setTimeout(() => {
                        attemptPoll();
                    }, retryDelayMs);
                } else {
                    // Other error - log and reschedule
                    console.error(`[orchestrator] latest FAILED: ${err.message}`);
                    latestRunning = false;
                    if (!isShuttingDown) {
                        scheduleLatestPoller();
                    }
                }
            });
    }
    
    attemptPoll();
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

/**
 * Schedule and run 5-minute aggregation poller
 * Independent of latest phase, uses absolute UTC boundaries
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
    console.log(`[orchestrator] next 5m in ${delaySeconds}s ${delayMs}ms (at ${boundaryStr})`);
    
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
            console.log(`[orchestrator] ⏳ 5m waiting for latest to finish (priority queue)...`);
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
        console.log(`[orchestrator] 5m tick @ ${tickTimeStr}`);
        
        // Calculate the EXACT API timestamp we should fetch for this boundary
        // When we reach 15:10:00 boundary, API updates and returns data with timestamp 15:05:00
        // (API timestamp is the START of the 5-minute window, which is 5 minutes before the boundary)
        const intervalSeconds = 300; // 5 minutes
        
        // Use the boundary timestamp we just reached (not current time)
        const boundarySeconds = Math.floor(boundaryTimestamp / 1000);
        
        // API timestamp is START of window (5 minutes before the boundary)
        // e.g., if boundary is 15:10:00, API timestamp is 15:05:00
        const targetApiTimestamp = boundarySeconds - intervalSeconds; // e.g. 15:10:00 - 300s = 15:05:00
        const targetDateStr = new Date(targetApiTimestamp * 1000).toISOString();
        
        // DB timestamp is END of window (same as the boundary we reached)
        const targetDbTimestamp = boundarySeconds; // e.g. 15:10:00 (the boundary we just reached)
        const targetDbDateStr = new Date(targetDbTimestamp * 1000).toISOString();
        
        console.log(`[orchestrator] 5m attempting to fetch API timestamp ${targetApiTimestamp} (${targetDateStr}) → DB: ${targetDbTimestamp} (${targetDbDateStr})`);
        
        // Retry loop - keep retrying until we get the EXACT timestamp we want
        let retryCount = 0;
        const maxRetries = 12; // 12 retries * 10s = 2 minutes max wait
        const retryDelayMs = 10000; // 10 seconds between retries
        
        function attemptPoll() {
            if (isShuttingDown) {
                fiveMinuteRunning = false;
                return;
            }
            
            run5mPollOnce(targetApiTimestamp)
                .then(() => {
                    if (retryCount > 0) {
                        console.log(`[orchestrator] ✅ 5m succeeded after ${retryCount} retry${retryCount > 1 ? 'ies' : ''}`);
                    } else {
                        console.log(`[orchestrator] ✅ 5m succeeded on first attempt`);
                    }
                    
                    // Get the boundary we just reached (for boundary check)
                    const boundaryReached = boundaryTimestamp;
                    
                    // Chain: 5m → 1h → 6h → 24h → canonical → cleanup (sequential, staggered)
                    return run1hIfNeeded(boundaryReached)
                        .then(() => run6hIfNeeded(boundaryReached))
                        .then(() => run24hIfNeeded(boundaryReached))
                        .then(() => runCanonicalIfReady())
                        .then(() => runCleanupIfReady())
                        .then(() => {
                            fiveMinuteRunning = false;
                            if (!isShuttingDown) {
                                schedule5MinutePoller();
                            }
                        })
                        .catch((chainErr) => {
                            // Catch any errors in the chain to prevent process crash
                            console.error(`[orchestrator] ❌ Error in chain after 5m:`, chainErr.message);
                            fiveMinuteRunning = false;
                            if (!isShuttingDown) {
                                schedule5MinutePoller();
                            }
                        });
                })
                .catch((err) => {
                    // Keep retrying if wrong timestamp, 404, or empty data - we need the EXACT timestamp with actual data
                    retryCount++;
                    
                    if (retryCount > maxRetries) {
                        console.log(`[orchestrator] ❌ 5m FAILED after ${maxRetries} retries — giving up on this boundary`);
                        
                        // Still try to run other granularities even if 5m failed
                        const boundaryReached = boundaryTimestamp;
                        return run1hIfNeeded(boundaryReached)
                            .then(() => run6hIfNeeded(boundaryReached))
                            .then(() => run24hIfNeeded(boundaryReached))
                            .then(() => runCanonicalIfReady())
                            .then(() => runCleanupIfReady())
                            .then(() => {
                                fiveMinuteRunning = false;
                                if (!isShuttingDown) {
                                    schedule5MinutePoller();
                                }
                            })
                            .catch((chainErr) => {
                                // Catch any errors in the chain to prevent process crash
                                console.error(`[orchestrator] ❌ Error in chain after 5m failure:`, chainErr.message);
                                fiveMinuteRunning = false;
                                if (!isShuttingDown) {
                                    schedule5MinutePoller();
                                }
                            });
                    }
                    
                    console.log(`[orchestrator] 🔄 5m retry ${retryCount}/${maxRetries} in ${retryDelayMs/1000}s (waiting for ${targetApiTimestamp})`);
                    
                    if (isShuttingDown) {
                        fiveMinuteRunning = false;
                        return;
                    }
                    
                    setTimeout(() => {
                        if (isShuttingDown) {
                            fiveMinuteRunning = false;
                            return;
                        }
                        attemptPoll();
                    }, retryDelayMs);
                });
        }
        
        attemptPoll();
    }
}

/**
 * Start the orchestrator
 */
function startOrchestrator() {
    isShuttingDown = false;
    console.log("🚀 Starting boundary-based orchestrator");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ ENABLED:");
    console.log("   - poll-latest (60-second intervals, retries if no changes, success-time + 60s scheduling)");
    console.log("   - poll-5m (5-minute UTC boundaries, waits for latest if running)");
    console.log("   - poll-1h (1-hour UTC boundaries, chained after 5m, waits for latest)");
    console.log("   - poll-6h (6-hour UTC boundaries, chained after 1h, waits for latest)");
    console.log("   - poll-24h (24-hour UTC boundaries, chained after 6h, waits for latest)");
    console.log("   - update-canonical (chained after all granularities)");
    console.log("   - cleanup (chained after canonical)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 PRIORITY QUEUE: latest has priority over all granularities");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    // Start both loops
    scheduleLatestPoller();
    schedule5MinutePoller();
}

/**
 * Stop the orchestrator gracefully
 */
function stopOrchestrator() {
    console.log("\n[orchestrator] Shutting down gracefully...");
    isShuttingDown = true;
}

module.exports = { startOrchestrator, stopOrchestrator };
