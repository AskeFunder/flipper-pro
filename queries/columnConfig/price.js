// File: /queries/columnConfig/price.js
module.exports = [
    {
        id: "buy_price",
        sql: "low.price AS buy_price",
        filterExpr: "low.price"
    },
    {
        id: "sell_price",
        sql: "high.price AS sell_price",
        filterExpr: "high.price"
    },
    { id: "buy_time", sql: "low.timestamp AS buy_time" },
    { id: "sell_time", sql: "high.timestamp AS sell_time" }
];