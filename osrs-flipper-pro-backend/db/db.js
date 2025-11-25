// db.js
const { Pool } = require("pg");

const db = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://postgres:Troldmanden6@localhost:5432/flipperpro"
});

module.exports = db;
