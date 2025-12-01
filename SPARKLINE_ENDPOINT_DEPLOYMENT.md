# Sparkline Endpoint Deployment Checklist

## ✅ Code Verification

### Backend Route Exists
- **File**: `routes/prices.js`
- **Route**: `GET /sparkline/:itemId?days=7`
- **Line**: 251-287
- **Status**: ✅ **CONFIRMED** - Route exists in codebase

### Route Implementation
```javascript
router.get('/sparkline/:itemId', async (req, res) => {
    const itemId = parseInt(req.params.itemId, 10);
    const days = parseInt(req.query.days || '7', 10);
    const limit = days * 24; // 168 points for 7 days
    
    // Uses price_1h table
    // Returns array of { timestamp, price }
    // Ordered by timestamp ASC
    // Limited to 168 points (7 days * 24 hours)
});
```

### Router Mounting
- **File**: `server.js`
- **Line**: 107
- **Mount**: `app.use('/api/prices', require('./routes/prices'));`
- **Status**: ✅ **CONFIRMED** - Router is mounted correctly

## 🚀 Deployment Steps

### 1. Pull Latest Code on VM
```bash
cd /path/to/backend
git pull origin production  # or whatever branch prod uses
```

### 2. Verify Route File
```bash
grep -n "sparkline" routes/prices.js
# Should show line 251 with router.get('/sparkline/:itemId'
```

### 3. Restart Node Process

**If using PM2:**
```bash
pm2 restart all
# or
pm2 restart server
```

**If using systemd:**
```bash
sudo systemctl restart flipper-api
# or whatever your service name is
```

**If running directly:**
```bash
# Kill existing process and restart
pkill -f "node server.js"
node server.js
```

### 4. Verify Endpoint

**On VM:**
```bash
curl http://localhost:3001/api/prices/sparkline/4151?days=7
# Should return JSON array, not 404
```

**From Browser/External:**
```
https://api.flipper-pro.com/api/prices/sparkline/4151?days=7
# Should return JSON array, not 404
```

**Expected Response:**
```json
[
  { "timestamp": 1234567890, "price": 1234.56 },
  { "timestamp": 1234567891, "price": 1235.67 },
  ...
]
```

## 🐛 Frontend Fallback (Already Implemented)

### 404 Handling
- ✅ Frontend now silently handles 404s
- ✅ No console spam for missing sparkline data
- ✅ Shows nothing instead of error state
- ✅ Only logs non-404 errors for debugging

### Implementation
- Uses `apiFetch` directly to check status
- 404 → silently set data to null
- Other errors → log once for debugging
- No repeated error messages per row

## ✅ Acceptance Criteria

- [ ] `GET /api/prices/sparkline/4151?days=7` returns 200 OK with JSON array
- [ ] Browse page shows sparklines for items with history
- [ ] No console spam if sparkline data is missing
- [ ] 404s are handled silently (no error logs)

## 🔍 Troubleshooting

### If Still Getting 404:

1. **Check if route file was saved:**
   ```bash
   cat routes/prices.js | grep -A 10 "sparkline"
   ```

2. **Check if server restarted:**
   ```bash
   # Check process uptime
   ps aux | grep "node server.js"
   ```

3. **Check server logs:**
   ```bash
   # PM2 logs
   pm2 logs
   
   # systemd logs
   sudo journalctl -u flipper-api -f
   ```

4. **Test route directly:**
   ```bash
   # Should see route in Express route list
   # Check server startup logs for mounted routes
   ```

5. **Verify database connection:**
   ```bash
   # Route queries price_1h table
   # Ensure table exists and has data
   ```

---

**Status**: Code verified, ready for deployment
**Next Step**: Deploy to production VM and restart server


