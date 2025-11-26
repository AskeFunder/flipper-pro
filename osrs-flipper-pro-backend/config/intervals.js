module.exports = {
    "5m": {
        endpoint: "5m",
        table: "price_5m",
        intervalSeconds: 300,
        retentionHours: 24
    },
    "1h": {
        endpoint: "1h",
        table: "price_1h",
        intervalSeconds: 3600,
        retentionHours: 169 // 7 days + 1 hour to ensure we have the first datapoint in the 7-day window
    },
    "6h": {
        endpoint: "6h",
        table: "price_6h",
        intervalSeconds: 21600,
        retentionHours: 726 // 30 days + 6 hours to ensure we have the first datapoint in the 30-day window
    },
    "24h": {
        endpoint: "24h",
        table: "price_24h",
        intervalSeconds: 86400,
        retentionHours: 8784 // 365 days + 1 day to ensure we have the first datapoint in the 365-day window
    }
};
