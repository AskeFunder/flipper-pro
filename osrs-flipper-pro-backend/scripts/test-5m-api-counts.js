const axios = require("axios");

const HEADERS = {
    "User-Agent": "flipperpro-dev - @yourusername on Discord"
};

// Replace these with any real 5m-aligned timestamps
const timestamps = [
    1721846700, // Most recent (example)
    1721846400,
    1721846100
];

async function fetchAndCount(ts) {
    const url = `https://prices.runescape.wiki/api/v1/osrs/5m?timestamp=${ts}`;
    try {
        const { data } = await axios.get(url, { headers: HEADERS });
        const count = Object.keys(data.data).length;
        console.log(`🕒 ${ts} → ${count} items`);
    } catch (err) {
        console.error(`❌ Failed for ${ts}: ${err.message}`);
    }
}

(async () => {
    for (const ts of timestamps) {
        await fetchAndCount(ts);
    }
})();
