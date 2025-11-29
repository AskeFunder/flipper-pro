const axios = require("axios");
const db = require("../db/db");

const HEADERS = {
    "User-Agent": "flipperpro-dev - @yourusername on Discord"
};

async function fetchAndInsertMapping() {
    const url = "https://prices.runescape.wiki/api/v1/osrs/mapping";
    const { data } = await axios.get(url, { headers: HEADERS });

    const insertSQL = `
    INSERT INTO items (
      id, name, members, examine, "limit", value, highalch, lowalch, icon
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      members = EXCLUDED.members,
      examine = EXCLUDED.examine,
      "limit" = EXCLUDED."limit",
      value = EXCLUDED.value,
      highalch = EXCLUDED.highalch,
      lowalch = EXCLUDED.lowalch,
      icon = EXCLUDED.icon;
  `;

    try {
        await db.query("BEGIN");

        for (const item of data) {
            await db.query(insertSQL, [
                item.id,
                item.name,
                item.members,
                item.examine,
                item.limit,
                item.value,
                item.highalch,
                item.lowalch,
                item.icon
            ]);
        }

        await db.query("COMMIT");
        console.log(`✅ Inserted or updated ${data.length} items`);
    } catch (err) {
        await db.query("ROLLBACK");
        console.error("❌ Failed to insert items:", err.message);
    } finally {
        await db.end();
    }
}

fetchAndInsertMapping();
