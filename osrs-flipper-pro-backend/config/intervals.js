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
        retentionHours: 168
    },
    "6h": {
        endpoint: "6h",
        table: "price_6h",
        intervalSeconds: 21600,
        retentionHours: 720
    },
    "24h": {
        endpoint: "24h",
        table: "price_24h",
        intervalSeconds: 86400,
        retentionHours: 8760
    }
};
