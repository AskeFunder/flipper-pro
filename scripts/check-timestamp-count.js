const Database = require("better-sqlite3");
const db = new Database("flipperpro.db");

// ⏲️ Set your target timestamp here
const TARGET_TIMESTAMP = 1753391100;
const TABLE = "price_5m";

const count = db
    .prepare(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE timestamp = ?`)
    .get(TARGET_TIMESTAMP).total;

console.log(`🔍 Timestamp ${TARGET_TIMESTAMP} has ${count} rows in ${TABLE}.`);
