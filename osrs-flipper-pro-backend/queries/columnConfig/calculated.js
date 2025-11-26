// File: /queries/columnConfig/calculated.js
module.exports = [
    {
        id: "margin",
        // Tax is 2% of high price, rounded down to nearest whole number
        sql: `(high.price - FLOOR(high.price * 0.02) - low.price) AS margin`,
        filterExpr: `(high.price - FLOOR(high.price * 0.02) - low.price)`
    },
    {
        id: "roi",
        // Tax is 2% of high price, rounded down to nearest whole number
        sql: `ROUND((high.price - FLOOR(high.price * 0.02) - low.price) * 100.0 / NULLIF(low.price,0), 2) AS roi`,
        filterExpr: `ROUND((high.price - FLOOR(high.price * 0.02) - low.price) * 100.0 / NULLIF(low.price,0), 2)`
    },
    {
        id: "spread",
        sql: `ROUND((high.price - low.price) * 100.0 / NULLIF(high.price,0), 2) AS spread`,
        filterExpr: `ROUND((high.price - low.price) * 100.0 / NULLIF(high.price,0), 2)`
    },
    {
        id: "max_profit",
        // Tax is 2% of high price, rounded down to nearest whole number
        sql: `(CAST((high.price - FLOOR(high.price * 0.02) - low.price) AS BIGINT)) * COALESCE(i.limit::BIGINT,0) AS max_profit`,
        filterExpr: `(CAST((high.price - FLOOR(high.price * 0.02) - low.price) AS BIGINT)) * COALESCE(i.limit::BIGINT,0)`
    },
    {
        id: "max_investment",
        sql: `(low.price::BIGINT * i.limit::BIGINT) AS max_investment`,
        filterExpr: `(low.price::BIGINT * i.limit::BIGINT)`
    }
];