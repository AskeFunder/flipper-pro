// File: /queries/columnConfig/turnover.js

// Helper to calculate mid-price from avg_high and avg_low
const midPriceExpr = `(
  CASE
    WHEN p.avg_high IS NOT NULL AND p.avg_low IS NOT NULL THEN (p.avg_high + p.avg_low)/2.0
    WHEN p.avg_high IS NOT NULL THEN p.avg_high
    WHEN p.avg_low IS NOT NULL THEN p.avg_low
    ELSE NULL
  END
)`;

module.exports = [
    {
        id: "turnover_5m",
        sql: "t5m.turnover AS turnover_5m",
        filterExpr: "t5m.turnover",
        join: `
      LEFT JOIN LATERAL (
        SELECT ROUND(${midPriceExpr} * (p.high_volume + p.low_volume))::BIGINT AS turnover
        FROM price_5m p
        WHERE p.item_id = i.id
        ORDER BY p.timestamp DESC
        LIMIT 1
      ) t5m ON true`
    },
    {
        id: "turnover_1h",
        sql: "t1h.turnover AS turnover_1h",
        filterExpr: "t1h.turnover",
        join: `
      LEFT JOIN LATERAL (
        SELECT ROUND(
          SUM(${midPriceExpr} * (p.high_volume + p.low_volume))
        )::BIGINT AS turnover
        FROM price_5m p
        WHERE p.item_id = i.id
          AND p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 3600
      ) t1h ON true`
    },
    {
        id: "turnover_6h",
        sql: "t6h.turnover AS turnover_6h",
        filterExpr: "t6h.turnover",
        join: `
      LEFT JOIN LATERAL (
        SELECT ROUND(
          SUM(${midPriceExpr} * (p.high_volume + p.low_volume))
        )::BIGINT AS turnover
        FROM price_5m p
        WHERE p.item_id = i.id
          AND p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 21600
      ) t6h ON true`
    },
    {
        id: "turnover_24h",
        sql: "t24h.turnover AS turnover_24h",
        filterExpr: "t24h.turnover",
        join: `
      LEFT JOIN LATERAL (
        SELECT ROUND(
          SUM(${midPriceExpr} * (p.high_volume + p.low_volume))
        )::BIGINT AS turnover
        FROM price_5m p
        WHERE p.item_id = i.id
          AND p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 86400
      ) t24h ON true`
    },
    {
        id: "turnover_7d",
        sql: "t7d.turnover AS turnover_7d",
        filterExpr: "t7d.turnover",
        join: `
      LEFT JOIN LATERAL (
        SELECT ROUND(
          SUM(${midPriceExpr} * (p.high_volume + p.low_volume))
        )::BIGINT AS turnover
        FROM price_1h p
        WHERE p.item_id = i.id
          AND p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 604800
      ) t7d ON true`
    },
    {
        id: "turnover_1m",
        sql: "t1m.turnover AS turnover_1m",
        filterExpr: "t1m.turnover",
        join: `
      LEFT JOIN LATERAL (
        SELECT ROUND(
          SUM(${midPriceExpr} * (p.high_volume + p.low_volume))
        )::BIGINT AS turnover
        FROM price_6h p
        WHERE p.item_id = i.id
          AND p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 2592000
      ) t1m ON true`
    }
];