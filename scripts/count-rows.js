const Database = require("better-sqlite3");
const db = new Database("flipperpro.db");

const itemId = 4151;

const count = db.prepare(`SELECT COUNT(*) as total FROM price_5m WHERE item_id = ?`).get(itemId);
console.log(`Item ${itemId} has ${count.total} datapoints in price_5m.`);
