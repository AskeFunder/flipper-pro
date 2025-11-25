// File: /queries/columnConfig/core.js
module.exports = [
    { id: "id" },
    { id: "name" },
    { id: "icon" },
    {
        id: "limit",
        sql: "i.limit",
        filterExpr: "i.limit"
    }
];