const { exec } = require("child_process");

// Run one poll
function runPoll(interval) {
    console.log(`🚀 Running poll for [${interval}] at ${new Date().toISOString()}`);
    exec(`node poller/poll-granularities.js ${interval}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Poll error: ${error.message}`);
        }
        if (stderr) {
            console.error(stderr);
        }
        if (stdout) {
            console.log(stdout.trim());
        }
    });
}

// Wait until time aligns
function waitUntilNextTick(intervalSeconds = 300, bufferSeconds = 30) {
    const now = new Date();
    const nowSec = now.getUTCSeconds();
    const nowMin = now.getUTCMinutes();
    const nowMs = now.getMilliseconds();

    const minuteMod = nowMin % (intervalSeconds / 60);
    const secondsPastMod = minuteMod * 60 + nowSec;

    let delay = ((intervalSeconds - secondsPastMod) + bufferSeconds) * 1000 - nowMs;
    if (delay < 0) delay += intervalSeconds * 1000;

    console.log(`⏳ Waiting ${(delay / 1000).toFixed(1)}s until next poll...`);
    return new Promise(resolve => setTimeout(resolve, delay));
}

async function startPolling() {
    const interval = "5m"; // You can expand this later
    const intervalSeconds = 300;

    while (true) {
        await waitUntilNextTick(intervalSeconds, 30);
        runPoll(interval);
    }
}

startPolling();
