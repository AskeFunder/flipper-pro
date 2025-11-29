// scripts/clear-price-5m.js
const Database = require("better-sqlite3");
const db = new Database("flipperpro.db");

const deleted = db.prepare(`DELETE FROM price_5m`).run();
console.log(`✅ Cleared price_5m (deleted ${deleted.changes} rows)`);
