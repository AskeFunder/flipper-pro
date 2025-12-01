const axios = require("axios");

const OSRS_WIKI_API_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";

// Analysis timing
const PRIMARY_INTERVAL = 60_000;  // 60 seconds
const RETRY_INTERVAL = 5_000;    // 5s
const MAX_RETRIES = 12;          // op til 1 minut ekstra retry

// State
const itemCache = new Map();
let lastSuccessfulUpdateTime = null;
let lastPrimaryPollTime = null;
let isRunning = true;

// Stats
const stats = {
  primaryHits: 0,
  retryHits: 0,
  totalRealUpdates: 0,
  totalPrimaryMisses: 0,
  retriesUsed: [],
};

function formatTime(ts = Date.now()) {
  const d = new Date(ts);
  return `[${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}]`;
}

/**
 * Calculate next minute boundary (:00)
 */
function getNextMinuteBoundary() {
  const now = Date.now();
  const currentSeconds = Math.floor(now / 1000);
  const currentSecondInMinute = currentSeconds % 60;
  
  // Calculate seconds until next minute boundary
  const secondsUntilNext = 60 - currentSecondInMinute;
  const nextBoundarySeconds = currentSeconds + secondsUntilNext;
  const nextBoundaryMs = nextBoundarySeconds * 1000;
  
  return nextBoundaryMs;
}

/**
 * Wait until it's time for next PRIMARY poll
 * - First poll: wait for next :00 boundary
 * - Subsequent polls: lastSuccessfulUpdateTime + 60s (or lastPrimaryPollTime + 60s if no successful update)
 */
async function waitForNextPrimaryPoll() {
  if (lastSuccessfulUpdateTime === null && lastPrimaryPollTime === null) {
    // First poll - wait for next :00 boundary
    const nextBoundary = getNextMinuteBoundary();
    const now = Date.now();
    const delay = Math.max(0, nextBoundary - now);
    
    if (delay > 0) {
      await sleep(delay);
    }
    return;
  }
  
  // Subsequent polls: 60s after last successful update, or last PRIMARY if no successful update
  const now = Date.now();
  const referenceTime = lastSuccessfulUpdateTime || lastPrimaryPollTime;
  const nextPrimaryTime = referenceTime + PRIMARY_INTERVAL;
  const delay = Math.max(0, nextPrimaryTime - now);
  
  if (delay > 0) {
    await sleep(delay);
  }
}

async function fetchLatestPrices() {
  const res = await axios.get(OSRS_WIKI_API_URL, {
    headers: { "User-Agent": "flipperpro-adaptive-analysis" },
    timeout: 10000,
  });
  // API returns { data: { [itemId]: { high, highTime, low, lowTime } } }
  return res.data.data || res.data;
}

function detectRealChange(latestData) {
  let changedCount = 0;

  for (const [itemIdStr, itemData] of Object.entries(latestData)) {
    const itemId = Number(itemIdStr);
    const { high, low } = itemData;

    if (high == null || low == null) continue;

    if (!itemCache.has(itemId)) {
      // First observation - initialize baseline
      itemCache.set(itemId, { lastHigh: high, lastLow: low });
      continue;
    }

    const cached = itemCache.get(itemId);

    // Compare BEFORE updating
    const highChanged = cached.lastHigh !== high;
    const lowChanged = cached.lastLow !== low;

    if (highChanged || lowChanged) {
      // Real price change!
      changedCount++;
      // Update cache AFTER comparison
      cached.lastHigh = high;
      cached.lastLow = low;
    }
  }

  return changedCount;
}

async function pollOnce() {
  try {
    const data = await fetchLatestPrices();
    
    if (!data || Object.keys(data).length === 0) {
      return { real: false, changed: 0, error: "No data received" };
    }
    
    const changed = detectRealChange(data);
    return { real: changed > 0, changed };
  } catch (err) {
    return { real: false, changed: 0, error: err.message };
  }
}

async function mainLoop() {
  console.log("🚀 Starting ADAPTIVE OSRS latest analysis (60s → 5s retry)");
  console.log("============================================================");
  
  // Initial baseline fetch
  console.log(`${formatTime()} 📊 Building initial baseline cache...`);
  const baselineResult = await pollOnce();
  if (baselineResult.error) {
    console.log(`${formatTime()} ❌ Baseline fetch failed: ${baselineResult.error}`);
  } else {
    console.log(`${formatTime()} ✅ Baseline cache initialized (${itemCache.size} items)`);
  }
  
  // Wait for first :00 boundary
  console.log(`${formatTime()} ⏳ Waiting for next minute boundary (:00) to start PRIMARY polls...`);
  await waitForNextPrimaryPoll();
  console.log(`${formatTime()} ✅ Reached minute boundary, starting PRIMARY polls\n`);

  while (isRunning) {
    // Wait until it's time for next PRIMARY poll (60s since last successful update)
    await waitForNextPrimaryPoll();
    
    // ---- PRIMARY POLL ----
    lastPrimaryPollTime = Date.now(); // Track PRIMARY time
    console.log(`${formatTime()} 🕐 PRIMARY POLL`);

    const primaryResult = await pollOnce();

    if (primaryResult.error) {
      console.log(`${formatTime()} ❌ PRIMARY POLL FAILED — ${primaryResult.error}`);
      // Continue to next cycle (60s from this PRIMARY time)
      continue;
    }

    if (primaryResult.real) {
      stats.primaryHits++;
      stats.totalRealUpdates += primaryResult.changed;
      lastSuccessfulUpdateTime = Date.now(); // Update on successful PRIMARY

      console.log(
        `${formatTime()} ✅ REAL UPDATE @ PRIMARY — ${primaryResult.changed} items changed`
      );
      
      // Continue to next cycle (60s from this successful update)
      continue;
    }

    // ---- RETRY PHASE ----
    stats.totalPrimaryMisses++;
    console.log(`${formatTime()} ⚠️ PRIMARY MISS — entering 5s retry loop`);

    let retryHit = false;

    for (let i = 1; i <= MAX_RETRIES; i++) {
      await sleep(RETRY_INTERVAL);

      console.log(`${formatTime()} 🔁 RETRY ${i}/${MAX_RETRIES}`);

      const retryResult = await pollOnce();

      if (retryResult.error) {
        console.log(`${formatTime()} ❌ RETRY ${i} FAILED — ${retryResult.error}`);
        continue;
      }

      if (retryResult.real) {
        stats.retryHits++;
        stats.retriesUsed.push(i);
        stats.totalRealUpdates += retryResult.changed;
        lastSuccessfulUpdateTime = Date.now(); // Update on successful RETRY

        console.log(
          `${formatTime()} ✅ REAL UPDATE @ RETRY ${i} — ${retryResult.changed} items changed`
        );

        retryHit = true;
        break;
      }
    }

    if (!retryHit) {
      console.log(
        `${formatTime()} ❌ NO REAL UPDATE AFTER ${MAX_RETRIES} RETRIES (DESYNC EVENT)`
      );
      // Even if all retries miss, next PRIMARY will be 60s from this PRIMARY time
    }
  }
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

process.on("SIGINT", () => {
  console.log("\n⚠️ Interrupted — printing analysis summary\n");
  isRunning = false;
  printSummary();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n⚠️ Terminated — printing analysis summary\n");
  isRunning = false;
  printSummary();
  process.exit(0);
});

function printSummary() {
  console.log("\n================ ANALYSIS SUMMARY ================");
  console.log(`Primary hits: ${stats.primaryHits}`);
  console.log(`Primary misses: ${stats.totalPrimaryMisses}`);
  console.log(`Retry hits: ${stats.retryHits}`);

  if (stats.retriesUsed.length > 0) {
    const avgRetry =
      stats.retriesUsed.reduce((a, b) => a + b, 0) / stats.retriesUsed.length;

    console.log(`Avg retry depth when needed: ${avgRetry.toFixed(2)} × 5s`);
    console.log(
      `Max retry depth observed: ${Math.max(...stats.retriesUsed)}`
    );
    console.log(`Retry numbers used: [${stats.retriesUsed.join(", ")}]`);
  } else {
    console.log(`No retries were needed (all updates hit on PRIMARY)`);
  }

  console.log(`Total real updates detected: ${stats.totalRealUpdates}`);
  console.log("==================================================");
}

mainLoop().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
