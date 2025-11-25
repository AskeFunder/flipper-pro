-- Diagnostic SQL Query for Item 31961 - Trend Analysis
-- Run this query to diagnose why item 31961 has no trends
-- Replace 31961 with any item_id you want to diagnose

WITH 
    item_id AS (SELECT 31961 AS id),
    now_ts AS (SELECT EXTRACT(EPOCH FROM NOW())::INTEGER AS now),
    
    -- Window boundaries for each trend (matching update-canonical-items.js logic)
    windows AS (
        SELECT 
            'trend_5m' AS trend_name, 'price_5m' AS table_name, 300 AS period_secs,
            (SELECT now FROM now_ts) - 300 AS curr_start,
            (SELECT now FROM now_ts) AS curr_end,
            (SELECT now FROM now_ts) - 600 AS prev_start,
            (SELECT now FROM now_ts) - 300 AS prev_end
        UNION ALL
        SELECT 
            'trend_1h' AS trend_name, 'price_5m' AS table_name, 3600 AS period_secs,
            (SELECT now FROM now_ts) - 3600 AS curr_start,
            (SELECT now FROM now_ts) AS curr_end,
            (SELECT now FROM now_ts) - 7200 AS prev_start,
            (SELECT now FROM now_ts) - 3600 AS prev_end
        UNION ALL
        SELECT 
            'trend_6h' AS trend_name, 'price_5m' AS table_name, 21600 AS period_secs,
            (SELECT now FROM now_ts) - 21600 AS curr_start,
            (SELECT now FROM now_ts) AS curr_end,
            (SELECT now FROM now_ts) - 43200 AS prev_start,
            (SELECT now FROM now_ts) - 21600 AS prev_end
        UNION ALL
        SELECT 
            'trend_24h' AS trend_name, 'price_5m' AS table_name, 86400 AS period_secs,
            (SELECT now FROM now_ts) - 86400 AS curr_start,
            (SELECT now FROM now_ts) AS curr_end,
            (SELECT now FROM now_ts) - 172800 AS prev_start,
            (SELECT now FROM now_ts) - 86400 AS prev_end
        UNION ALL
        SELECT 
            'trend_7d' AS trend_name, 'price_1h' AS table_name, 604800 AS period_secs,
            (SELECT now FROM now_ts) - 604800 AS curr_start,
            (SELECT now FROM now_ts) AS curr_end,
            (SELECT now FROM now_ts) - 1209600 AS prev_start,
            (SELECT now FROM now_ts) - 604800 AS prev_end
        UNION ALL
        SELECT 
            'trend_1m' AS trend_name, 'price_6h' AS table_name, 2592000 AS period_secs,
            (SELECT now FROM now_ts) - 2592000 AS curr_start,
            (SELECT now FROM now_ts) AS curr_end,
            (SELECT now FROM now_ts) - 5184000 AS prev_start,
            (SELECT now FROM now_ts) - 2592000 AS prev_end
    )

-- Main diagnostic output
SELECT 
    '=== CURRENT TIME ===' AS section,
    (SELECT now FROM now_ts) AS value,
    to_timestamp((SELECT now FROM now_ts)) AS human_readable,
    NULL::INTEGER AS item_id,
    NULL::TEXT AS table_name,
    NULL::INTEGER AS timestamp,
    NULL::BIGINT AS avg_high,
    NULL::BIGINT AS avg_low,
    NULL::NUMERIC AS mid_price,
    NULL::NUMERIC AS trend_value,
    NULL::TEXT AS issue

UNION ALL

-- Stored trends in canonical_items
SELECT 
    '=== STORED TRENDS ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    item_id,
    'canonical_items' AS table_name,
    NULL AS timestamp,
    NULL AS avg_high,
    NULL AS avg_low,
    NULL AS mid_price,
    trend_5m AS trend_value,
    CASE 
        WHEN trend_5m IS NULL THEN 'trend_5m is NULL'
        ELSE NULL
    END AS issue
FROM canonical_items
WHERE item_id = (SELECT id FROM item_id)

UNION ALL

SELECT 
    '=== STORED TRENDS ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    item_id,
    'canonical_items' AS table_name,
    NULL AS timestamp,
    NULL AS avg_high,
    NULL AS avg_low,
    NULL AS mid_price,
    trend_1h AS trend_value,
    CASE 
        WHEN trend_1h IS NULL THEN 'trend_1h is NULL'
        ELSE NULL
    END AS issue
FROM canonical_items
WHERE item_id = (SELECT id FROM item_id)

UNION ALL

SELECT 
    '=== STORED TRENDS ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    item_id,
    'canonical_items' AS table_name,
    NULL AS timestamp,
    NULL AS avg_high,
    NULL AS avg_low,
    NULL AS mid_price,
    trend_6h AS trend_value,
    CASE 
        WHEN trend_6h IS NULL THEN 'trend_6h is NULL'
        ELSE NULL
    END AS issue
FROM canonical_items
WHERE item_id = (SELECT id FROM item_id)

UNION ALL

SELECT 
    '=== STORED TRENDS ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    item_id,
    'canonical_items' AS table_name,
    NULL AS timestamp,
    NULL AS avg_high,
    NULL AS avg_low,
    NULL AS mid_price,
    trend_24h AS trend_value,
    CASE 
        WHEN trend_24h IS NULL THEN 'trend_24h is NULL'
        ELSE NULL
    END AS issue
FROM canonical_items
WHERE item_id = (SELECT id FROM item_id)

UNION ALL

SELECT 
    '=== STORED TRENDS ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    item_id,
    'canonical_items' AS table_name,
    NULL AS timestamp,
    NULL AS avg_high,
    NULL AS avg_low,
    NULL AS mid_price,
    trend_7d AS trend_value,
    CASE 
        WHEN trend_7d IS NULL THEN 'trend_7d is NULL'
        ELSE NULL
    END AS issue
FROM canonical_items
WHERE item_id = (SELECT id FROM item_id)

UNION ALL

SELECT 
    '=== STORED TRENDS ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    item_id,
    'canonical_items' AS table_name,
    NULL AS timestamp,
    NULL AS avg_high,
    NULL AS avg_low,
    NULL AS mid_price,
    trend_1m AS trend_value,
    CASE 
        WHEN trend_1m IS NULL THEN 'trend_1m is NULL'
        ELSE NULL
    END AS issue
FROM canonical_items
WHERE item_id = (SELECT id FROM item_id)

UNION ALL

-- Data availability check
SELECT 
    '=== DATA COUNT ===' AS section,
    COUNT(*)::INTEGER AS value,
    NULL AS human_readable,
    (SELECT id FROM item_id) AS item_id,
    'price_5m' AS table_name,
    NULL AS timestamp,
    NULL AS avg_high,
    NULL AS avg_low,
    NULL AS mid_price,
    NULL AS trend_value,
    CASE 
        WHEN COUNT(*) = 0 THEN 'NO DATA in price_5m table'
        ELSE NULL
    END AS issue
FROM price_5m
WHERE item_id = (SELECT id FROM item_id)

UNION ALL

SELECT 
    '=== DATA COUNT ===' AS section,
    COUNT(*)::INTEGER AS value,
    NULL AS human_readable,
    (SELECT id FROM item_id) AS item_id,
    'price_1h' AS table_name,
    NULL AS timestamp,
    NULL AS avg_high,
    NULL AS avg_low,
    NULL AS mid_price,
    NULL AS trend_value,
    CASE 
        WHEN COUNT(*) = 0 THEN 'NO DATA in price_1h table'
        ELSE NULL
    END AS issue
FROM price_1h
WHERE item_id = (SELECT id FROM item_id)

UNION ALL

SELECT 
    '=== DATA COUNT ===' AS section,
    COUNT(*)::INTEGER AS value,
    NULL AS human_readable,
    (SELECT id FROM item_id) AS item_id,
    'price_6h' AS table_name,
    NULL AS timestamp,
    NULL AS avg_high,
    NULL AS avg_low,
    NULL AS mid_price,
    NULL AS trend_value,
    CASE 
        WHEN COUNT(*) = 0 THEN 'NO DATA in price_6h table'
        ELSE NULL
    END AS issue
FROM price_6h
WHERE item_id = (SELECT id FROM item_id)

UNION ALL

-- Latest data points
SELECT 
    '=== LATEST DATA ===' AS section,
    NULL AS value,
    to_timestamp(timestamp) AS human_readable,
    item_id,
    'price_5m' AS table_name,
    timestamp,
    avg_high,
    avg_low,
    CASE 
        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
        WHEN avg_high IS NOT NULL THEN avg_high
        WHEN avg_low IS NOT NULL THEN avg_low
        ELSE NULL
    END AS mid_price,
    NULL AS trend_value,
    CASE 
        WHEN avg_high IS NULL AND avg_low IS NULL THEN 'Both avg_high and avg_low are NULL'
        WHEN avg_high IS NULL THEN 'avg_high is NULL'
        WHEN avg_low IS NULL THEN 'avg_low is NULL'
        ELSE NULL
    END AS issue
FROM price_5m
WHERE item_id = (SELECT id FROM item_id)
ORDER BY timestamp DESC
LIMIT 1

UNION ALL

SELECT 
    '=== LATEST DATA ===' AS section,
    NULL AS value,
    to_timestamp(timestamp) AS human_readable,
    item_id,
    'price_1h' AS table_name,
    timestamp,
    avg_high,
    avg_low,
    CASE 
        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
        WHEN avg_high IS NOT NULL THEN avg_high
        WHEN avg_low IS NOT NULL THEN avg_low
        ELSE NULL
    END AS mid_price,
    NULL AS trend_value,
    CASE 
        WHEN avg_high IS NULL AND avg_low IS NULL THEN 'Both avg_high and avg_low are NULL'
        WHEN avg_high IS NULL THEN 'avg_high is NULL'
        WHEN avg_low IS NULL THEN 'avg_low is NULL'
        ELSE NULL
    END AS issue
FROM price_1h
WHERE item_id = (SELECT id FROM item_id)
ORDER BY timestamp DESC
LIMIT 1

UNION ALL

SELECT 
    '=== LATEST DATA ===' AS section,
    NULL AS value,
    to_timestamp(timestamp) AS human_readable,
    item_id,
    'price_6h' AS table_name,
    timestamp,
    avg_high,
    avg_low,
    CASE 
        WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
        WHEN avg_high IS NOT NULL THEN avg_high
        WHEN avg_low IS NOT NULL THEN avg_low
        ELSE NULL
    END AS mid_price,
    NULL AS trend_value,
    CASE 
        WHEN avg_high IS NULL AND avg_low IS NULL THEN 'Both avg_high and avg_low are NULL'
        WHEN avg_high IS NULL THEN 'avg_high is NULL'
        WHEN avg_low IS NULL THEN 'avg_low is NULL'
        ELSE NULL
    END AS issue
FROM price_6h
WHERE item_id = (SELECT id FROM item_id)
ORDER BY timestamp DESC
LIMIT 1

UNION ALL

-- Trend 5m diagnostic
SELECT 
    '=== TREND: trend_5m ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    (SELECT id FROM item_id) AS item_id,
    'price_5m' AS table_name,
    NULL AS timestamp,
    curr.avg_high,
    curr.avg_low,
    curr.mid AS mid_price,
    CASE 
        WHEN prev.mid IS NULL OR prev.mid = 0 THEN NULL
        WHEN curr.mid IS NULL THEN NULL
        ELSE ROUND(100.0 * (curr.mid - prev.mid) / prev.mid, 2)
    END AS trend_value,
    CASE 
        WHEN curr.mid IS NULL THEN 'CURRENT price is NULL (no data in window: ' || w.curr_start || ' to ' || w.curr_end || ')'
        WHEN prev.mid IS NULL THEN 'PREVIOUS price is NULL (no data in window: ' || w.prev_start || ' to ' || w.prev_end || ')'
        WHEN prev.mid = 0 THEN 'PREVIOUS price is ZERO (cannot calculate)'
        ELSE NULL
    END AS issue
FROM windows w
CROSS JOIN now_ts
CROSS JOIN item_id
LEFT JOIN LATERAL (
    SELECT 
        avg_high,
        avg_low,
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_5m
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.curr_start AND timestamp <= w.curr_end
    ORDER BY timestamp DESC
    LIMIT 1
) curr ON true
LEFT JOIN LATERAL (
    SELECT 
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_5m
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.prev_start AND timestamp <= w.prev_end
    ORDER BY timestamp DESC
    LIMIT 1
) prev ON true
WHERE w.trend_name = 'trend_5m'

UNION ALL

-- Trend 1h diagnostic
SELECT 
    '=== TREND: trend_1h ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    (SELECT id FROM item_id) AS item_id,
    'price_5m' AS table_name,
    NULL AS timestamp,
    curr.avg_high,
    curr.avg_low,
    curr.mid AS mid_price,
    CASE 
        WHEN prev.mid IS NULL OR prev.mid = 0 THEN NULL
        WHEN curr.mid IS NULL THEN NULL
        ELSE ROUND(100.0 * (curr.mid - prev.mid) / prev.mid, 2)
    END AS trend_value,
    CASE 
        WHEN curr.mid IS NULL THEN 'CURRENT price is NULL (no data in window: ' || w.curr_start || ' to ' || w.curr_end || ')'
        WHEN prev.mid IS NULL THEN 'PREVIOUS price is NULL (no data in window: ' || w.prev_start || ' to ' || w.prev_end || ')'
        WHEN prev.mid = 0 THEN 'PREVIOUS price is ZERO (cannot calculate)'
        ELSE NULL
    END AS issue
FROM windows w
CROSS JOIN now_ts
CROSS JOIN item_id
LEFT JOIN LATERAL (
    SELECT 
        avg_high,
        avg_low,
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_5m
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.curr_start AND timestamp <= w.curr_end
    ORDER BY timestamp DESC
    LIMIT 1
) curr ON true
LEFT JOIN LATERAL (
    SELECT 
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_5m
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.prev_start AND timestamp <= w.prev_end
    ORDER BY timestamp DESC
    LIMIT 1
) prev ON true
WHERE w.trend_name = 'trend_1h'

UNION ALL

-- Trend 6h diagnostic
SELECT 
    '=== TREND: trend_6h ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    (SELECT id FROM item_id) AS item_id,
    'price_5m' AS table_name,
    NULL AS timestamp,
    curr.avg_high,
    curr.avg_low,
    curr.mid AS mid_price,
    CASE 
        WHEN prev.mid IS NULL OR prev.mid = 0 THEN NULL
        WHEN curr.mid IS NULL THEN NULL
        ELSE ROUND(100.0 * (curr.mid - prev.mid) / prev.mid, 2)
    END AS trend_value,
    CASE 
        WHEN curr.mid IS NULL THEN 'CURRENT price is NULL (no data in window: ' || w.curr_start || ' to ' || w.curr_end || ')'
        WHEN prev.mid IS NULL THEN 'PREVIOUS price is NULL (no data in window: ' || w.prev_start || ' to ' || w.prev_end || ')'
        WHEN prev.mid = 0 THEN 'PREVIOUS price is ZERO (cannot calculate)'
        ELSE NULL
    END AS issue
FROM windows w
CROSS JOIN now_ts
CROSS JOIN item_id
LEFT JOIN LATERAL (
    SELECT 
        avg_high,
        avg_low,
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_5m
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.curr_start AND timestamp <= w.curr_end
    ORDER BY timestamp DESC
    LIMIT 1
) curr ON true
LEFT JOIN LATERAL (
    SELECT 
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_5m
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.prev_start AND timestamp <= w.prev_end
    ORDER BY timestamp DESC
    LIMIT 1
) prev ON true
WHERE w.trend_name = 'trend_6h'

UNION ALL

-- Trend 24h diagnostic
SELECT 
    '=== TREND: trend_24h ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    (SELECT id FROM item_id) AS item_id,
    'price_5m' AS table_name,
    NULL AS timestamp,
    curr.avg_high,
    curr.avg_low,
    curr.mid AS mid_price,
    CASE 
        WHEN prev.mid IS NULL OR prev.mid = 0 THEN NULL
        WHEN curr.mid IS NULL THEN NULL
        ELSE ROUND(100.0 * (curr.mid - prev.mid) / prev.mid, 2)
    END AS trend_value,
    CASE 
        WHEN curr.mid IS NULL THEN 'CURRENT price is NULL (no data in window: ' || w.curr_start || ' to ' || w.curr_end || ')'
        WHEN prev.mid IS NULL THEN 'PREVIOUS price is NULL (no data in window: ' || w.prev_start || ' to ' || w.prev_end || ')'
        WHEN prev.mid = 0 THEN 'PREVIOUS price is ZERO (cannot calculate)'
        ELSE NULL
    END AS issue
FROM windows w
CROSS JOIN now_ts
CROSS JOIN item_id
LEFT JOIN LATERAL (
    SELECT 
        avg_high,
        avg_low,
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_5m
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.curr_start AND timestamp <= w.curr_end
    ORDER BY timestamp DESC
    LIMIT 1
) curr ON true
LEFT JOIN LATERAL (
    SELECT 
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_5m
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.prev_start AND timestamp <= w.prev_end
    ORDER BY timestamp DESC
    LIMIT 1
) prev ON true
WHERE w.trend_name = 'trend_24h'

UNION ALL

-- Trend 7d diagnostic (uses price_1h)
SELECT 
    '=== TREND: trend_7d ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    (SELECT id FROM item_id) AS item_id,
    'price_1h' AS table_name,
    NULL AS timestamp,
    curr.avg_high,
    curr.avg_low,
    curr.mid AS mid_price,
    CASE 
        WHEN prev.mid IS NULL OR prev.mid = 0 THEN NULL
        WHEN curr.mid IS NULL THEN NULL
        ELSE ROUND(100.0 * (curr.mid - prev.mid) / prev.mid, 2)
    END AS trend_value,
    CASE 
        WHEN curr.mid IS NULL THEN 'CURRENT price is NULL (no data in window: ' || w.curr_start || ' to ' || w.curr_end || ')'
        WHEN prev.mid IS NULL THEN 'PREVIOUS price is NULL (no data in window: ' || w.prev_start || ' to ' || w.prev_end || ')'
        WHEN prev.mid = 0 THEN 'PREVIOUS price is ZERO (cannot calculate)'
        ELSE NULL
    END AS issue
FROM windows w
CROSS JOIN now_ts
CROSS JOIN item_id
LEFT JOIN LATERAL (
    SELECT 
        avg_high,
        avg_low,
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_1h
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.curr_start AND timestamp <= w.curr_end
    ORDER BY timestamp DESC
    LIMIT 1
) curr ON true
LEFT JOIN LATERAL (
    SELECT 
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_1h
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.prev_start AND timestamp <= w.prev_end
    ORDER BY timestamp DESC
    LIMIT 1
) prev ON true
WHERE w.trend_name = 'trend_7d'

UNION ALL

-- Trend 1m diagnostic (uses price_6h)
SELECT 
    '=== TREND: trend_1m ===' AS section,
    NULL AS value,
    NULL AS human_readable,
    (SELECT id FROM item_id) AS item_id,
    'price_6h' AS table_name,
    NULL AS timestamp,
    curr.avg_high,
    curr.avg_low,
    curr.mid AS mid_price,
    CASE 
        WHEN prev.mid IS NULL OR prev.mid = 0 THEN NULL
        WHEN curr.mid IS NULL THEN NULL
        ELSE ROUND(100.0 * (curr.mid - prev.mid) / prev.mid, 2)
    END AS trend_value,
    CASE 
        WHEN curr.mid IS NULL THEN 'CURRENT price is NULL (no data in window: ' || w.curr_start || ' to ' || w.curr_end || ')'
        WHEN prev.mid IS NULL THEN 'PREVIOUS price is NULL (no data in window: ' || w.prev_start || ' to ' || w.prev_end || ')'
        WHEN prev.mid = 0 THEN 'PREVIOUS price is ZERO (cannot calculate)'
        ELSE NULL
    END AS issue
FROM windows w
CROSS JOIN now_ts
CROSS JOIN item_id
LEFT JOIN LATERAL (
    SELECT 
        avg_high,
        avg_low,
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_6h
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.curr_start AND timestamp <= w.curr_end
    ORDER BY timestamp DESC
    LIMIT 1
) curr ON true
LEFT JOIN LATERAL (
    SELECT 
        CASE 
            WHEN avg_high IS NOT NULL AND avg_low IS NOT NULL THEN (avg_high + avg_low) / 2.0
            WHEN avg_high IS NOT NULL THEN avg_high
            WHEN avg_low IS NOT NULL THEN avg_low
            ELSE NULL
        END AS mid
    FROM price_6h
    WHERE item_id = (SELECT id FROM item_id)
      AND timestamp > w.prev_start AND timestamp <= w.prev_end
    ORDER BY timestamp DESC
    LIMIT 1
) prev ON true
WHERE w.trend_name = 'trend_1m'

ORDER BY section, table_name, timestamp DESC NULLS LAST;






