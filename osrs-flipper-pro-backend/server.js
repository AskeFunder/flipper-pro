const express = require('express');
const cors = require('cors');
const app = express();

// 🔧 Port config
const PORT = process.env.PORT || 3001;

// 🌍 Allow frontend on localhost:3002 (React dev server)
app.use(cors({
    origin: 'http://localhost:3000',
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

// 🚀 Start server
app.listen(PORT, () => {
    console.log(`✅ API running at http://localhost:${PORT}`);
});
