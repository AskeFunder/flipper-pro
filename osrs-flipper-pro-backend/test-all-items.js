const db = require('./db/db');

// Name to slug conversion (matches frontend)
function nameToSlug(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-')      // Replace spaces with hyphens
        .replace(/-+/g, '-')        // Replace multiple hyphens with single
        .replace(/^-|-$/g, '');    // Remove leading/trailing hyphens
}

// Normalize function (matches backend)
function normalize(str) {
    return str
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove special characters
        .replace(/\s+/g, ' ')   // Normalize spaces
        .trim();
}

async function testAllItems() {
    try {
        console.log('Fetching all items from database...\n');
        const { rows: allItems } = await db.query(
            'SELECT item_id, name FROM canonical_items ORDER BY item_id'
        );
        
        console.log(`Testing ${allItems.length} items...\n`);
        
        let successCount = 0;
        let failCount = 0;
        const failures = [];
        
        for (let i = 0; i < allItems.length; i++) {
            const item = allItems[i];
            const { item_id, name } = item;
            
            // Test 1: Fetch by ID
            const { rows: byId } = await db.query(
                'SELECT item_id, name FROM canonical_items WHERE item_id = $1',
                [item_id]
            );
            
            if (byId.length === 0) {
                console.log(`❌ Item ${item_id} (${name}): FAILED by ID`);
                failures.push({ item_id, name, reason: 'ID lookup failed' });
                failCount++;
                continue;
            }
            
            // Test 2: Convert to slug and fetch by name
            const slug = nameToSlug(name);
            const slugToName = slug.replace(/-/g, ' ');
            const normalizedSearch = normalize(slugToName);
            
            // Try exact match first
            let { rows: byName } = await db.query(
                'SELECT item_id, name FROM canonical_items WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))',
                [slugToName]
            );
            
            // Try normalized match
            if (byName.length === 0) {
                const { rows: normalizedRows } = await db.query(`
                    SELECT item_id, name
                    FROM canonical_items
                    WHERE LOWER(REGEXP_REPLACE(name, '[^\\w\\s-]', '', 'g')) = $1
                `, [normalizedSearch]);
                byName = normalizedRows;
            }
            
            if (byName.length === 0 || byName[0].item_id !== item_id) {
                console.log(`❌ Item ${item_id} (${name}): FAILED by name`);
                console.log(`   Slug: "${slug}"`);
                console.log(`   Slug to name: "${slugToName}"`);
                console.log(`   Normalized: "${normalizedSearch}"`);
                if (byName.length > 0) {
                    console.log(`   Found different item: ${byName[0].item_id} (${byName[0].name})`);
                }
                failures.push({ 
                    item_id, 
                    name, 
                    slug,
                    reason: byName.length === 0 ? 'Name lookup returned no results' : 'Name lookup returned wrong item'
                });
                failCount++;
            } else {
                successCount++;
                if ((i + 1) % 100 === 0) {
                    console.log(`✓ Tested ${i + 1}/${allItems.length} items...`);
                }
            }
        }
        
        console.log('\n=== SUMMARY ===');
        console.log(`Total items: ${allItems.length}`);
        console.log(`✅ Success: ${successCount}`);
        console.log(`❌ Failed: ${failCount}`);
        
        if (failures.length > 0) {
            console.log('\n=== FAILURES ===');
            failures.forEach((f, idx) => {
                console.log(`\n${idx + 1}. Item ID: ${f.item_id}`);
                console.log(`   Name: "${f.name}"`);
                console.log(`   Slug: "${f.slug}"`);
                console.log(`   Reason: ${f.reason}`);
            });
        }
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.end();
        process.exit(0);
    }
}

testAllItems();


