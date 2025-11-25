// File: /queries/columnConfig/calculated.js
module.exports = [
    {
        id: "margin",
        sql: `(FLOOR(high.price * 0.98) - low.price) AS margin`,
        filterExpr: `(FLOOR(high.price * 0.98) - low.price)`
    },
    {
        id: "roi",
        sql: `ROUND((FLOOR(high.price * 0.98) - low.price) * 100.0 / NULLIF(low.price,0), 2) AS roi`,
        filterExpr: `ROUND((FLOOR(high.price * 0.98) - low.price) * 100.0 / NULLIF(low.price,0), 2)`
    },
    {
        id: "spread",
        sql: `ROUND((high.price - low.price) * 100.0 / NULLIF(high.price,0), 2) AS spread`,
        filterExpr: `ROUND((high.price - low.price) * 100.0 / NULLIF(high.price,0), 2)`
    },
    {
        id: "max_profit",
        sql: `(CAST((FLOOR(high.price * 0.98) - low.price) AS BIGINT)) * COALESCE(i.limit::BIGINT,0) AS max_profit`,
        filterExpr: `(CAST((FLOOR(high.price * 0.98) - low.price) AS BIGINT)) * COALESCE(i.limit::BIGINT,0)`
    },
    {
        id: "max_investment",
        sql: `(low.price::BIGINT * i.limit::BIGINT) AS max_investment`,
        filterExpr: `(low.price::BIGINT * i.limit::BIGINT)`
    }
];