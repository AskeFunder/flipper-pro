// File: /queries/columnConfig/trend.js

// helper to compute mid price from avg_high / avg_low
const midPriceExpr = `(
  CASE
    WHEN p.avg_high IS NOT NULL AND p.avg_low IS NOT NULL THEN (p.avg_high + p.avg_low) / 2.0
    WHEN p.avg_high IS NOT NULL THEN p.avg_high
    WHEN p.avg_low IS NOT NULL THEN p.avg_low
    ELSE NULL
  END
)`;

// Define your trend windows and their source tables
const windows = [
    { id: "trend_5m", table: "price_5m", secs: 300 },
    { id: "trend_1h", table: "price_5m", secs: 3600 },
    { id: "trend_6h", table: "price_5m", secs: 21600 },
    { id: "trend_24h", table: "price_5m", secs: 86400 },
    { id: "trend_7d", table: "price_1h", secs: 604800 },
    { id: "trend_1m", table: "price_6h", secs: 2592000 },
];

module.exports = windows.map(({ id, table, secs }) => {
    const alias = id.replace("trend_", "t");
    const field = id.split("_")[1];
    return {
        id,
        sql: `${alias}.trend_${field} AS ${id}`,
        join: `
      LEFT JOIN LATERAL (
        SELECT ROUND(
          100.0 * (curr.mid - prev.mid) / NULLIF(prev.mid,0), 2
        ) AS trend_${field}
        FROM (
          SELECT ${midPriceExpr} AS mid
          FROM ${table} p
          WHERE p.item_id = i.id
          ORDER BY p.timestamp DESC
          LIMIT 1
        ) curr
        LEFT JOIN LATERAL (
          SELECT ${midPriceExpr} AS mid
          FROM ${table} p
          WHERE p.item_id = i.id
            AND p.timestamp <= EXTRACT(EPOCH FROM NOW()) - ${secs}
          ORDER BY p.timestamp DESC
          LIMIT 1
        ) prev ON true
      ) ${alias} ON true
    `
    };
});
