/**
 * Migration script to add 1 hour offset to all price_1h timestamps
 * This makes timestamps represent the END of the 1-hour period instead of the START
 */

require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate1hTimestamps() {
    console.log('='.repeat(80));
    console.log('🔄 MIGRATING price_1h TIMESTAMPS (+1 hour offset)');
    console.log('='.repeat(80));
    console.log();
    
    try {
        await db.query('BEGIN');
        
        // First, check if there are any conflicts (old timestamp + 3600 might conflict with existing)
        console.log('📊 Checking for potential conflicts...');
        const conflictCheck = await db.query(`
            SELECT COUNT(*) as conflict_count
            FROM price_1h p1
            INNER JOIN price_1h p2 ON p1.item_id = p2.item_id 
                AND p1.timestamp + 3600 = p2.timestamp
                AND p1.id != p2.id
        `);
        
        const conflictCount = parseInt(conflictCheck.rows[0].conflict_count);
        if (conflictCount > 0) {
            console.log(`⚠️  WARNING: Found ${conflictCount} potential conflicts!`);
            console.log('   This means some timestamps + 3600 already exist.');
            console.log('   We will need to handle these conflicts.');
            console.log();
        } else {
            console.log('✅ No conflicts found. Safe to proceed.');
            console.log();
        }
        
        // Get count of rows to update
        const countResult = await db.query('SELECT COUNT(*) as total FROM price_1h');
        const totalRows = parseInt(countResult.rows[0].total);
        console.log(`📊 Total rows in price_1h: ${totalRows}`);
        console.log();
        
        if (totalRows === 0) {
            console.log('ℹ️  No data to migrate. Exiting.');
            await db.query('COMMIT');
            await db.end();
            return;
        }
        
        // Strategy: Since we can't directly update timestamps that are part of a unique constraint,
        // we need to:
        // 1. Create a temporary table with updated timestamps
        // 2. Delete old data
        // 3. Insert from temporary table
        
        console.log('📝 Step 1: Creating temporary table with updated timestamps...');
        await db.query(`
            CREATE TEMP TABLE price_1h_migrated AS
            SELECT 
                item_id,
                timestamp + 3600 AS timestamp,  -- Add 1 hour offset
                avg_high,
                avg_low,
                low_volume,
                high_volume
            FROM price_1h
        `);
        
        console.log('✅ Temporary table created');
        console.log();
        
        console.log('📝 Step 2: Checking for duplicates in migrated data...');
        const duplicateCheck = await db.query(`
            SELECT item_id, timestamp, COUNT(*) as count
            FROM price_1h_migrated
            GROUP BY item_id, timestamp
            HAVING COUNT(*) > 1
        `);
        
        if (duplicateCheck.rows.length > 0) {
            console.log(`⚠️  Found ${duplicateCheck.rows.length} duplicate (item_id, timestamp) pairs after migration:`);
            duplicateCheck.rows.slice(0, 10).forEach(row => {
                console.log(`   Item ${row.item_id}, timestamp ${row.timestamp}: ${row.count} rows`);
            });
            console.log('   These will be handled by ON CONFLICT DO NOTHING');
            console.log();
        } else {
            console.log('✅ No duplicates found');
            console.log();
        }
        
        console.log('📝 Step 3: Deleting old data...');
        const deleteResult = await db.query('DELETE FROM price_1h');
        console.log(`✅ Deleted ${deleteResult.rowCount} rows`);
        console.log();
        
        console.log('📝 Step 4: Inserting migrated data...');
        const insertResult = await db.query(`
            INSERT INTO price_1h (item_id, timestamp, avg_high, avg_low, low_volume, high_volume)
            SELECT item_id, timestamp, avg_high, avg_low, low_volume, high_volume
            FROM price_1h_migrated
            ON CONFLICT (item_id, timestamp) DO NOTHING
        `);
        console.log(`✅ Inserted ${insertResult.rowCount} rows`);
        console.log();
        
        // Verify the migration
        const verifyResult = await db.query('SELECT COUNT(*) as total FROM price_1h');
        const finalCount = parseInt(verifyResult.rows[0].total);
        
        console.log('📊 VERIFICATION:');
        console.log('-'.repeat(80));
        console.log(`Rows before migration: ${totalRows}`);
        console.log(`Rows after migration: ${finalCount}`);
        
        if (finalCount === totalRows) {
            console.log('✅ Migration successful! All rows migrated.');
        } else {
            console.log(`⚠️  Row count mismatch. ${totalRows - finalCount} rows may have been lost due to conflicts.`);
        }
        
        // Show sample of migrated data
        console.log();
        console.log('📊 SAMPLE OF MIGRATED DATA (last 5 rows):');
        console.log('-'.repeat(80));
        const sampleResult = await db.query(`
            SELECT item_id, timestamp, 
                   TO_TIMESTAMP(timestamp) AT TIME ZONE 'UTC' AS timestamp_utc,
                   avg_high, avg_low
            FROM price_1h
            ORDER BY timestamp DESC
            LIMIT 5
        `);
        
        sampleResult.rows.forEach((row, idx) => {
            console.log(`${idx + 1}. Item ${row.item_id}: ${row.timestamp} (${row.timestamp_utc}) - mid: ${(row.avg_high + row.avg_low) / 2}`);
        });
        
        await db.query('COMMIT');
        console.log();
        console.log('✅ Migration completed successfully!');
        
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('❌ Migration failed:', err);
        throw err;
    } finally {
        await db.end();
    }
}

// Run migration
migrate1hTimestamps().catch(console.error);

