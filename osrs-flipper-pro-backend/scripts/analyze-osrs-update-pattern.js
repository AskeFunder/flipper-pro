// analyze-osrs-update-pattern.js
require("dotenv").config();
const fetch = require("node-fetch");

const API_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";
const POLL_INTERVAL = 1000; // Check every second to catch specific second marks
const DURATION = 10 * 60 * 1000; // 10 minutes
const POLL_SECONDS = [0, 5, 10, 15]; // Poll at :00, :05, :10, :15 every minute

let lastDataHash = null;
let lastTimestamp = null;
const updates = [];
const startTime = Date.now();

function hashData(data) {
    // Create a simple hash of the data to detect changes
    // We'll use a combination of timestamp and a sample of item prices
    const sample = Object.keys(data)
        .slice(0, 100) // Sample first 100 items
        .map(id => `${id}:${data[id].high || 0}:${data[id].low || 0}`)
        .join(',');
    return sample;
}

let lastPollSecond = null;

async function poll() {
    const now = new Date();
    const currentSecond = now.getUTCSeconds();
    
    // Only poll at specific second marks (0, 5, 10, 15)
    if (!POLL_SECONDS.includes(currentSecond) || lastPollSecond === currentSecond) {
        return; // Skip if not at a poll second or already polled this second
    }
    
    lastPollSecond = currentSecond;
    
    try {
        const res = await fetch(API_URL, {
            headers: {
                "User-Agent": "flipperpro-dev - @montemarto"
            }
        });

        if (!res.ok) {
            console.error(`[ERROR] HTTP ${res.status}`);
            return;
        }

        const json = await res.json();
        const currentTimestamp = json.timestamp || Math.floor(Date.now() / 1000);
        const dataHash = hashData(json.data || {});
        
        // Check if data changed
        const dataChanged = dataHash !== lastDataHash;
        const timestampChanged = currentTimestamp !== lastTimestamp;
        
        if (dataChanged || timestampChanged) {
            const updateInfo = {
                time: now.toISOString(),
                localTime: now.toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' }),
                timestamp: currentTimestamp,
                second: now.getUTCSeconds(),
                minute: now.getUTCMinutes(),
                hour: now.getUTCHours(),
                dataChanged: dataChanged,
                timestampChanged: timestampChanged,
                itemCount: Object.keys(json.data || {}).length
            };
            
            updates.push(updateInfo);
            
            console.log(`\n🔄 UPDATE DETECTED at ${updateInfo.localTime}`);
            console.log(`   UTC: ${now.toUTCString()}`);
            console.log(`   Timestamp: ${currentTimestamp}`);
            console.log(`   Time: ${String(updateInfo.hour).padStart(2, '0')}:${String(updateInfo.minute).padStart(2, '0')}:${String(updateInfo.second).padStart(2, '0')} UTC`);
            console.log(`   Data changed: ${dataChanged}, Timestamp changed: ${timestampChanged}`);
            console.log(`   Items: ${updateInfo.itemCount}`);
            
            lastDataHash = dataHash;
            lastTimestamp = currentTimestamp;
        } else {
            process.stdout.write('.');
        }
    } catch (err) {
        console.error(`\n[ERROR] ${err.message}`);
    }
}

function analyzePatterns() {
    console.log("\n\n" + "=".repeat(60));
    console.log("📊 UPDATE PATTERN ANALYSIS");
    console.log("=".repeat(60));
    
    if (updates.length === 0) {
        console.log("❌ No updates detected during monitoring period");
        return;
    }
    
    // Separate price updates from timestamp-only updates
    // IMPORTANT: Only price updates (dataChanged === true) are used for analysis
    const priceUpdates = updates.filter(u => u.dataChanged === true);
    const timestampOnlyUpdates = updates.filter(u => u.dataChanged === false && u.timestampChanged === true);
    
    console.log(`\nTotal updates detected: ${updates.length}`);
    console.log(`   📊 Price updates (DATA CHANGED - used for analysis): ${priceUpdates.length}`);
    console.log(`   🕐 Timestamp-only updates (IGNORED in analysis): ${timestampOnlyUpdates.length}`);
    console.log(`Monitoring duration: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
    
    if (priceUpdates.length > 0) {
        console.log(`Average time between PRICE updates (actual data changes): ${((Date.now() - startTime) / priceUpdates.length / 1000).toFixed(1)} seconds`);
    } else {
        console.log(`\n⚠️  WARNING: No price updates (data changes) detected!`);
        console.log(`   Only timestamp updates were found, which don't indicate actual price changes.`);
        console.log(`   All analysis below will be based on price updates only.`);
    }
    
    // Analyze by second (only price updates)
    const bySecond = {};
    priceUpdates.forEach(u => {
        const key = u.second;
        bySecond[key] = (bySecond[key] || 0) + 1;
    });
    
    if (Object.keys(bySecond).length > 0) {
        console.log("\n📈 Price updates by second (UTC):");
        const sortedSeconds = Object.entries(bySecond)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        sortedSeconds.forEach(([second, count]) => {
            console.log(`   Second ${String(second).padStart(2, '0')}: ${count} updates`);
        });
    }
    
    // Analyze by minute (only price updates)
    const byMinute = {};
    priceUpdates.forEach(u => {
        const key = u.minute;
        byMinute[key] = (byMinute[key] || 0) + 1;
    });
    
    if (Object.keys(byMinute).length > 0) {
        console.log("\n📈 Price updates by minute (UTC):");
        const sortedMinutes = Object.entries(byMinute)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        sortedMinutes.forEach(([minute, count]) => {
            console.log(`   Minute ${String(minute).padStart(2, '0')}: ${count} updates`);
        });
    }
    
    // Calculate intervals between PRICE updates only
    const intervals = [];
    for (let i = 1; i < priceUpdates.length; i++) {
        const prev = new Date(priceUpdates[i-1].time);
        const curr = new Date(priceUpdates[i].time);
        intervals.push((curr - prev) / 1000);
    }
    
    if (intervals.length > 0) {
        intervals.sort((a, b) => a - b);
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const min = intervals[0];
        const max = intervals[intervals.length - 1];
        const median = intervals[Math.floor(intervals.length / 2)];
        
        console.log("\n⏱️  Price update intervals (timestamp updates excluded):");
        console.log(`   Average: ${avg.toFixed(1)}s`);
        console.log(`   Min: ${min.toFixed(1)}s`);
        console.log(`   Max: ${max.toFixed(1)}s`);
        console.log(`   Median: ${median.toFixed(1)}s`);
        
        // Find most common interval
        const intervalRounded = intervals.map(i => Math.round(i / 5) * 5); // Round to nearest 5 seconds
        const intervalCounts = {};
        intervalRounded.forEach(i => {
            intervalCounts[i] = (intervalCounts[i] || 0) + 1;
        });
        const mostCommon = Object.entries(intervalCounts)
            .sort((a, b) => b[1] - a[1])[0];
        console.log(`   Most common interval: ~${mostCommon[0]}s (${mostCommon[1]} times)`);
    }
    
    // Show all updates
    console.log("\n📋 All updates detected:");
    console.log("-".repeat(60));
    updates.forEach((u, i) => {
        const timeStr = `${String(u.hour).padStart(2, '0')}:${String(u.minute).padStart(2, '0')}:${String(u.second).padStart(2, '0')}`;
        const type = u.dataChanged ? "💰 PRICE" : "🕐 TIMESTAMP";
        console.log(`${i + 1}. ${timeStr} UTC | ${type} | Timestamp: ${u.timestamp} | Items: ${u.itemCount}`);
    });
    
    // Recommendations (based on PRICE updates only)
    console.log("\n💡 RECOMMENDATIONS:");
    console.log("-".repeat(60));
    if (intervals.length > 0) {
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        if (avgInterval < 20) {
            console.log("   ⚠️  Price updates happen very frequently (<20s)");
            console.log("   → Consider polling every 15-20 seconds");
        } else if (avgInterval < 30) {
            console.log("   ✅ Price updates happen regularly (~20-30s)");
            console.log("   → Polling every 30 seconds should catch most updates");
        } else if (avgInterval < 60) {
            console.log("   ✅ Price updates happen every ~30-60s");
            console.log("   → Polling every 60 seconds should be sufficient");
        } else {
            console.log("   ℹ️  Price updates happen less frequently (>60s)");
            console.log("   → Polling every 60-120 seconds should be fine");
        }
    } else if (priceUpdates.length === 0) {
        console.log("   ⚠️  No price updates detected during monitoring period");
        console.log("   → Timestamp updates do not indicate actual price changes");
        console.log("   → Consider monitoring for a longer period to detect price updates");
    }
    
    // Check for patterns (only price updates)
    if (Object.keys(bySecond).length > 0) {
        const sortedSeconds = Object.entries(bySecond)
            .sort((a, b) => b[1] - a[1]);
        if (sortedSeconds.length > 0 && sortedSeconds[0][1] > priceUpdates.length * 0.3) {
            const commonSecond = sortedSeconds[0][0];
            console.log(`   📌 Price updates often happen at second ${commonSecond}`);
            console.log(`   → Consider polling at :${commonSecond} every minute`);
        }
    }
    
    // Analyze when price updates typically occur in the minute
    // NOTE: This analysis ONLY uses price updates (dataChanged === true), NOT timestamp updates
    console.log("\n⏰ ANALYZING PRICE UPDATE TIMING (DATA CHANGES ONLY):");
    console.log("-".repeat(60));
    
    if (priceUpdates.length > 0) {
        // Group by second in minute
        const updatesBySecond = {};
        priceUpdates.forEach(update => {
            const time = new Date(update.time);
            const second = time.getUTCSeconds();
            if (!updatesBySecond[second]) {
                updatesBySecond[second] = [];
            }
            updatesBySecond[second].push(update);
        });
        
        // Find most common seconds
        const sortedSeconds = Object.entries(updatesBySecond)
            .map(([second, updates]) => [parseInt(second), updates.length])
            .sort((a, b) => b[1] - a[1]);
        
        console.log(`\n📈 Price updates by second in minute:`);
        sortedSeconds.slice(0, 10).forEach(([second, count]) => {
            const percentage = (count / priceUpdates.length * 100).toFixed(1);
            console.log(`   Second :${String(second).padStart(2, '0')}: ${count} updates (${percentage}%)`);
        });
        
        // Find the earliest second where updates occur
        const earliestSecond = Math.min(...priceUpdates.map(u => new Date(u.time).getUTCSeconds()));
        const latestSecond = Math.max(...priceUpdates.map(u => new Date(u.time).getUTCSeconds()));
        
        console.log(`\n⏱️  Update timing range: :${String(earliestSecond).padStart(2, '0')} to :${String(latestSecond).padStart(2, '0')}`);
        
        // Test all polling times and find which catches updates earliest
        // NOTE: Only testing against PRICE UPDATES (data changes), not timestamp updates
        console.log("\n🧪 TESTING POLLING STRATEGIES FOR EARLIEST CATCH:");
        console.log("   (Testing against PRICE UPDATES only - data changes, not timestamps)");
        console.log("-".repeat(60));
        
        const testResults = [];
        for (const pollSecond of POLL_SECONDS) {
            const result = simulatePollingAtSecond(priceUpdates, pollSecond, false, true);
            if (result) {
                // Calculate average delay (how long after update do we catch it)
                const delays = [];
                priceUpdates.forEach(update => {
                    const updateTime = new Date(update.time);
                    const updateSecond = updateTime.getUTCSeconds();
                    const updateMinute = updateTime.getUTCMinutes();
                    
                    // Find next poll time after this update
                    let pollTime = new Date(updateTime);
                    pollTime.setUTCSeconds(pollSecond);
                    pollTime.setUTCMilliseconds(0);
                    
                    // If poll time is before update, move to next minute
                    if (pollTime <= updateTime) {
                        pollTime.setUTCMinutes(pollTime.getUTCMinutes() + 1);
                    }
                    
                    const delay = (pollTime - updateTime) / 1000; // Delay in seconds
                    delays.push(delay);
                });
                
                const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
                const maxDelay = Math.max(...delays);
                
                testResults.push({
                    ...result,
                    pollSecond,
                    avgDelay,
                    maxDelay
                });
            }
        }
        
        // Compare results - sort by coverage first, then by average delay
        if (testResults.length > 0) {
            testResults.sort((a, b) => {
                if (a.coverage !== b.coverage) {
                    return b.coverage - a.coverage; // Higher coverage first
                }
                return a.avgDelay - b.avgDelay; // Lower delay first
            });
            
            console.log(`\n📊 COMPARISON (coverage + earliest catch):`);
            console.log("-".repeat(60));
            testResults.forEach((result, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
                console.log(`${medal} Poll at :${String(result.pollSecond).padStart(2, '0')}: ${result.caught}/${result.total} caught (${result.coverage.toFixed(1)}%) | Avg delay: ${result.avgDelay.toFixed(1)}s | Max delay: ${result.maxDelay.toFixed(1)}s`);
            });
            
            const best = testResults[0];
            console.log(`\n✅ BEST STRATEGY: Poll at :${String(best.pollSecond).padStart(2, '0')} every minute`);
            console.log(`   Catches ${best.coverage.toFixed(1)}% of price updates`);
            console.log(`   Average delay: ${best.avgDelay.toFixed(1)} seconds after update`);
            console.log(`   Maximum delay: ${best.maxDelay.toFixed(1)} seconds after update`);
            
            if (best.coverage === 100) {
                console.log(`   🎯 Perfect! Catches all updates!`);
            }
        }
    }
}

/**
 * Simulate polling at a specific second every minute and check for missed updates
 * @param {Array} priceUpdates - Array of price update objects
 * @param {number} pollSecond - Second to poll at (0-59)
 * @param {boolean} interim - If true, show condensed output for periodic updates
 * @param {boolean} returnResults - If true, return results object instead of logging
 * @returns {Object|null} Results object if returnResults is true, null otherwise
 */
function simulatePollingAtSecond(priceUpdates, pollSecond, interim = false, returnResults = false) {
    if (priceUpdates.length === 0) {
        if (!returnResults) {
            console.log(`   ⚠️  No price updates to analyze`);
        }
        return null;
    }
    
    // Group updates by minute
    const updatesByMinute = {};
    priceUpdates.forEach(update => {
        const time = new Date(update.time);
        const minuteKey = `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}`;
        if (!updatesByMinute[minuteKey]) {
            updatesByMinute[minuteKey] = [];
        }
        updatesByMinute[minuteKey].push(update);
    });
    
    // Simulate polling at :10 every minute
    const pollTimes = [];
    const startTime = new Date(priceUpdates[0].time);
    const endTime = new Date(priceUpdates[priceUpdates.length - 1].time);
    
    // Generate all poll times at :10 for each minute in the range
    let currentMinute = new Date(startTime);
    currentMinute.setUTCSeconds(pollSecond);
    currentMinute.setUTCMilliseconds(0);
    
    // If the first update is before :10, start from the previous minute's :10
    if (startTime.getUTCSeconds() < pollSecond) {
        currentMinute.setUTCMinutes(currentMinute.getUTCMinutes() - 1);
    }
    
    while (currentMinute <= endTime) {
        pollTimes.push(new Date(currentMinute));
        currentMinute = new Date(currentMinute);
        currentMinute.setUTCMinutes(currentMinute.getUTCMinutes() + 1);
    }
    
    // Check which updates would be caught and which would be missed
    const caughtUpdates = [];
    const missedUpdates = [];
    
    priceUpdates.forEach(update => {
        const updateTime = new Date(update.time);
        let caught = false;
        
        // Check if this update would be caught by any poll
        for (let i = 0; i < pollTimes.length; i++) {
            const pollTime = pollTimes[i];
            const nextPollTime = pollTimes[i + 1] || new Date(pollTime.getTime() + 60000); // Next minute if no more polls
            
            // Update is caught if it happens after this poll and before the next poll
            if (updateTime >= pollTime && updateTime < nextPollTime) {
                caught = true;
                break;
            }
        }
        
        if (caught) {
            caughtUpdates.push(update);
        } else {
            missedUpdates.push(update);
        }
    });
    
    // Calculate coverage
    const coverage = (caughtUpdates.length / priceUpdates.length) * 100;
    
    // If returnResults is true, return early with results
    if (returnResults) {
        return {
            pollSecond,
            total: priceUpdates.length,
            caught: caughtUpdates.length,
            missed: missedUpdates.length,
            coverage: coverage,
            pollTimes: pollTimes.length
        };
    }
    
    if (!interim) {
        console.log(`\n   Polling strategy: At :${String(pollSecond).padStart(2, '0')} every minute`);
        console.log(`   Total polls simulated: ${pollTimes.length}`);
    }
    console.log(`   Price updates detected: ${priceUpdates.length}`);
    console.log(`   Updates CAUGHT: ${caughtUpdates.length} (${coverage.toFixed(1)}%)`);
    console.log(`   Updates MISSED: ${missedUpdates.length} (${(100 - coverage).toFixed(1)}%)`);
    
    if (missedUpdates.length > 0) {
        if (!interim) {
            console.log(`\n   ⚠️  MISSED UPDATES:`);
            missedUpdates.forEach((update, i) => {
                const time = new Date(update.time);
                const timeStr = `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}:${String(time.getUTCSeconds()).padStart(2, '0')}`;
                console.log(`      ${i + 1}. ${timeStr} UTC`);
            });
        } else {
            console.log(`   ⚠️  ${missedUpdates.length} update(s) would be missed`);
        }
    } else {
        console.log(`   ✅ All price updates would be caught!`);
    }
    
    // Show polling schedule (only in full mode, and only if not too many)
    if (!interim && pollTimes.length <= 20 && !returnResults) {
        console.log(`\n   📅 Polling schedule:`);
        pollTimes.forEach((pollTime, i) => {
            const timeStr = `${String(pollTime.getUTCHours()).padStart(2, '0')}:${String(pollTime.getUTCMinutes()).padStart(2, '0')}:${String(pollTime.getUTCSeconds()).padStart(2, '0')}`;
            const updatesInWindow = priceUpdates.filter(u => {
                const uTime = new Date(u.time);
                const nextPoll = pollTimes[i + 1] || new Date(pollTime.getTime() + 60000);
                return uTime >= pollTime && uTime < nextPoll;
            });
            const count = updatesInWindow.length;
            const marker = count > 0 ? '💰' : '⚪';
            console.log(`      ${marker} ${timeStr} UTC (${count} update${count !== 1 ? 's' : ''})`);
        });
    }
    
    return null;
}

// Start polling
console.log("🔍 Starting OSRS Latest API Update Pattern Analysis");
console.log(`   Monitoring at :${POLL_SECONDS.join(', :')} every minute for ${DURATION / 1000 / 60} minutes`);
console.log(`   (This detects updates at specific times - we'll simulate polling at :10 every minute at the end)`);
console.log(`   API: ${API_URL}`);
console.log("\nMonitoring... ('.' = no change, '🔄' = update detected)\n");

const interval = setInterval(poll, POLL_INTERVAL);
poll(); // Initial poll

// Show periodic simulation updates every 2 minutes
let lastSimulationTime = Date.now();
const SIMULATION_UPDATE_INTERVAL = 2 * 60 * 1000; // 2 minutes

function showPeriodicSimulation() {
    const priceUpdates = updates.filter(u => u.dataChanged === true);
    if (priceUpdates.length > 0) {
        console.log(`\n📊 [INTERIM] Simulating polling at :10 every minute (so far):`);
        simulatePollingAtSecond(priceUpdates, 10, true); // true = interim mode
    }
}

const simulationInterval = setInterval(() => {
    if (Date.now() - lastSimulationTime >= SIMULATION_UPDATE_INTERVAL) {
        showPeriodicSimulation();
        lastSimulationTime = Date.now();
    }
}, 30000); // Check every 30 seconds

// Stop after duration
setTimeout(() => {
    clearInterval(interval);
    clearInterval(simulationInterval);
    console.log("\n\n⏹️  Monitoring complete. Analyzing patterns...");
    analyzePatterns();
    process.exit(0);
}, DURATION);

// Handle Ctrl+C
process.on('SIGINT', () => {
    clearInterval(interval);
    clearInterval(simulationInterval);
    console.log("\n\n⏹️  Monitoring stopped by user. Analyzing patterns...");
    analyzePatterns();
    process.exit(0);
});

