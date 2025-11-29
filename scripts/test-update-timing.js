const updateCanonicalItems = require('../poller/update-canonical-items');

async function testTiming() {
    const startTime = Date.now();
    console.log(`[TEST] Starting update at ${new Date().toISOString()}`);
    
    try {
        await updateCanonicalItems();
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`\n[TEST] Update completed in ${duration.toFixed(2)} seconds`);
        
        if (duration < 15) {
            console.log('✅ SUCCESS: Update finished in under 15 seconds!');
        } else {
            console.log('⚠️ WARNING: Update took longer than 15 seconds');
        }
        
        process.exit(0);
    } catch (err) {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        console.error(`\n[TEST] Update failed after ${duration.toFixed(2)} seconds`);
        console.error(err);
        process.exit(1);
    }
}

testTiming();







