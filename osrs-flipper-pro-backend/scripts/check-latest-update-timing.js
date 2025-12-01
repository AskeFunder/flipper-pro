// scripts/check-latest-update-timing.js
const fetch = require("node-fetch");

const ENDPOINT = "https://prices.runescape.wiki/api/v1/osrs/latest";

const CHECK_STEP_SECONDS = 10;     // vi vil ramme :00, :05, :10, ...
const DURATION_MINUTES = 120;

let lastSnapshot = null;
let checkCount = 0;
let totalUpdates = 0;

const secondStats = {};       // f.eks. { "00": 11462, "05": 12, ... }
const itemUpdateCounts = {};  // f.eks. { "8782": 16, ... }

const startTime = Date.now();
const endTime = startTime + DURATION_MINUTES * 60 * 1000;

function getSecondKey(date = new Date()) {
  const sec = date.getSeconds();
  return String(sec).padStart(2, "0");
}

async function fetchLatest() {
  const res = await fetch(ENDPOINT);
  if (!res.ok) {
    throw new Error(`Failed to fetch latest: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
}

function diffSnapshots(prev, curr) {
  let updates = 0;

  for (const itemId in curr) {
    const prevItem = prev?.[itemId];
    const currItem = curr[itemId];

    if (!prevItem) {
      // nyt item – tæller som 2 ændringer (high + low)
      updates += 2;
      itemUpdateCounts[itemId] = (itemUpdateCounts[itemId] || 0) + 2;
      continue;
    }

    if (prevItem.high !== currItem.high) {
      updates++;
      itemUpdateCounts[itemId] = (itemUpdateCounts[itemId] || 0) + 1;
    }

    if (prevItem.low !== currItem.low) {
      updates++;
      itemUpdateCounts[itemId] = (itemUpdateCounts[itemId] || 0) + 1;
    }
  }

  return updates;
}

// Beregn delay, så næste tick lander så tæt som muligt på :00/:05/:10 etc.
function scheduleNextTick() {
  const now = new Date();
  const ms = now.getMilliseconds();
  const sec = now.getSeconds();

  // Hvor mange sekunder til næste sekund der er deleligt med 5?
  // Eksempler:
  //  sec = 02 → remainder 2 → delta = 3 (→ 05)
  //  sec = 05 → remainder 0 → delta = 5 (→ 10)
  const remainder = sec % CHECK_STEP_SECONDS;
  const deltaSec = remainder === 0 ? CHECK_STEP_SECONDS : (CHECK_STEP_SECONDS - remainder);

  const delay = deltaSec * 1000 - ms; // justér også for millisekunderne

  setTimeout(tick, delay);
}

async function tick() {
  const now = new Date();
  const timeLabel = now.toISOString().slice(11, 19); // HH:MM:SS

  try {
    const data = await fetchLatest();

    let updates = 0;
    if (lastSnapshot) {
      updates = diffSnapshots(lastSnapshot, data);
    }

    lastSnapshot = data;
    totalUpdates += updates;

    const secondKey = getSecondKey(now);
    secondStats[secondKey] = (secondStats[secondKey] || 0) + updates;

    console.log(`[${timeLabel}] ✅ ${updates} update(s) detected`);

    checkCount++;

    if (Date.now() >= endTime) {
      printReport();
      process.exit(0);
    } else {
      scheduleNextTick();
    }
  } catch (err) {
    console.error(`[${timeLabel}] ❌ Error:`, err.message);
    // selv ved fejl fortsætter vi til næste aligned tick
    if (Date.now() >= endTime) {
      printReport();
      process.exit(1);
    } else {
      scheduleNextTick();
    }
  }
}

function printReport() {
  console.log("\n=======================================");
  console.log("📊 UPDATE TIMING REPORT");
  console.log("=======================================\n");

  console.log(`Duration: ~${DURATION_MINUTES} minutes`);
  console.log(`Total checks: ${checkCount}`);
  console.log(`Total updates: ${totalUpdates}\n`);

  console.log("---------------------------------------");
  console.log("📈 UPDATES BY SECOND (within minute)");
  console.log("---------------------------------------");

  const entries = Object.entries(secondStats).sort((a, b) => Number(a[0]) - Number(b[0]));

  entries.forEach(([sec, count]) => {
    const pct = totalUpdates > 0 ? ((count / totalUpdates) * 100).toFixed(2) : "0.00";
    console.log(`  :${sec} → ${count} updates (${pct}%)`);
  });

  console.log("\n---------------------------------------");
  console.log("🏆 TOP 10 ITEMS BY UPDATE COUNT");
  console.log("---------------------------------------");
  const topItems = Object.entries(itemUpdateCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  topItems.forEach(([itemId, count], idx) => {
    console.log(`  ${idx + 1}. Item ${itemId}: ${count} updates`);
  });

  console.log("\n✅ Done.\n");
}

console.log("🚀 Starting OSRS polling precision test...");
console.log(`Duration: ${DURATION_MINUTES} minutes`);
console.log(`Checking aligned every ${CHECK_STEP_SECONDS} seconds (00, 05, 10, ...)...\n`);

// Første gang: vent til næste 00/05/10/...
scheduleNextTick();
