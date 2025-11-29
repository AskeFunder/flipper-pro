// File: /queries/columnConfig/buySellRate.js

// buy-sell rate over different history windows
const windows = [
    { gran: "5m", table: "price_5m", secs: 300 },
    { gran: "1h", table: "price_5m", secs: 3600 },
    { gran: "6h", table: "price_5m", secs: 21600 },
    { gran: "24h", table: "price_5m", secs: 86400 },
    { gran: "7d", table: "price_1h", secs: 604800 },
    { gran: "1m", table: "price_6h", secs: 2592000 }
];

module.exports = windows.map(({ gran, table, secs }) => ({
    id: `buy_sell_rate_${gran}`,
    sql: `bsr_${gran}.ratio AS buy_sell_rate_${gran}`,
    join: `
    LEFT JOIN LATERAL (
      SELECT ROUND(
        (
          CASE WHEN SUM(low_volume) = 0 THEN NULL
               ELSE SUM(high_volume)::numeric / NULLIF(SUM(low_volume),0)
          END
        )::numeric,
      2) AS ratio
      FROM ${table} p
      WHERE p.item_id = i.id
        AND p.timestamp >= EXTRACT(EPOCH FROM NOW()) - ${secs}
    ) bsr_${gran} ON true
  `
}));
