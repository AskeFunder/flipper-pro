require("dotenv").config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

// 🔧 Port config
if (!process.env.PORT) {
    throw new Error('PORT environment variable is required');
}
const PORT = process.env.PORT;

// 🔒 Strict CORS - ONLY allow Netlify origin
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) {
            return callback(null, true);
        }
        const allowedOrigins = [" https://flipper-pro.com\, \https://www.flipper-pro.com\];
 if (allowedOrigins.indexOf(origin) !== -1) {
 callback(null, true);
 } else {
 callback(new Error(\Not allowed by CORS\));
 }
 },
 methods: [\GET\],
 allowedHeaders: [\Content-Type\, \X-FLIPPER-SECRET\]
}));
        const allowedOrigins = [" https://flipper-pro.com\, \https://www.flipper-pro.com\];
 if (allowedOrigins.indexOf(origin) !== -1) {
 callback(null, true);
 } else {
 callback(new Error(\Not allowed by CORS\));
 }
 },
 methods: [\GET\],
 allowedHeaders: [\Content-Type\, \X-FLIPPER-SECRET\]
}));

// 🧠 Parse JSON request bodies
app.use(express.json());

// ✅ Healthcheck endpoint (NOT protected)
app.get('/', (_req, res) => {
    res.send('✅ FlipperPro API is up');
});

// 🗄️ Database health check endpoint (NOT protected)
app.get('/health', async (_req, res) => {
    try {
        const db = require('./db/db');
        const result = await db.query('SELECT NOW() as current_time, version() as db_version');
        res.json({
            status: 'healthy',
            database: 'connected',
            current_time: result.rows[0].current_time,
            db_version: result.rows[0].db_version.split(',')[0] // Just the version number
        });
    } catch (err) {
        res.status(500).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: err.message
        });
    }
});

// 🛡️ Rate limiting for /api routes (120 requests per minute)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 requests per window
    standardHeaders: true,
    legacyHeaders: false
});

// 🔐 Shared-secret protection for /api routes
// Accept secret either as header (for direct calls) or query parameter (for Netlify proxy)
app.use('/api/', (req, res, next) => {
    const secret = req.headers['x-flipper-secret'] || req.query.secret;
    const expectedSecret = process.env.FLIPPER_API_SECRET;
    
    // Debug logging to see actual values (first character only for security)
    if (!secret || secret !== expectedSecret) {
        const secretPreview = secret ? `${secret.substring(0, 8)}...${secret.substring(secret.length - 4)}` : 'MISSING';
        const expectedPreview = expectedSecret ? `${expectedSecret.substring(0, 8)}...${expectedSecret.substring(expectedSecret.length - 4)}` : 'MISSING';
        console.log(`[AUTH] Request to ${req.path}`);
        console.log(`[AUTH] Received secret: ${secretPreview} (length: ${secret ? secret.length : 0})`);
        console.log(`[AUTH] Expected secret: ${expectedPreview} (length: ${expectedSecret ? expectedSecret.length : 0})`);
        console.log(`[AUTH] Match: ${secret === expectedSecret}`);
        console.log(`[AUTH] Header present: ${!!req.headers['x-flipper-secret']}, Query present: ${!!req.query.secret}`);
    }
    
    // Temporarily disable to test if Netlify Function is being called
    // TODO: Re-enable after confirming function works
    console.log(`[AUTH DEBUG] Secret check disabled for testing. Received: ${secret ? 'YES' : 'NO'}, Expected: ${expectedSecret ? 'YES' : 'NO'}`);
    // if (secret !== expectedSecret) {
    //     return res.status(403).json({ error: 'Forbidden' });
    // }
    next();
});

// Apply rate limiting to /api routes
app.use('/api/', apiLimiter);

// 📦 Mount routes under /api
app.use('/api/items', require('./routes/items'));
app.use('/api/items', require('./routes/browse')); // New fast browse endpoint
app.use('/api/prices', require('./routes/prices'));
app.use('/api/changelog', require('./routes/changelog'));

// 🚀 Start server
app.listen(PORT, () => {
    console.log(`✅ API running on port ${PORT}`);
});
