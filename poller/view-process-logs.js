#!/usr/bin/env node

/**
 * View process execution logs and statistics
 * Usage: node poller/view-process-logs.js [hours]
 * Default: Shows last 24 hours
 */

const { generateReport, getProcessStats } = require("./process-logger");

const hours = parseInt(process.argv[2]) || 24;

console.log(generateReport(hours));

// Also output JSON stats if requested
if (process.argv.includes("--json")) {
    const stats = getProcessStats(hours);
    console.log("\n\nJSON Statistics:");
    console.log(JSON.stringify(stats, null, 2));
}

