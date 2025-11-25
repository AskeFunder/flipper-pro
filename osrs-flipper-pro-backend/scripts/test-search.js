require("dotenv").config();
const db = require("../db/db");

(async () => {
    try {
        const query = "rune";
        const searchTerm = `%${query.toLowerCase()}%`;
        
        console.log("Testing search with query:", query);
        console.log("Search term:", searchTerm);
        
        const { rows } = await db.query(`
            SELECT 
                item_id AS id,
                name,
                icon
            FROM canonical_items
            WHERE LOWER(name) LIKE $1
            ORDER BY 
                CASE 
                    WHEN LOWER(name) = LOWER($2) THEN 1
                    WHEN LOWER(name) LIKE LOWER($3) THEN 2
                    ELSE 3
                END,
                name ASC
            LIMIT 5
        `, [searchTerm, query.trim(), `${query.trim()}%`]);
        
        console.log("Search results:", rows);
        console.log("Number of results:", rows.length);
        
        await db.end();
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
})();





