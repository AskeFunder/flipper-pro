# Canonical Update Performance Optimization

## Changes Made

### 1. Increased Batch Size
- **Before:** 600 items per batch
- **After:** 1000 items per batch
- **Impact:** Fewer round trips, better throughput

### 2. Increased Max Concurrency
- **Before:** 6 parallel batches
- **After:** 12 parallel batches
- **Impact:** Better CPU utilization, faster processing

### 3. Increased Database Pool Size
- **Before:** 15 connections
- **After:** 30 connections
- **Impact:** Supports more parallel batches without connection starvation

## Expected Performance

- **Current:** ~65 items/sec
- **Expected:** ~200-300 items/sec (3-5x improvement)
- **Theoretical max:** ~5000+ items/sec (with optimal conditions)

## Environment Variables

You can override these settings via environment variables:

```bash
# Batch size (default: 1000)
CANONICAL_BATCH_SIZE=1000

# Max parallel batches (default: 12)
CANONICAL_MAX_CONCURRENCY=12

# Database pool max connections (default: 30)
DB_POOL_MAX=30
```

## Monitoring

After deployment, monitor:
- CPU usage (should increase)
- Database connection pool usage
- Performance logs: `[PERF] canonical: X items in Ys → Z/sec`

## Rollback

If performance degrades, you can revert by setting:
```bash
CANONICAL_BATCH_SIZE=600
CANONICAL_MAX_CONCURRENCY=6
DB_POOL_MAX=15
```



