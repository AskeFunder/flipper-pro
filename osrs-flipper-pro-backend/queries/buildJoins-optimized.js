// /queries/buildJoins-optimized.js
// Optimized version that combines multiple aggregations into single JOINs

const columnConfig = require("./columnConfig");

module.exports = function buildJoins(requested = [], activeFilters = {}) {
  const needed = new Set(requested);

  // Also add any columns used in filters
  for (const key of Object.keys(activeFilters)) {
    const match = key.match(/^(min|max)([A-Z].+)/);
    if (match) {
      const id = match[2].charAt(0).toLowerCase() + match[2].slice(1);
      needed.add(id);
    }
  }

  const joins = [
    `LEFT JOIN price_instants high ON i.id = high.item_id AND high.type = 'high'`,
    `LEFT JOIN price_instants low ON i.id = low.item_id AND low.type = 'low'`,
  ];

  // Check if we need volume aggregations
  const needsVolume = ['volume_5m', 'volume_1h', 'volume_6h', 'volume_24h', 'volume_7d', 'volume_1m']
    .some(id => needed.has(id));
  
  // Check if we need turnover aggregations
  const needsTurnover = ['turnover_5m', 'turnover_1h', 'turnover_6h', 'turnover_24h', 'turnover_7d', 'turnover_1m']
    .some(id => needed.has(id));
  
  // Check if we need buy_sell_rate aggregations
  const needsBuySellRate = ['buy_sell_rate_5m', 'buy_sell_rate_1h', 'buy_sell_rate_6h', 'buy_sell_rate_24h', 'buy_sell_rate_7d']
    .some(id => needed.has(id));

  // Combined volume aggregation (all timeframes in one JOIN)
  if (needsVolume) {
    joins.push(`
      LEFT JOIN LATERAL (
        SELECT 
          (SELECT volume::BIGINT FROM price_5m WHERE item_id = i.id ORDER BY timestamp DESC LIMIT 1) AS volume_5m,
          COALESCE(SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 3600 THEN volume ELSE 0 END), 0)::BIGINT AS volume_1h,
          COALESCE(SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 21600 THEN volume ELSE 0 END), 0)::BIGINT AS volume_6h,
          COALESCE(SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 86400 THEN volume ELSE 0 END), 0)::BIGINT AS volume_24h
        FROM price_5m
        WHERE item_id = i.id
          AND timestamp >= EXTRACT(EPOCH FROM NOW()) - 86400
      ) vol_agg ON true
    `);
    
    // 7d and 1m need different tables
    if (needed.has('volume_7d') || needed.has('volume_1m')) {
      joins.push(`
        LEFT JOIN LATERAL (
          SELECT 
            COALESCE(SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 604800 THEN volume ELSE 0 END), 0)::BIGINT AS volume_7d
          FROM price_1h
          WHERE item_id = i.id
            AND timestamp >= EXTRACT(EPOCH FROM NOW()) - 604800
        ) vol_7d ON true
      `);
      
      if (needed.has('volume_1m')) {
        joins.push(`
          LEFT JOIN LATERAL (
            SELECT 
              COALESCE(SUM(volume), 0)::BIGINT AS volume_1m
            FROM price_6h
            WHERE item_id = i.id
              AND timestamp >= EXTRACT(EPOCH FROM NOW()) - 2592000
          ) vol_1m ON true
        `);
      }
    }
  }

  // Combined turnover aggregation
  if (needsTurnover) {
    const midPriceExpr = `(CASE WHEN p.avg_high IS NOT NULL AND p.avg_low IS NOT NULL THEN (p.avg_high + p.avg_low)/2.0 WHEN p.avg_high IS NOT NULL THEN p.avg_high WHEN p.avg_low IS NOT NULL THEN p.avg_low ELSE NULL END)`;
    
    joins.push(`
      LEFT JOIN LATERAL (
        SELECT 
          (SELECT ROUND(${midPriceExpr} * (p.high_volume + p.low_volume))::BIGINT FROM price_5m p WHERE p.item_id = i.id ORDER BY p.timestamp DESC LIMIT 1) AS turnover_5m,
          ROUND(SUM(CASE WHEN p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 3600 THEN ${midPriceExpr} * (p.high_volume + p.low_volume) ELSE 0 END))::BIGINT AS turnover_1h,
          ROUND(SUM(CASE WHEN p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 21600 THEN ${midPriceExpr} * (p.high_volume + p.low_volume) ELSE 0 END))::BIGINT AS turnover_6h,
          ROUND(SUM(CASE WHEN p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 86400 THEN ${midPriceExpr} * (p.high_volume + p.low_volume) ELSE 0 END))::BIGINT AS turnover_24h
        FROM price_5m p
        WHERE p.item_id = i.id
          AND p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 86400
      ) turn_agg ON true
    `);
    
    if (needed.has('turnover_7d') || needed.has('turnover_1m')) {
      joins.push(`
        LEFT JOIN LATERAL (
          SELECT 
            ROUND(SUM(CASE WHEN p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 604800 THEN ${midPriceExpr} * (p.high_volume + p.low_volume) ELSE 0 END))::BIGINT AS turnover_7d
          FROM price_1h p
          WHERE p.item_id = i.id
            AND p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 604800
        ) turn_7d ON true
      `);
      
      if (needed.has('turnover_1m')) {
        joins.push(`
          LEFT JOIN LATERAL (
            SELECT 
              ROUND(SUM(${midPriceExpr} * (p.high_volume + p.low_volume)))::BIGINT AS turnover_1m
            FROM price_6h p
            WHERE p.item_id = i.id
              AND p.timestamp >= EXTRACT(EPOCH FROM NOW()) - 2592000
          ) turn_1m ON true
        `);
      }
    }
  }

  // Combined buy_sell_rate aggregation
  if (needsBuySellRate) {
    joins.push(`
      LEFT JOIN LATERAL (
        SELECT 
          ROUND((CASE WHEN SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 300 THEN low_volume ELSE 0 END) = 0 THEN NULL ELSE SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 300 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 300 THEN low_volume ELSE 0 END), 0) END)::numeric, 2) AS buy_sell_rate_5m,
          ROUND((CASE WHEN SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 3600 THEN low_volume ELSE 0 END) = 0 THEN NULL ELSE SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 3600 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 3600 THEN low_volume ELSE 0 END), 0) END)::numeric, 2) AS buy_sell_rate_1h,
          ROUND((CASE WHEN SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 21600 THEN low_volume ELSE 0 END) = 0 THEN NULL ELSE SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 21600 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 21600 THEN low_volume ELSE 0 END), 0) END)::numeric, 2) AS buy_sell_rate_6h,
          ROUND((CASE WHEN SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 86400 THEN low_volume ELSE 0 END) = 0 THEN NULL ELSE SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 86400 THEN high_volume ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN timestamp >= EXTRACT(EPOCH FROM NOW()) - 86400 THEN low_volume ELSE 0 END), 0) END)::numeric, 2) AS buy_sell_rate_24h
        FROM price_5m
        WHERE item_id = i.id
          AND timestamp >= EXTRACT(EPOCH FROM NOW()) - 86400
      ) bsr_agg ON true
    `);
    
    if (needed.has('buy_sell_rate_7d')) {
      joins.push(`
        LEFT JOIN LATERAL (
          SELECT 
            ROUND((CASE WHEN SUM(low_volume) = 0 THEN NULL ELSE SUM(high_volume)::numeric / NULLIF(SUM(low_volume), 0) END)::numeric, 2) AS buy_sell_rate_7d
          FROM price_1h
          WHERE item_id = i.id
            AND timestamp >= EXTRACT(EPOCH FROM NOW()) - 604800
        ) bsr_7d ON true
      `);
    }
  }

  // Add any other column-specific JOINs that aren't volume/turnover/buy_sell_rate
  for (const col of columnConfig) {
    if (col.join && needed.has(col.id)) {
      // Skip if already handled by combined aggregations
      if (col.id.startsWith('volume_') || col.id.startsWith('turnover_') || col.id.startsWith('buy_sell_rate_')) {
        continue;
      }
      joins.push(col.join);
    }
  }

  return joins.join("\n");
};








