// /queries/buildJoins.js

const columnConfig = require("./columnConfig");

module.exports = function buildJoins(requested = [], activeFilters = {}) {
  const needed = new Set(requested);

  // Also add any columns used in filters like minLimit, maxVolume_1h, etc.
  for (const key of Object.keys(activeFilters)) {
    const match = key.match(/^(min|max)([A-Z].+)/); // matches minVolume_1h → Volume_1h
    if (match) {
      const id = match[2].charAt(0).toLowerCase() + match[2].slice(1); // uncapitalize → volume_1h
      needed.add(id);
    }
  }

  const joins = [
    `LEFT JOIN price_instants high ON i.id = high.item_id AND high.type = 'high'`,
    `LEFT JOIN price_instants low ON i.id = low.item_id AND low.type = 'low'`,
  ];

  for (const col of columnConfig) {
    if (col.join && needed.has(col.id)) {
      joins.push(col.join);
    }
  }

  return joins.join("\n");
};
