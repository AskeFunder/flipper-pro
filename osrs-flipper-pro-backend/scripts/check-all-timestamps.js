require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const TABLES = ["price_5m", "price_1h", "price_6h", "price_24h"];

(async () => {
    try {
        console.log("🔍 Checking all granularity timestamps...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        const now = Math.floor(Date.now() / 1000);
        const nowDate = new Date(now * 1000);
        console.log(`⏰ Current time: ${now} = ${nowDate.toISOString()}\n`);
        
        for (const table of TABLES) {
            console.log(`📊 ${table}:`);
            
            // Check for negative timestamps
            const { rows: negRows } = await db.query(`
                SELECT COUNT(DISTINCT timestamp) as count 
                FROM ${table} 
                WHERE timestamp < 0
            `);
            const negCount = parseInt(negRows[0].count);
            
            // Check for timestamps in the future (more than 1 day ahead)
            const { rows: futureRows } = await db.query(`
                SELECT COUNT(DISTINCT timestamp) as count 
                FROM ${table} 
                WHERE timestamp > $1
            `, [now + 86400]);
            const futureCount = parseInt(futureRows[0].count);
            
            // Get total distinct timestamps
            const { rows: totalRows } = await db.query(`
                SELECT COUNT(DISTINCT timestamp) as count 
                FROM ${table}
            `);
            const totalCount = parseInt(totalRows[0].count);
            
            // Get min and max timestamps
            const { rows: rangeRows } = await db.query(`
                SELECT 
                    MIN(timestamp) as min_ts,
                    MAX(timestamp) as max_ts
                FROM ${table}
            `);
            
            const minTs = rangeRows[0].min_ts;
            const maxTs = rangeRows[0].max_ts;
            
            console.log(`   Total distinct timestamps: ${totalCount}`);
            console.log(`   Negative timestamps: ${negCount}`);
            console.log(`   Future timestamps (>1 day): ${futureCount}`);
            
            if (minTs !== null) {
                const minDate = new Date(minTs * 1000);
                const maxDate = new Date(maxTs * 1000);
                console.log(`   Min: ${minTs} = ${minDate.toISOString()}`);
                console.log(`   Max: ${maxTs} = ${maxDate.toISOString()}`);
                
                if (minTs < 0 || minTs < now - (365 * 24 * 60 * 60)) {
                    console.log(`   ⚠️  WARNING: Bad timestamps detected!`);
                }
            } else {
                console.log(`   ⚠️  No timestamps found`);
            }
            
            console.log("");
        }
        
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        await db.end();
    }
})();


