# Scheduler Execution Audit - Production System

**Date:** 2025-11-29  
**System:** OSRS Flipper Pro Backend Scheduler  
**Mode:** PRODUCTION

---

## Executive Summary

The scheduler runs on a **1-second tick interval** (`setInterval(tick, 1000)`) and executes jobs based on **wall-clock time alignment**. All jobs run **independently** with **no explicit dependencies** between them. The system uses **in-memory locks** and **file-based locks** to prevent duplicate executions, but there are **no guarantees** that canonical updates wait for granularity data to be available.

---

## 1. How `latest` is Triggered

### Trigger Mechanism
- **Timer:** `setInterval(tick, 1000)` - checks every 1 second
- **Condition:** `seconds % 15 === 0 && lastLatestPollSecond !== seconds`
- **Alignment:** **Clock-aligned** to wall-clock time (runs at :00, :15, :30, :45 seconds)

### Execution Details
```javascript
// Line 128-142 in scheduler.js
if (seconds % 15 === 0 && lastLatestPollSecond !== seconds) {
    if (pollLatestRunning) {
        // BLOCKED - previous execution still running
    } else {
        lastLatestPollSecond = seconds;
        pollLatestRunning = true; // In-memory lock
        run("node poller/poll-latest.js", "POLL LATEST", () => {
            pollLatestRunning = false; // Release lock
            checkCanonicalUpdate(); // Trigger canonical after completion
        });
    }
}
```

### Overlap Prevention
- **In-memory lock:** `pollLatestRunning` boolean flag
- **Behavior if overlap:** New execution is **BLOCKED** and logged as "blocked"
- **No retry mechanism:** If blocked, it simply skips and waits for next 15-second window

### Key Characteristics
- ✅ Clock-aligned (runs at exact :00, :15, :30, :45)
- ✅ Prevents overlap via in-memory lock
- ⚠️ If job hangs > 15 seconds, next execution is blocked (no timeout)
- ⚠️ No automatic retry on failure
- ✅ Triggers canonical update immediately after completion

---

## 2. How Granular Pollers are Triggered

### 2.1 5m Poller

**Trigger:**
```javascript
// Line 156-163
if (minutes % 5 === 0 && seconds === 30 && pollKey !== lastPollTimestamp) {
    lastPollTimestamp = pollKey;
    run("node poller/poll-granularities.js 5m", "POLL 5m");
    setTimeout(() => {
        run("node poller/cleanup-timeseries.js", "CLEANUP 5m");
    }, 2000);
}
```

- **Alignment:** Clock-aligned to **:XX:30** when minutes are divisible by 5 (e.g., 10:00:30, 10:05:30, 10:10:30)
- **Overlap Prevention:** Uses `lastPollTimestamp` to prevent duplicate triggers in same second
- **Cleanup:** Runs cleanup 2 seconds after poll starts (not after completion)

**What happens if:**
- **Still executing when next tick fires:** New execution **WILL START** (no lock check)
- **Server restarts mid-cycle:** Job is lost, no recovery mechanism

### 2.2 1h Poller

**Trigger:**
```javascript
// Line 166-173
if (minutes === 0 && seconds === 30 && hours !== lastBackfill_1h) {
    lastBackfill_1h = hours;
    run("node poller/poll-granularities.js 1h", "POLL 1h");
    setTimeout(() => {
        run("node poller/cleanup-timeseries.js", "CLEANUP 1h");
    }, 2000);
}
```

- **Alignment:** Clock-aligned to **:00:30** every hour (e.g., 10:00:30, 11:00:30)
- **Overlap Prevention:** Uses `lastBackfill_1h` to prevent duplicate triggers in same hour
- **Cleanup:** Runs cleanup 2 seconds after poll starts

**What happens if:**
- **Still executing when next tick fires:** Protected by hour check, but if job takes > 1 hour, could overlap
- **Server restarts mid-cycle:** Job is lost, no recovery

### 2.3 6h Poller

**Trigger:**
```javascript
// Line 176-183
if (hours % 6 === 0 && minutes === 0 && seconds === 30 && hours !== lastBackfill_6h) {
    lastBackfill_6h = hours;
    run("node poller/poll-granularities.js 6h", "POLL 6h");
    setTimeout(() => {
        run("node poller/cleanup-timeseries.js", "CLEANUP 6h");
    }, 2000);
}
```

- **Alignment:** Clock-aligned to **:00:30** at 00:00, 06:00, 12:00, 18:00
- **Overlap Prevention:** Uses `lastBackfill_6h` to prevent duplicate triggers
- **Cleanup:** Runs cleanup 2 seconds after poll starts

**What happens if:**
- **Still executing when next tick fires:** Protected by 6-hour check
- **Server restarts mid-cycle:** Job is lost, no recovery

### 2.4 24h Poller

**Trigger:**
```javascript
// Line 186-193
if (hours === 2 && minutes === 0 && seconds === 30 && today !== lastBackfill_24h) {
    lastBackfill_24h = today;
    run("node poller/poll-granularities.js 24h", "POLL 24h");
    setTimeout(() => {
        run("node poller/cleanup-timeseries.js", "CLEANUP 24h");
    }, 2000);
}
```

- **Alignment:** Clock-aligned to **02:00:30** daily
- **Overlap Prevention:** Uses `lastBackfill_24h` (date-based) to prevent duplicate triggers
- **Cleanup:** Runs cleanup 2 seconds after poll starts

**What happens if:**
- **Still executing when next tick fires:** Protected by date check
- **Server restarts mid-cycle:** Job is lost, no recovery

### Granular Poller Common Characteristics

**Lock Mechanism:**
- **File-based lock check:** `isBackfillRunning(gran)` in `poll-granularities.js` (line 24)
- **Lock type:** Checks for backfill lock files (not poll locks)
- **Behavior:** If backfill is running, poll is **skipped** (line 26)

**Critical Issues:**
- ❌ **No in-memory lock** in scheduler for granular polls
- ❌ **No timeout mechanism** - if job hangs, it blocks indefinitely
- ❌ **Cleanup runs 2 seconds after START**, not after completion
- ⚠️ **Overlap possible** if job takes longer than interval (especially 5m)

---

## 3. How `update-canonical` is Triggered

### Trigger Mechanisms (TWO Independent Paths)

#### Path 1: After `latest` Completion
```javascript
// Line 140 in scheduler.js
run("node poller/poll-latest.js", "POLL LATEST", () => {
    pollLatestRunning = false;
    checkCanonicalUpdate(); // IMMEDIATE trigger after latest
});
```

#### Path 2: Periodic Check (Every Second)
```javascript
// Line 147 in scheduler.js
checkCanonicalUpdate(); // Called every tick (every second)
```

### Frequency Logic
```javascript
// Line 62-72
function getCanonicalFrequency(dirtyCount) {
    if (dirtyCount === 0) return 60;      // Every 60s
    else if (dirtyCount <= 200) return 30; // Every 30s
    else if (dirtyCount <= 1000) return 15; // Every 15s
    else return 30; // Every 30s (prevents overload)
}
```

### Execution Check
```javascript
// Line 77-116
async function checkCanonicalUpdate() {
    // Lock check (in-memory + file-based)
    if (canonicalUpdateRunning || isBackfillRunning("canonical")) {
        return; // BLOCKED
    }
    
    const dirtyCount = await db.query("SELECT COUNT(*) FROM dirty_items");
    const frequency = getCanonicalFrequency(dirtyCount);
    const timeSinceLastUpdate = (now - lastCanonicalUpdateTime) / 1000;
    
    if (timeSinceLastUpdate >= frequency) {
        canonicalUpdateRunning = true; // Lock
        run("node poller/update-canonical-items.js", "UPDATE CANONICAL", () => {
            canonicalUpdateRunning = false; // Release
        });
    }
}
```

### Key Characteristics
- ✅ **Timer-based** (dynamic frequency based on dirty queue)
- ✅ **Independent** of granular jobs (no explicit wait)
- ⚠️ **Can run BEFORE granularities finish** (no dependency check)
- ✅ **Dual lock mechanism:** In-memory (`canonicalUpdateRunning`) + file-based (`isBackfillRunning("canonical")`)
- ✅ **Prevents overlap** via locks

---

## 4. Dependency Analysis

### CRITICAL FINDING: **NO EXPLICIT DEPENDENCIES**

The scheduler has **ZERO explicit dependencies** between jobs:

| Job | Waits for | Dependency Type |
|-----|-----------|----------------|
| `latest` | ❌ Nothing | Independent |
| `5m` | ❌ Nothing | Independent |
| `1h` | ❌ Nothing | Independent |
| `6h` | ❌ Nothing | Independent |
| `24h` | ❌ Nothing | Independent |
| `canonical` | ❌ Nothing | Independent (only triggered after latest, but doesn't wait) |

### Canonical Update Behavior

**What canonical ACTUALLY does:**
1. Reads from `dirty_items` table (items marked dirty by `latest` or other sources)
2. Calculates trends by querying granularity tables (`price_5m`, `price_1h`, etc.)
3. **Does NOT check** if granularity data exists before calculating
4. **Does NOT wait** for granularity polls to complete

**Implications:**
- ⚠️ Canonical can calculate trends using **stale data** if granularity poll hasn't run yet
- ⚠️ Canonical can run **immediately after latest** (line 140), potentially before 5m poll completes
- ⚠️ If 5m poll fails or is delayed, canonical still runs with old data
- ⚠️ No guarantee that canonical sees the latest granularity data

### Example Race Condition Scenario

```
Time 10:00:30 - 5m poll starts (takes 30 seconds)
Time 10:00:45 - latest runs, marks items dirty
Time 10:00:45 - canonical triggered immediately (after latest)
Time 10:00:45 - canonical reads price_5m table (5m poll still running!)
Time 10:01:00 - 5m poll completes, writes new data
Result: Canonical used OLD 5m data, new data ignored until next canonical run
```

---

## 5. Concurrency & Race Safety

### Lock Mechanisms

#### In-Memory Locks (scheduler.js)
- `pollLatestRunning` - prevents latest overlap
- `canonicalUpdateRunning` - prevents canonical overlap
- **Scope:** Single scheduler process only
- **Limitation:** Lost on process restart

#### File-Based Locks (lock-utils.js)
- Used by: `update-canonical-items.js`, `poll-granularities.js`
- **Location:** `.locks/backfill-{granularity}.lock`
- **Mechanism:** PID-based, checks if process still running
- **Cleanup:** Auto-removes stale locks (process doesn't exist)

### Overlap Scenarios

| Job Pair | Can Overlap? | Protection |
|----------|--------------|------------|
| `latest` + `latest` | ❌ No | In-memory lock |
| `canonical` + `canonical` | ❌ No | In-memory + file lock |
| `5m` + `5m` | ⚠️ **YES** | Only timestamp check (same second) |
| `latest` + `canonical` | ✅ Yes | Independent, canonical triggered after latest |
| `5m` + `canonical` | ✅ Yes | No dependency, canonical can read during write |
| `5m` + `latest` | ✅ Yes | Independent |

### Race Conditions

#### 1. Canonical Reads During Granularity Write
- **Risk:** HIGH
- **Scenario:** Canonical queries `price_5m` while 5m poll is inserting
- **PostgreSQL behavior:** Reads see committed data, but transaction isolation may show partial data
- **Impact:** Canonical may see incomplete or inconsistent data

#### 2. Multiple Granularity Polls Overlap
- **Risk:** MEDIUM
- **Scenario:** 5m poll takes > 5 minutes, next 5m poll starts
- **Protection:** Only timestamp check (`pollKey !== lastPollTimestamp`)
- **Impact:** Two 5m polls writing to same table simultaneously

#### 3. Canonical Runs Before Granularity Completes
- **Risk:** HIGH
- **Scenario:** Latest triggers canonical, but 5m poll still running
- **Impact:** Canonical uses stale data, misses new granularity data

---

## 6. Failure Behavior

### Job Failure Handling

#### `latest` Failure
```javascript
// poll-latest.js line 325-328
catch (err) {
    await db.query("ROLLBACK");
    console.error("[LATEST] Error during DB transaction:", err.message);
    process.exit(1); // EXITS
}
```
- **Behavior:** Transaction rolled back, process exits
- **Retry:** ❌ No automatic retry
- **Next execution:** Waits for next 15-second window
- **Data impact:** No data written, items not marked dirty

#### Granularity Poll Failure
```javascript
// poll-granularities.js line 95-98
catch (err) {
    await db.query("ROLLBACK");
    console.error(`❌ [${gran}] poll error:`, err.stack || err);
    process.exit(1); // EXITS
}
```
- **Behavior:** Transaction rolled back, process exits
- **Retry:** ❌ No automatic retry
- **Next execution:** Waits for next scheduled time
- **Data impact:** No data written, gap in granularity data

#### Canonical Update Failure
```javascript
// update-canonical-items.js line 2456-2458
catch (err) {
    console.error("[CANONICAL] Error updating canonical items:", err);
    throw err; // Propagates to scheduler
}
```
- **Behavior:** Error logged, lock released in `finally` block
- **Retry:** ❌ No automatic retry
- **Next execution:** Waits for next frequency check
- **Data impact:** Items remain in `dirty_items`, trends not updated

### Hanging Jobs

#### No Timeout Mechanism
- **Issue:** If a job hangs (network timeout, DB deadlock, etc.), it blocks indefinitely
- **Impact:**
  - `latest`: Blocks next execution (in-memory lock)
  - `canonical`: Blocks next execution (in-memory + file lock)
  - `5m/1h/6h/24h`: No lock, but cleanup runs 2 seconds after start (not completion)

#### DB Disconnect Mid-Job
- **Behavior:** Process likely crashes or hangs
- **Recovery:** No automatic recovery, requires manual intervention
- **Lock cleanup:** File locks auto-removed if process dies (PID check)

### System Behavior Summary

| Failure Type | Retry? | Skip? | Continue? | Manual Intervention? |
|--------------|--------|-------|-----------|----------------------|
| `latest` fails | ❌ | ✅ | ✅ | No (waits for next window) |
| `5m` fails | ❌ | ✅ | ✅ | No (waits for next window) |
| `canonical` fails | ❌ | ✅ | ✅ | No (waits for next check) |
| Job hangs | ❌ | ❌ | ❌ | **YES** (blocks system) |
| DB disconnect | ❌ | ❌ | ❌ | **YES** (process crashes) |

---

## 7. Execution Timeline Diagram

```
WALL CLOCK TIME ALIGNMENT
==========================

Every Second (tick):
├─ Check: seconds % 15 === 0?
│  └─ YES → Run latest (if not running)
│     └─ On completion → Trigger canonical check
│
├─ Check: minutes % 5 === 0 && seconds === 30?
│  └─ YES → Run 5m poll (if not backfill running)
│     └─ After 2s → Run cleanup
│
├─ Check: minutes === 0 && seconds === 30?
│  └─ YES → Run 1h poll (if not backfill running)
│     └─ After 2s → Run cleanup
│
├─ Check: hours % 6 === 0 && minutes === 0 && seconds === 30?
│  └─ YES → Run 6h poll (if not backfill running)
│     └─ After 2s → Run cleanup
│
├─ Check: hours === 2 && minutes === 0 && seconds === 30?
│  └─ YES → Run 24h poll (if not backfill running)
│     └─ After 2s → Run cleanup
│
└─ ALWAYS → Check canonical update (every second)
   └─ If timeSinceLastUpdate >= frequency → Run canonical (if not running)


EXAMPLE TIMELINE (10:00:00 - 10:01:00)
=======================================

10:00:00 - latest runs (15s aligned)
10:00:00 - canonical check (dirtyCount=0, frequency=60s, skip)
10:00:15 - latest runs (15s aligned)
10:00:15 - canonical triggered (after latest, dirtyCount=500, frequency=15s)
10:00:30 - 5m poll starts (clock-aligned :30)
10:00:30 - cleanup scheduled (2s delay)
10:00:32 - cleanup runs (5m poll may still be running!)
10:00:30 - latest runs (15s aligned)
10:00:30 - canonical check (lastUpdate=15s ago, frequency=15s, runs)
10:00:45 - latest runs (15s aligned)
10:00:45 - canonical triggered (after latest)
10:01:00 - latest runs (15s aligned)
10:01:00 - canonical check (lastUpdate=15s ago, runs)


RACE CONDITION EXAMPLE
=======================

10:00:30:00 - 5m poll starts (takes 45 seconds)
10:00:30:15 - latest completes, triggers canonical
10:00:30:15 - canonical starts, queries price_5m (5m poll still writing!)
10:00:30:45 - 5m poll completes
10:00:30:45 - canonical still running, using data from before 5m poll completed
Result: Canonical trends based on OLD 5m data, new data ignored
```

---

## 8. Architectural Risks

### Critical Risks

#### 1. **No Dependency Management**
- **Risk:** Canonical can run before granularity data is available
- **Impact:** Stale or incorrect trend calculations
- **Severity:** HIGH
- **Frequency:** Common (happens every 15 seconds when latest triggers canonical)

#### 2. **No Timeout Mechanism**
- **Risk:** Hanging jobs block system indefinitely
- **Impact:** System deadlock, requires manual intervention
- **Severity:** HIGH
- **Frequency:** Rare but catastrophic

#### 3. **Granularity Poll Overlap**
- **Risk:** 5m poll can overlap if execution takes > 5 minutes
- **Impact:** Concurrent writes to same table, potential data corruption
- **Severity:** MEDIUM
- **Frequency:** Rare (only if 5m poll is very slow)

#### 4. **Cleanup Runs During Active Poll**
- **Risk:** Cleanup runs 2 seconds after poll START, not completion
- **Impact:** Cleanup may delete data that poll is still writing
- **Severity:** MEDIUM
- **Frequency:** Common (every granularity poll)

#### 5. **No Retry Mechanism**
- **Risk:** Transient failures cause permanent data gaps
- **Impact:** Missing data, stale trends
- **Severity:** MEDIUM
- **Frequency:** Occasional (network issues, DB timeouts)

#### 6. **In-Memory Locks Lost on Restart**
- **Risk:** Process restart loses lock state
- **Impact:** Potential duplicate executions immediately after restart
- **Severity:** LOW
- **Mitigation:** File-based locks provide some protection

### Medium Risks

#### 7. **Canonical Reads During Write**
- **Risk:** PostgreSQL transaction isolation, but still possible to see partial data
- **Impact:** Inconsistent trend calculations
- **Severity:** MEDIUM
- **Frequency:** Common

#### 8. **No Health Monitoring**
- **Risk:** System can fail silently
- **Impact:** Data gaps go unnoticed
- **Severity:** MEDIUM
- **Frequency:** N/A (monitoring not implemented)

### Low Risks

#### 9. **Clock Drift**
- **Risk:** System clock changes affect alignment
- **Impact:** Jobs run at wrong times
- **Severity:** LOW
- **Frequency:** Rare

#### 10. **PM2 Restart Behavior**
- **Risk:** PM2 restart may interrupt jobs mid-execution
- **Impact:** Partial data writes, locks not cleaned
- **Severity:** LOW
- **Mitigation:** File locks auto-cleanup on process death

---

## 9. Recommendations (For Future Consideration)

### Immediate Fixes
1. **Add timeout mechanism** to all jobs (prevent infinite hangs)
2. **Fix cleanup timing** - run after poll completion, not start
3. **Add explicit dependencies** - canonical should wait for granularity completion
4. **Add retry mechanism** for transient failures

### Medium-Term Improvements
5. **Implement job queue** with proper dependency management
6. **Add health monitoring** and alerting
7. **Implement graceful shutdown** for in-flight jobs
8. **Add data validation** to detect gaps and inconsistencies

### Long-Term Architecture
9. **Consider job scheduler library** (node-cron, bull, etc.)
10. **Implement distributed locking** for multi-instance deployments
11. **Add comprehensive logging** and metrics
12. **Implement circuit breakers** for external dependencies

---

## Conclusion

The current scheduler is **functional but fragile**. It relies on **timing and luck** rather than **explicit dependencies and guarantees**. The system works in normal conditions but has **multiple race conditions** and **no failure recovery mechanisms**. 

**Key Takeaway:** All jobs run **independently on blind timers** with **no explicit dependencies**. Canonical updates can and do run before granularity data is available, leading to potential data inconsistencies.

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-29  
**Audited By:** Code Analysis



