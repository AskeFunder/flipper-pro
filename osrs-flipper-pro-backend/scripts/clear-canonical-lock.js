require("dotenv").config();
const { removeLock } = require("../poller/lock-utils");

removeLock("canonical");
console.log("✅ Canonical lock cleared");

