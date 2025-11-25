const Database = require("better-sqlite3");
const db = new Database("flipperpro.db");

const EXPECTED_COUNT = 289;

function getItemIds() {
    const stmt = db.prepare(`SELECT id FROM items`);
    return stmt.all().map((row) => row.id);
}

function getRowCountForItem(itemId) {
    const stmt = db.prepare(`SELECT COUNT(*) AS total FROM price_5m WHERE item_id = ?`);
    const { total } = stmt.get(itemId);
    return total;
}

function runCheck() {
    const itemIds = getItemIds();

    let full = 0;
    let partial = 0;
    let missing = 0;

    for (const itemId of itemIds) {
        const count = getRowCountForItem(itemId);

        if (count === EXPECTED_COUNT) {
            full++;
        } else if (count === 0) {
            missing++;
            console.log(`❌ MISSING: Item ${itemId} has 0 rows`);
        } else {
            partial++;
            console.log(`⚠️  PARTIAL: Item ${itemId} has ${count} rows (expected ${EXPECTED_COUNT})`);
        }
    }

    console.log(`\n✅ ${full} items have full 5m coverage`);
    console.log(`⚠️  ${partial} items are partially filled`);
    console.log(`❌ ${missing} items have no rows at all\n`);
}

runCheck();
