const Database = require("better-sqlite3");
const db = new Database("flipperpro.db");

const TABLES = [
    "price_5m",
    "price_1h",
    "price_6h",
    "price_24h",
    "items"
];

let totalRows = 0;

function countRows(table) {
    try {
        const { count } = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        totalRows += count;
        console.log(`📦 ${table.padEnd(12)} → ${count.toLocaleString()} rows`);
    } catch (err) {
        console.error(`❌ Failed to count rows in ${table}: ${err.message}`);
    }
}

console.log("📊 Database Row Counts:\n");
TABLES.forEach(countRows);

console.log(`\n🔢 Total rows across all tables: ${totalRows.toLocaleString()}\n`);
db.close();
