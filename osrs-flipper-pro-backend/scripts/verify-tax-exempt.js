require("dotenv").config();
const taxExempt = require("../config/tax-exempt-items");

const items = [
    'Ardougne teleport (tablet)',
    'Camelot teleport (tablet)',
    'Civitas illa fortis teleport (tablet)',
    'Falador teleport (tablet)',
    'Kourend castle teleport (tablet)',
    'Lumbridge teleport (tablet)',
    'Teleport to house (tablet)',
    'Varrock teleport (tablet)',
    'Energy potion(1)',
    'Energy potion(2)',
    'Energy potion(3)',
    'Energy potion(4)'
];

console.log("Checking tax-exempt items:\n");
items.forEach(name => {
    const found = taxExempt.has(name);
    console.log((found ? "✓" : "✗") + " " + name);
});

