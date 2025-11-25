// /queries/selectColumns.js
const columnConfig = require("./columnConfig");

module.exports = function selectColumns(requestedColumns = []) {
    const fallbackSQL = [
        "i.id AS id",
        "i.name AS name",
        "i.icon AS icon",
        "low.timestamp AS buy_time",
        "high.timestamp AS sell_time",
    ];
    const fallbackIds = ["id", "name", "icon", "buy_time", "sell_time"];

    const requestedSet = new Set(
        requestedColumns.length ? [...fallbackIds, ...requestedColumns] : columnConfig.map(col => col.id)
    );

    const selected = columnConfig.filter(col => requestedSet.has(col.id));

    const selectParts = [
        ...fallbackSQL,
        ...selected.filter(col => col.sql).map(col => col.sql)
    ];

    const joins = selected
        .map(col => col.join)
        .filter(Boolean)
        .join("\n");

    return {
        select: selectParts.join(",\n"),
        joins
    };
};
