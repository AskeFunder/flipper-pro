#!/usr/bin/env node

/**
 * Analyze process logs to identify bottlenecks and performance issues
 */

const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "..", "logs", "process-execution.log.json");

if (!fs.existsSync(LOG_FILE)) {
    console.error("❌ Log file not found:", LOG_FILE);
    process.exit(1);
}

const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n");
const entries = lines
    .map(line => {
        try {
            return JSON.parse(line);
        } catch (e) {
            return null;
        }
    })
    .filter(entry => entry);

console.log("🔍 Process Performance Analysis");
console.log("=" .repeat(60));
console.log(`Total log entries: ${entries.length}\n`);

// Group by process
const byProcess = {};
entries.forEach(entry => {
    if (!byProcess[entry.process]) {
        byProcess[entry.process] = {
            started: [],
            completed: [],
            blocked: [],
            failed: []
        };
    }
    byProcess[entry.process][entry.status].push(entry);
});

// Analyze each process
Object.keys(byProcess).forEach(processName => {
    const proc = byProcess[processName];
    const total = proc.started.length;
    const completed = proc.completed.length;
    const blocked = proc.blocked.length;
    const failed = proc.failed.length;
    
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;
    const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(1) : 0;
    
    console.log(`\n📊 ${processName}`);
    console.log("-".repeat(60));
    console.log(`  Total runs: ${total}`);
    console.log(`  ✅ Completed: ${completed} (${completionRate}%)`);
    console.log(`  ⏸️  Blocked: ${blocked} (${blockRate}%)`);
    console.log(`  ❌ Failed: ${failed}`);
    
    // Duration analysis
    if (proc.completed.length > 0) {
        const durations = proc.completed
            .map(e => e.duration)
            .filter(d => d != null)
            .sort((a, b) => a - b);
        
        if (durations.length > 0) {
            const avg = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2);
            const min = durations[0].toFixed(2);
            const max = durations[durations.length - 1].toFixed(2);
            const median = durations[Math.floor(durations.length / 2)].toFixed(2);
            
            console.log(`  ⏱️  Duration stats:`);
            console.log(`     Avg: ${avg}s | Min: ${min}s | Max: ${max}s | Median: ${median}s`);
            
            // Find slow executions (> 2x average)
            const slowThreshold = parseFloat(avg) * 2;
            const slow = proc.completed.filter(e => e.duration && e.duration > slowThreshold);
            if (slow.length > 0) {
                console.log(`     ⚠️  ${slow.length} slow executions (>${slowThreshold.toFixed(1)}s)`);
            }
        }
    }
    
    // Blocked analysis
    if (blocked > 0) {
        console.log(`  🔴 BLOCKING ISSUE: ${blocked} executions blocked!`);
        
        // Find longest blocking streak
        let maxStreak = 0;
        let currentStreak = 0;
        entries.forEach(entry => {
            if (entry.process === processName) {
                if (entry.status === "blocked") {
                    currentStreak++;
                    maxStreak = Math.max(maxStreak, currentStreak);
                } else {
                    currentStreak = 0;
                }
            }
        });
        
        if (maxStreak > 0) {
            console.log(`     Longest blocking streak: ${maxStreak} consecutive blocks`);
        }
    }
});

// Find processes that never complete
console.log(`\n\n🚨 CRITICAL ISSUES`);
console.log("=".repeat(60));
Object.keys(byProcess).forEach(processName => {
    const proc = byProcess[processName];
    if (proc.started.length > 0 && proc.completed.length === 0 && proc.failed.length === 0) {
        console.log(`❌ ${processName}: ${proc.started.length} runs, 0 completed, ${proc.blocked.length} blocked`);
        console.log(`   This process is HANGING and blocking all subsequent runs!`);
    }
});

// Find most blocked process
const mostBlocked = Object.keys(byProcess)
    .map(name => ({
        name,
        blocked: byProcess[name].blocked.length,
        total: byProcess[name].started.length
    }))
    .sort((a, b) => b.blocked - a.blocked);

if (mostBlocked.length > 0 && mostBlocked[0].blocked > 0) {
    console.log(`\n\n📈 MOST BLOCKED PROCESSES`);
    console.log("=".repeat(60));
    mostBlocked.slice(0, 5).forEach(p => {
        if (p.blocked > 0) {
            const rate = ((p.blocked / p.total) * 100).toFixed(1);
            console.log(`  ${p.name}: ${p.blocked}/${p.total} blocked (${rate}%)`);
        }
    });
}

// Recent activity
console.log(`\n\n⏰ RECENT ACTIVITY (Last 10 completed)`);
console.log("=".repeat(60));
const recent = entries
    .filter(e => e.status === "completed")
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

recent.forEach(entry => {
    const duration = entry.duration ? `${entry.duration.toFixed(2)}s` : "N/A";
    const time = new Date(entry.timestamp).toLocaleTimeString();
    console.log(`  ${time} | ${entry.process} | ${duration}`);
});

console.log("\n");

