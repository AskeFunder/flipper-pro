require("dotenv").config();
const express = require('express');
const cors = require('cors');
const app = express();

// 🔧 Port config
if (!process.env.PORT) {
    throw new Error('PORT environment variable is required');
}
const PORT = process.env.PORT;

// 🌍 Allow frontend origin from env
app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || '*',
}));

// 🧠 Parse JSON request bodies
app.use(express.json());

// ✅ Healthcheck endpoint
app.get('/', (_req, res) => {
    res.send('✅ FlipperPro API is up');
});

// 📦 Mount routes under /api
app.use('/api/items', require('./routes/items'));
app.use('/api/items', require('./routes/browse')); // New fast browse endpoint
app.use('/api/prices', require('./routes/prices'));
app.use('/api/changelog', require('./routes/changelog'));

// 🚀 Start server
app.listen(PORT, () => {
    console.log(`✅ API running on port ${PORT}`);
});
