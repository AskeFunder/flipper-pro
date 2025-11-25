const fetch = require("node-fetch");
const db = require("../db/db"); // Adjust if needed

async function pollLatest() {
    const res = await fetch("https://prices.runescape.wiki/api/v1/osrs/latest", {
        headers: {
            "User-Agent": "flipperpro-dev - @montemarto" // Update this!
        }
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status} - ${await res.text()}`);
    }

    const json = await res.json();
    const data = json.data;
    const now = Math.floor(Date.now() / 1000);

    try {
        await db.query("BEGIN");

        for (const [itemIdStr, entry] of Object.entries(data)) {
            const itemId = parseInt(itemIdStr, 10);

            if (entry.high !== null && entry.highTime !== null) {
                await db.query(`
                    INSERT INTO price_instants (item_id, price, type, timestamp, last_updated)
                    VALUES ($1, $2, 'high', $3, $4)
                    ON CONFLICT (item_id, type) DO UPDATE SET
                        price = EXCLUDED.price,
                        timestamp = EXCLUDED.timestamp,
                        last_updated = EXCLUDED.last_updated;
                `, [itemId, entry.high, entry.highTime, now]);

                await db.query(`
                    INSERT INTO price_instant_log (item_id, price, type, timestamp, seen_at)
                    VALUES ($1, $2, 'high', $3, $4)
                    ON CONFLICT DO NOTHING;
                `, [itemId, entry.high, entry.highTime, now]);
            }

            if (entry.low !== null && entry.lowTime !== null) {
                await db.query(`
                    INSERT INTO price_instants (item_id, price, type, timestamp, last_updated)
                    VALUES ($1, $2, 'low', $3, $4)
                    ON CONFLICT (item_id, type) DO UPDATE SET
                        price = EXCLUDED.price,
                        timestamp = EXCLUDED.timestamp,
                        last_updated = EXCLUDED.last_updated;
                `, [itemId, entry.low, entry.lowTime, now]);

                await db.query(`
                    INSERT INTO price_instant_log (item_id, price, type, timestamp, seen_at)
                    VALUES ($1, $2, 'low', $3, $4)
                    ON CONFLICT DO NOTHING;
                `, [itemId, entry.low, entry.lowTime, now]);
            }
        }

        await db.query("COMMIT");
        console.log(`[LATEST] Updated ${Object.keys(data).length} items @ ${new Date().toISOString()}`);
    } catch (err) {
        await db.query("ROLLBACK");
        console.error("[LATEST] Error during DB transaction:", err.message);
    }
}

pollLatest().catch(err => {
    console.error("[LATEST] Error polling:", err.message);
});
