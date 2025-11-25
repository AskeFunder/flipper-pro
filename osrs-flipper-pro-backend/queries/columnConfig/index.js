// /queries/columnConfig/index.js

const core = require("./core");
const price = require("./price");
const calculated = require("./calculated");
const volume = require("./volume");
const turnover = require("./turnover");
const trend = require("./trend");
const buySellRate = require("./buySellRate");

module.exports = [
    ...core,
    ...price,
    ...calculated,
    ...volume,
    ...turnover,
    ...trend,
    ...buySellRate,
];
