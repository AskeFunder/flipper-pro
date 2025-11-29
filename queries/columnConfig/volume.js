// File: /queries/columnConfig/volume.js
module.exports = [
    {
        id: "volume_5m",
        sql: "v5m.volume_5m AS volume_5m",
        filterExpr: "v5m.volume_5m",
        join: `
      LEFT JOIN LATERAL (
        SELECT volume::BIGINT AS volume_5m
        FROM price_5m
        WHERE item_id = i.id
        ORDER BY timestamp DESC
        LIMIT 1
      ) v5m ON true`
    },
    {
        id: "volume_1h",
        sql: "v1h.volume AS volume_1h",
        filterExpr: "v1h.volume",
        join: `
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(volume), 0)::BIGINT AS volume
        FROM price_5m
        WHERE item_id = i.id
          AND timestamp >= EXTRACT(EPOCH FROM NOW()) - 3600
      ) v1h ON true`
    },
    {
        id: "volume_6h",
        sql: "v6h.volume AS volume_6h",
        filterExpr: "v6h.volume",
        join: `
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(volume), 0)::BIGINT AS volume
        FROM price_5m
        WHERE item_id = i.id
          AND timestamp >= EXTRACT(EPOCH FROM NOW()) - 21600
      ) v6h ON true`
    },
    {
        id: "volume_24h",
        sql: "v24h.volume AS volume_24h",
        filterExpr: "v24h.volume",
        join: `
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(volume), 0)::BIGINT AS volume
        FROM price_5m
        WHERE item_id = i.id
          AND timestamp >= EXTRACT(EPOCH FROM NOW()) - 86400
      ) v24h ON true`
    },
    {
        id: "volume_7d",
        sql: "v7d.volume AS volume_7d",
        filterExpr: "v7d.volume",
        join: `
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(volume), 0)::BIGINT AS volume
        FROM price_1h
        WHERE item_id = i.id
          AND timestamp >= EXTRACT(EPOCH FROM NOW()) - 604800
      ) v7d ON true`
    },
    {
        id: "volume_1m",
        sql: "v1m.volume AS volume_1m",
        filterExpr: "v1m.volume",
        join: `
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(volume), 0)::BIGINT AS volume
        FROM price_6h
        WHERE item_id = i.id
          AND timestamp >= EXTRACT(EPOCH FROM NOW()) - 2592000
      ) v1m ON true`
    }
];
