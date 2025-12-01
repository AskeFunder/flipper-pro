#!/usr/bin/env node

/**
 * Health check for process execution
 * Verifies that processes are running at expected frequencies
 * Usage: node poller/check-process-health.js [hours]
 * Default: Checks last 24 hours
 */

const { getProcessStats } = require("./process-logger");

// Expected frequencies (runs per hour)
// Based on scheduler.js configuration
const EXPECTED_FREQUENCIES = {
    "POLL LATEST": 60,        // Every minute at :10
    "UPDATE CANONICAL": 60,   // Dynamic frequency (every 15-60s based on dirty items)
    "POLL 5m": 12,            // Every 5 minutes at :30
    "POLL 1h": 1,             // Every hour at :00:30
    "POLL 6h": 0.167,         // Every 6 hours at :00:30 (1/6 per hour)
    "POLL 24h": 0.042,        // Daily at 02:00:30 (1/24 per hour)
    "CLEANUP 5m": 12,         // Every 5 minutes (after poll)
    "FULL CLEANUP": 6         // Every 10 minutes at :01
};

// Tolerance for acceptable deviation (percentage)
const TOLERANCE = 0.2; // 20% tolerance

function checkProcessHealth(hours = 24) {
    const stats = getProcessStats(hours);
    const expectedRuns = hours; // For per-hour processes
    
    console.log(`\n🏥 Process Health Check (Last ${hours} hours)`);
    console.log("=".repeat(70));
    console.log();
    
    const issues = [];
    const warnings = [];
    const healthy = [];
    
    // Check each expected process
    Object.keys(EXPECTED_FREQUENCIES).forEach(processName => {
        const expectedPerHour = EXPECTED_FREQUENCIES[processName];
        const expectedTotal = Math.floor(expectedPerHour * hours);
        const actual = stats.byProcess[processName];
        
        if (!actual) {
            issues.push({
                process: processName,
                severity: "ERROR",
                message: `Process not found in logs - may not be running!`,
                expected: expectedTotal,
                actual: 0
            });
            return;
        }
        
        const completed = actual.completed || 0;
        const failed = actual.failed || 0;
        const blocked = actual.blocked || 0;
        const total = actual.total || 0;
        
        // Calculate completion rate
        const completionRate = total > 0 ? (completed / total) : 0;
        const successRate = total > 0 ? (completed / (completed + failed)) : 0;
        
        // Check if running at expected frequency
        const minExpected = Math.floor(expectedTotal * (1 - TOLERANCE));
        const maxExpected = Math.ceil(expectedTotal * (1 + TOLERANCE));
        
        let status = "✅";
        let severity = "OK";
        
        // Check frequency
        if (completed < minExpected) {
            status = "❌";
            severity = "ERROR";
            issues.push({
                process: processName,
                severity: "ERROR",
                message: `Running too infrequently! Expected ~${expectedTotal} runs, got ${completed}`,
                expected: expectedTotal,
                actual: completed,
                completionRate: (completionRate * 100).toFixed(1) + "%",
                blocked: blocked,
                failed: failed
            });
        } else if (completed > maxExpected) {
            status = "⚠️";
            severity = "WARNING";
            warnings.push({
                process: processName,
                severity: "WARNING",
                message: `Running more frequently than expected. Expected ~${expectedTotal} runs, got ${completed}`,
                expected: expectedTotal,
                actual: completed
            });
        }
        
        // Check failure rate
        if (failed > 0 && successRate < 0.95) {
            if (severity !== "ERROR") {
                status = "⚠️";
                severity = "WARNING";
            }
            warnings.push({
                process: processName,
                severity: "WARNING",
                message: `High failure rate: ${failed} failures out of ${total} runs (${((1 - successRate) * 100).toFixed(1)}% failure rate)`,
                failed: failed,
                total: total,
                successRate: (successRate * 100).toFixed(1) + "%"
            });
        }
        
        // Check blocked rate (if more than 10% blocked, it's a warning)
        if (blocked > 0 && (blocked / total) > 0.1) {
            if (severity !== "ERROR") {
                status = "⚠️";
                severity = "WARNING";
            }
            warnings.push({
                process: processName,
                severity: "WARNING",
                message: `High blocked rate: ${blocked} blocked out of ${total} runs (${((blocked / total) * 100).toFixed(1)}% blocked) - processes may be taking too long`,
                blocked: blocked,
                total: total,
                blockedRate: ((blocked / total) * 100).toFixed(1) + "%"
            });
        }
        
        // If no issues, mark as healthy
        if (severity === "OK") {
            healthy.push({
                process: processName,
                completed: completed,
                expected: expectedTotal,
                completionRate: (completionRate * 100).toFixed(1) + "%",
                avgDuration: stats.averageDurations[processName] || "N/A"
            });
        }
        
        // Print status
        console.log(`${status} ${processName}:`);
        console.log(`   Expected: ~${expectedTotal} runs | Actual: ${completed} completed, ${failed} failed, ${blocked} blocked`);
        if (stats.averageDurations[processName]) {
            console.log(`   Avg duration: ${stats.averageDurations[processName]}s`);
        }
        console.log();
    });
    
    // Summary
    console.log("=".repeat(70));
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Healthy: ${healthy.length}`);
    console.log(`   ⚠️  Warnings: ${warnings.length}`);
    console.log(`   ❌ Errors: ${issues.length}`);
    console.log();
    
    // Show issues
    if (issues.length > 0) {
        console.log("❌ ERRORS (Action Required):");
        console.log("-".repeat(70));
        issues.forEach(issue => {
            console.log(`\n${issue.process}:`);
            console.log(`   ${issue.message}`);
            if (issue.expected !== undefined) {
                console.log(`   Expected: ${issue.expected} | Actual: ${issue.actual}`);
            }
            if (issue.completionRate) {
                console.log(`   Completion rate: ${issue.completionRate}`);
            }
            if (issue.blocked !== undefined) {
                console.log(`   Blocked: ${issue.blocked}`);
            }
            if (issue.failed !== undefined) {
                console.log(`   Failed: ${issue.failed}`);
            }
        });
        console.log();
    }
    
    // Show warnings
    if (warnings.length > 0) {
        console.log("⚠️  WARNINGS (Monitor):");
        console.log("-".repeat(70));
        warnings.forEach(warning => {
            console.log(`\n${warning.process}:`);
            console.log(`   ${warning.message}`);
            if (warning.expected !== undefined) {
                console.log(`   Expected: ${warning.expected} | Actual: ${warning.actual}`);
            }
            if (warning.failed !== undefined) {
                console.log(`   Failed: ${warning.failed} / ${warning.total} (${warning.successRate})`);
            }
            if (warning.blocked !== undefined) {
                console.log(`   Blocked: ${warning.blocked} / ${warning.total} (${warning.blockedRate})`);
            }
        });
        console.log();
    }
    
    // Show healthy processes
    if (healthy.length > 0) {
        console.log("✅ HEALTHY PROCESSES:");
        console.log("-".repeat(70));
        healthy.forEach(proc => {
            console.log(`   ${proc.process}: ${proc.completed}/${proc.expected} runs (${proc.completionRate}) | Avg: ${proc.avgDuration}s`);
        });
        console.log();
    }
    
    // Exit code
    if (issues.length > 0) {
        console.log("❌ Health check FAILED - Action required!");
        process.exit(1);
    } else if (warnings.length > 0) {
        console.log("⚠️  Health check PASSED with warnings");
        process.exit(0);
    } else {
        console.log("✅ Health check PASSED - All processes healthy!");
        process.exit(0);
    }
}

const hours = parseInt(process.argv[2]) || 24;
checkProcessHealth(hours);

