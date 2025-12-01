const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "process-execution.log.json");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Log process execution details
 * @param {string} processName - Name of the process (e.g., "POLL LATEST")
 * @param {string} status - "started", "completed", "blocked", "failed"
 * @param {object} details - Additional details (duration, reason, etc.)
 */
function logProcess(processName, status, details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        process: processName,
        status: status,
        ...details
    };

    // Append to log file (one entry per line, JSON format)
    const logLine = JSON.stringify(entry) + "\n";
    fs.appendFileSync(LOG_FILE, logLine, "utf8");
}

/**
 * Get process execution statistics
 * @param {number} hours - Number of hours to look back (default: 24)
 * @returns {object} Statistics object
 */
function getProcessStats(hours = 24) {
    if (!fs.existsSync(LOG_FILE)) {
        return {
            total: 0,
            byProcess: {},
            blocked: [],
            averageDurations: {}
        };
    }

    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n");
    
    const entries = lines
        .map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        })
        .filter(entry => entry && new Date(entry.timestamp) >= cutoffTime);

    const stats = {
        total: entries.length,
        byProcess: {},
        blocked: [],
        averageDurations: {},
        recentExecutions: []
    };

    // Group by process
    entries.forEach(entry => {
        if (!stats.byProcess[entry.process]) {
            stats.byProcess[entry.process] = {
                total: 0,
                completed: 0,
                blocked: 0,
                failed: 0,
                durations: []
            };
        }

        stats.byProcess[entry.process].total++;

        if (entry.status === "completed") {
            stats.byProcess[entry.process].completed++;
            if (entry.duration) {
                stats.byProcess[entry.process].durations.push(entry.duration);
            }
        } else if (entry.status === "blocked") {
            stats.byProcess[entry.process].blocked++;
            stats.blocked.push(entry);
        } else if (entry.status === "failed") {
            stats.byProcess[entry.process].failed++;
        }
    });

    // Calculate average durations (exclude sub-1s runs - they're just checks, not actual runs)
    Object.keys(stats.byProcess).forEach(processName => {
        const durations = stats.byProcess[processName].durations.filter(d => d >= 1.0); // Only count runs >= 1 second
        if (durations.length > 0) {
            const sum = durations.reduce((a, b) => a + b, 0);
            stats.averageDurations[processName] = (sum / durations.length).toFixed(2);
        }
    });

    // Get recent executions (last 10)
    stats.recentExecutions = entries
        .filter(e => e.status === "completed" || e.status === "failed")
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);

    return stats;
}

/**
 * Generate a human-readable report
 * @param {number} hours - Number of hours to look back (default: 24)
 * @returns {string} Formatted report
 */
function generateReport(hours = 24) {
    const stats = getProcessStats(hours);
    
    let report = `\n📊 Process Execution Report (Last ${hours} hours)\n`;
    report += "=".repeat(60) + "\n\n";
    
    report += `Total log entries: ${stats.total}\n\n`;
    
    if (stats.total === 0) {
        report += "⚠️  No log entries found!\n";
        report += "   This could mean:\n";
        report += "   - Scheduler is not running\n";
        report += "   - Log file hasn't been created yet\n";
        report += "   - Log file is in a different location\n";
        report += "\n   Check if scheduler is running: ps aux | grep scheduler\n";
        return report;
    }
    
    // Process statistics
    report += "Process Statistics:\n";
    report += "-".repeat(60) + "\n";
    if (Object.keys(stats.byProcess).length === 0) {
        report += "\n   No process data found in logs.\n";
    } else {
    Object.keys(stats.byProcess).forEach(processName => {
        const proc = stats.byProcess[processName];
        report += `\n${processName}:\n`;
        report += `  Total runs: ${proc.total}\n`;
        report += `  Completed: ${proc.completed}\n`;
        report += `  Blocked: ${proc.blocked}\n`;
        report += `  Failed: ${proc.failed}\n`;
        if (stats.averageDurations[processName]) {
            report += `  Avg duration: ${stats.averageDurations[processName]}s\n`;
        }
    });
    }
    
    // Blocked processes
    if (stats.blocked && stats.blocked.length > 0) {
        report += `\n\n⚠️  Blocked Executions (${stats.blocked.length}):\n`;
        report += "-".repeat(60) + "\n";
        stats.blocked.forEach(entry => {
            report += `  ${entry.timestamp}: ${entry.process} - ${entry.reason || "Locked"}\n`;
        });
    }
    
    // Recent executions
    if (stats.recentExecutions && stats.recentExecutions.length > 0) {
        report += `\n\nRecent Executions:\n`;
        report += "-".repeat(60) + "\n";
        stats.recentExecutions.forEach(entry => {
            const duration = entry.duration ? ` (${entry.duration.toFixed(2)}s)` : "";
            const status = entry.status === "completed" ? "✅" : "❌";
            report += `  ${status} ${entry.timestamp}: ${entry.process}${duration}\n`;
        });
    }
    
    return report;
}

module.exports = {
    logProcess,
    getProcessStats,
    generateReport
};

