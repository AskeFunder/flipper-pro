require('dotenv').config();
const {Pool} = require('pg');
const db = new Pool({connectionString: process.env.DATABASE_URL});
db.query('SELECT MAX(timestamp) FROM price_instants')
  .then(r => {
    console.log('MAX(timestamp):', r.rows[0].max);
    db.end();
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e.message);
    db.end();
    process.exit(1);
  });
