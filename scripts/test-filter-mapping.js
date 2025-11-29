// Test script to verify filter key mappings
const fields = [
    "buy_price", "sell_price", "margin", "roi", "spread",
    "volume_5m", "volume_1h", "volume_6h", "volume_24h", "volume_7d",
    "turnover_5m", "turnover_1h", "turnover_6h", "turnover_24h", "turnover_7d", "turnover_1m",
    "buy_sell_rate_5m", "buy_sell_rate_1h",
    "trend_5m", "trend_1h", "trend_6h", "trend_24h", "trend_7d", "trend_1m",
    "limit", "max_profit", "max_investment",
    "buy_time", "sell_time"
];

const backendFilterMap = {
    minMargin: "margin",
    maxMargin: "margin",
    minRoi: "roi_percent",
    maxRoi: "roi_percent",
    minSpread: "spread_percent",
    maxSpread: "spread_percent",
    minBuyPrice: "low",
    maxBuyPrice: "low",
    minSellPrice: "high",
    maxSellPrice: "high",
    minBuyTime: "low_timestamp",
    maxBuyTime: "low_timestamp",
    minSellTime: "high_timestamp",
    maxSellTime: "high_timestamp",
    minVolume_5m: "volume_5m",
    maxVolume_5m: "volume_5m",
    minVolume_1h: "volume_1h",
    maxVolume_1h: "volume_1h",
    minVolume_6h: "volume_6h",
    maxVolume_6h: "volume_6h",
    minVolume_24h: "volume_24h",
    maxVolume_24h: "volume_24h",
    minVolume_7d: "volume_7d",
    maxVolume_7d: "volume_7d",
    minTurnover_5m: "turnover_5m",
    maxTurnover_5m: "turnover_5m",
    minTurnover_1h: "turnover_1h",
    maxTurnover_1h: "turnover_1h",
    minTurnover_6h: "turnover_6h",
    maxTurnover_6h: "turnover_6h",
    minTurnover_24h: "turnover_24h",
    maxTurnover_24h: "turnover_24h",
    minTurnover_7d: "turnover_7d",
    maxTurnover_7d: "turnover_7d",
    minTurnover_1m: "turnover_1m",
    maxTurnover_1m: "turnover_1m",
    minBuy_sell_rate_5m: "buy_sell_rate_5m",
    maxBuy_sell_rate_5m: "buy_sell_rate_5m",
    minBuy_sell_rate_1h: "buy_sell_rate_1h",
    maxBuy_sell_rate_1h: "buy_sell_rate_1h",
    minTrend_5m: "trend_5m",
    maxTrend_5m: "trend_5m",
    minTrend_1h: "trend_1h",
    maxTrend_1h: "trend_1h",
    minTrend_6h: "trend_6h",
    maxTrend_6h: "trend_6h",
    minTrend_24h: "trend_24h",
    maxTrend_24h: "trend_24h",
    minTrend_7d: "trend_7d",
    maxTrend_7d: "trend_7d",
    minTrend_1m: "trend_1m",
    maxTrend_1m: "trend_1m",
    minLimit: "limit",
    maxLimit: "limit",
    minMax_profit: "max_profit",
    maxMax_profit: "max_profit",
    minMax_investment: "max_investment",
    maxMax_investment: "max_investment"
};

function convertFieldToFilterKey(field, bound) {
    if (field === "buy_price") {
        return bound === "min" ? "minBuyPrice" : "maxBuyPrice";
    } else if (field === "sell_price") {
        return bound === "min" ? "minSellPrice" : "maxSellPrice";
    } else if (field === "buy_time") {
        return bound === "min" ? "minBuyTime" : "maxBuyTime";
    } else if (field === "sell_time") {
        return bound === "min" ? "minSellTime" : "maxSellTime";
    } else if (field === "roi") {
        return bound === "min" ? "minRoi" : "maxRoi";
    } else if (field === "spread") {
        return bound === "min" ? "minSpread" : "maxSpread";
    } else {
        // For fields with underscores, capitalize only the first letter of the entire field name
        const capitalized = field.charAt(0).toUpperCase() + field.slice(1);
        return bound === "min" ? `min${capitalized}` : `max${capitalized}`;
    }
}

console.log("Testing filter key mappings:\n");
let allMatch = true;

for (const field of fields) {
    const minKey = convertFieldToFilterKey(field, "min");
    const maxKey = convertFieldToFilterKey(field, "max");
    const minExists = minKey in backendFilterMap;
    const maxExists = maxKey in backendFilterMap;
    
    if (!minExists || !maxExists) {
        console.log(`❌ ${field}:`);
        console.log(`   min -> ${minKey} ${minExists ? '✓' : '✗'}`);
        console.log(`   max -> ${maxKey} ${maxExists ? '✓' : '✗'}`);
        allMatch = false;
    } else {
        console.log(`✓ ${field} -> ${minKey} / ${maxKey}`);
    }
}

console.log(`\n${allMatch ? '✅ All mappings match!' : '❌ Some mappings are missing!'}`);

