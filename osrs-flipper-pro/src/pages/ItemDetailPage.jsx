import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import {
    Chart as ChartJS,
    LineElement,
    PointElement,
    BarElement,
    BarController,
    LinearScale,
    CategoryScale,
    TimeScale,
    Legend,
    Tooltip,
} from "chart.js";
import 'chartjs-adapter-date-fns';
import {
    formatCompact,
    formatPriceFull,
    formatColoredNumber,
    formatRoi,
    timeAgo,
} from "../utils/formatting";
import { taxExemptItems } from "../config/taxExemptItems";
import { apiFetch, apiFetchJson } from "../utils/api";
import TradeList from "../components/TradeList";
import PriceChart from "../components/PriceChart";
import { useMobile } from "../hooks/useMobile";

ChartJS.register(
    LineElement,
    PointElement,
    BarElement,
    BarController,
    LinearScale,
    CategoryScale,
    TimeScale,
    Legend,
    Tooltip
);

// Register custom plugin for vertical line on hover
ChartJS.register({
    id: 'verticalLine',
    afterDraw: (chart) => {
        if (
            !chart ||
            !chart.tooltip ||
            !chart.tooltip._active ||
            chart.tooltip._active.length === 0 ||
            !chart.scales ||
            !chart.scales.y
        ) {
            return;
        }
        
        const ctx = chart.ctx;
        const x = chart.tooltip._active[0].element.x;
        const topY = chart.scales.y.top;
        const bottomY = chart.scales.y.bottom;
        
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.restore();
    }
});

// Register custom plugin to store cursor position for 4h chart tooltip filtering
ChartJS.register({
    id: 'storeCursorPosition',
    afterEvent: (chart, args) => {
        // Store cursor X and Y position (kept for potential future use)
        const event = args.event;
        if (event && event.x != null && event.y != null) {
            chart.cursorX = event.x;
            chart.cursorY = event.y;
        }
    },
    beforeTooltipDraw: (chart) => {
        
        // Fallback: if cursor position not set, try to get it from tooltip active elements
        if ((chart.cursorX == null || chart.cursorY == null) && chart.tooltip && chart.tooltip._active && chart.tooltip._active.length > 0) {
            // Use the first active element's position as cursor approximation
            const firstElement = chart.tooltip._active[0].element;
            if (firstElement) {
                chart.cursorX = firstElement.x;
                chart.cursorY = firstElement.y;
            }
        }
        
        // Also store cursor timestamp for backward compatibility
        if (chart.tooltip && chart.tooltip._active && chart.tooltip._active.length > 0) {
            const cursorX = chart.tooltip._active[0].element.x;
            const xScale = chart.scales.x;
            if (xScale) {
                // Convert cursor pixel position to timestamp
                chart.cursorTimestamp = xScale.getValueForPixel(cursorX);
            }
        }
    }
});

// Register custom plugin to draw vertical grid lines only at tick positions
ChartJS.register({
    id: 'tickGridLines',
    afterDraw: (chart) => {
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        
        if (!xScale || !yScale || !chart.chartArea) return;
        
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        
        // Get all tick positions from the scale
        const ticks = xScale.ticks;
        if (ticks && ticks.length > 0) {
            ticks.forEach((tick) => {
                const x = xScale.getPixelForValue(tick.value);
                // Only draw if within chart area
                if (x >= chart.chartArea.left && x <= chart.chartArea.right) {
                    ctx.beginPath();
                    ctx.moveTo(x, chart.chartArea.top);
                    ctx.lineTo(x, chart.chartArea.bottom);
                    ctx.stroke();
                }
            });
        }
        
        ctx.restore();
    }
});

// Drag-to-zoom plugin is now registered in PriceChart component

// Register custom plugin to align bars with exact timestamps and ensure consistent thickness
ChartJS.register({
    id: 'alignBarsToTimestamps',
    afterLayout: (chart) => {
        // Find the volume bar dataset
        const volumeDatasetIndex = chart.data.datasets.findIndex(d => d.label === 'Volume');
        if (volumeDatasetIndex === -1) return;
        
        const meta = chart.getDatasetMeta(volumeDatasetIndex);
        if (!meta || meta.type !== 'bar') return;
        
        const xScale = chart.scales.x;
        const dataset = chart.data.datasets[volumeDatasetIndex];
        
        // Calculate consistent bar width based on average spacing of valid data points
        const validDataPoints = dataset.data.filter(d => d && d.x != null);
        if (validDataPoints.length < 2) return;
        
        // Calculate average time interval
        const intervals = [];
        for (let i = 1; i < validDataPoints.length; i++) {
            const interval = validDataPoints[i].x - validDataPoints[i-1].x;
            if (interval > 0) intervals.push(interval);
        }
        const avgInterval = intervals.length > 0 
            ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
            : 0;
        
        // Calculate bar width in pixels (80% of average interval)
        const barWidthPx = avgInterval > 0 
            ? (xScale.getPixelForValue(validDataPoints[0].x + avgInterval) - xScale.getPixelForValue(validDataPoints[0].x)) * 0.8
            : 20;
        
        // Update each bar position and width (skip NaN/invalid values)
        meta.data.forEach((bar, index) => {
            const dataPoint = dataset.data[index];
            if (!dataPoint || dataPoint.x == null || isNaN(dataPoint.y) || (dataPoint.rawVolume === 0)) {
                // Hide bars for NaN/invalid values or zero volume
                bar.hidden = true;
                return;
            }
            
            // Get the exact x position for this timestamp
            const exactX = xScale.getPixelForValue(dataPoint.x);
            
            // Update bar position and width
            bar.x = exactX;
            bar.width = Math.max(2, barWidthPx);
            bar.hidden = false;
        });
    }
});

// API_BASE is now handled by apiFetch helper

const GRANULARITY_OPTIONS = ['5m', '1h', '6h', '24h', '1w', '1m', '3m', '1y'];

const timeOptions = [
    { label: '4H', ms: 4 * 3600e3, granularity: '4h' },
    { label: '12H', ms: 12 * 3600e3, granularity: '5m' },
    { label: '1D', ms: 24 * 3600e3, granularity: '5m' },
    { label: '1W', ms: 7 * 24 * 3600e3, granularity: '1h' },
    { label: '1M', ms: 30 * 24 * 3600e3 + 6 * 3600e3, granularity: '6h' }, // 30 days + 6 hours
    { label: '3M', ms: 90 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' }, // 90 days + 24 hours
    { label: '1Y', ms: 365 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' }, // 365 days + 24 hours
    { label: 'All', ms: 0, granularity: '24h' },
];

// Granularity step map - extra time to pull backward for proper candle alignment
const granularityStepByRange = {
    '12H': 5 * 60 * 1000,      // 5m in milliseconds
    '1D': 5 * 60 * 1000,        // 5m in milliseconds (24h = 1D)
    '1W': 60 * 60 * 1000,       // 1h in milliseconds
    '1M': 6 * 60 * 60 * 1000,   // 6h in milliseconds
    '3M': 24 * 60 * 60 * 1000,  // 24h in milliseconds
    '1Y': 24 * 60 * 60 * 1000,  // 24h in milliseconds
};

const baseIconURL = "https://oldschool.runescape.wiki/images/thumb";

export default function ItemDetailPage() {
    const { itemId } = useParams();
    // itemId can be either:
    // 1. "4151-abyssal-whip" (ID-slug format - preferred)
    // 2. "abyssal-whip" (slug only - backward compatible)
    let numericItemId = null;
    let itemNameSlug = null;
    
    if (itemId) {
        const decoded = decodeURIComponent(itemId);
        // Check if it starts with a number (ID-slug format)
        const match = decoded.match(/^(\d+)-(.+)$/);
        if (match) {
            numericItemId = parseInt(match[1], 10);
            itemNameSlug = match[2];
        } else {
            // Backward compatible: slug only
            itemNameSlug = decoded;
        }
    }

    // Section 1 - Basic (Live Market Data)
    const [basicData, setBasicData] = useState(null);
    const [basicLoading, setBasicLoading] = useState(true);

    // Section 2 - Advanced (Granularity-Based)
    const [canonicalData, setCanonicalData] = useState(null);
    const [selectedGranularity, setSelectedGranularity] = useState('5m');
    const [advancedLoading, setAdvancedLoading] = useState(true);

    // Mobile detection
    const isMobile = useMobile();
    
    // Chart and Recent Trades
    const [priceData, setPriceData] = useState([]);
    const [recentTrades, setRecentTrades] = useState([]);
    const [timeRange, setTimeRange] = useState('12H');
    
    // Cache chart data per granularity to prevent stuttering when switching
    const chartDataCacheRef = useRef({});
    const fetchedItemIdRef = useRef(null); // Track which item_id we've fetched for
    const lastItemIdRef = useRef(null); // Track last item_id to prevent unnecessary re-runs
    
    // Zoom state
    const [zoomBounds, setZoomBounds] = useState({ min: null, max: null });
    const [chartKey, setChartKey] = useState(0);
    const chartRef = useRef(null);

    // Fetch canonical data first to get item_id and limit
    // Note: Canonical data rarely changes, so we only fetch once on mount/param change
    useEffect(() => {
        if (!numericItemId && !itemNameSlug) return;

        const fetchCanonical = async () => {
            try {
                // Prefer ID lookup if available (more reliable)
                const apiParam = numericItemId ? numericItemId : encodeURIComponent(itemNameSlug);
                const res = await apiFetch(`/api/items/canonical/${apiParam}`);
                if (res.ok) {
                    const data = await res.json();
                    // Debug: log trend_6h to see if it's in the response
                    if (data.item_id === 2351) {
                        console.log('[ItemDetailPage] Canonical data for Iron Bar:', {
                            trend_6h: data.trend_6h,
                            trend_5m: data.trend_5m,
                            trend_1h: data.trend_1h,
                            trend_24h: data.trend_24h
                        });
                    }
                    setCanonicalData(data);
                    setAdvancedLoading(false);
                } else {
                    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
                    console.error("Error fetching canonical data:", res.status, errorData);
                    setAdvancedLoading(false);
                }
            } catch (err) {
                console.error("Error fetching canonical data:", err);
                setAdvancedLoading(false);
            }
        };

        fetchCanonical();
        // Canonical data rarely changes, so we don't poll it
    }, [numericItemId, itemNameSlug]);

    // Fetch basic (live) data from /api/prices/latest/:id
    useEffect(() => {
        if (!canonicalData || !canonicalData.item_id) return;

        const fetchBasic = async () => {
            try {
                const res = await apiFetch(`/api/prices/latest/${canonicalData.item_id}`);
                if (res.ok) {
                    const data = await res.json();
                    
                    // Calculate required fields from instant prices
                    const high = data.high;
                    const low = data.low;
                    const high_timestamp = data.ts; // high timestamp
                    const low_timestamp = data.lowTs; // low timestamp
                    
                    // Only calculate if we have both high and low
                    let margin = null;
                    let roi_percent = null;
                    let spread_percent = null;
                    let max_profit = null;
                    let max_investment = null;
                    const limit = canonicalData.limit || null; // From items table (via canonical_items)
                    
                    if (high != null && low != null) {
                        // Tax is 2% of high price, rounded down to nearest whole number (unless item is tax-exempt)
                        const isTaxExempt = canonicalData.name && taxExemptItems.has(canonicalData.name);
                        const tax = isTaxExempt ? 0 : Math.floor(high * 0.02);
                        margin = high - tax - low;
                        roi_percent = low > 0 ? (margin / low) * 100 : 0;
                        spread_percent = high > 0 ? ((high - low) / high) * 100 : 0;
                        max_profit = margin * (limit || 0);
                        max_investment = low * (limit || 0);
                    }

                    setBasicData({
                        high,
                        low,
                        high_timestamp,
                        low_timestamp,
                        margin,
                        roi_percent,
                        spread_percent,
                        limit,
                        max_profit,
                        max_investment,
                    });
                    setBasicLoading(false);
                } else {
                    console.error("Error fetching basic data:", res.status);
                    setBasicLoading(false);
                }
            } catch (err) {
                console.error("Error fetching basic data:", err);
                setBasicLoading(false);
            }
        };

        // Stagger initial fetch slightly to avoid simultaneous requests
        const initialTimeout = setTimeout(fetchBasic, 50);
        // Update every 15 seconds
        const interval = setInterval(fetchBasic, 15000);
        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [canonicalData]);

    // Fetch all granularities at once on mount/change
    useEffect(() => {
        if (!canonicalData || !canonicalData.item_id) return;

        const itemId = canonicalData.item_id;
        
        // If this is the same item_id as last time, skip entirely (only update from cache)
        if (lastItemIdRef.current === itemId) {
            // Same item, just update priceData from cache when timeRange changes
        const selected = timeOptions.find(o => o.label === timeRange);
            const currentGranularity = selected ? selected.granularity : '5m';
            const currentCacheKey = `${itemId}-${currentGranularity}`;
            const currentData = chartDataCacheRef.current[currentCacheKey];
            if (currentData) {
                setPriceData(currentData);
            }
            return; // Don't fetch, don't set up polling - same item
        }
        
        // New item_id, mark it
        lastItemIdRef.current = itemId;
        
        const granularities = ['4h', '5m', '1h', '6h', '24h'];

        // Check if we've already fetched all granularities for this item
        const allCached = granularities.every(granularity => {
            const cacheKey = `${itemId}-${granularity}`;
            return chartDataCacheRef.current[cacheKey] && chartDataCacheRef.current[cacheKey].length > 0;
        });

        // If all are cached, skip fetch entirely (just update priceData from cache)
        if (allCached) {
            const selected = timeOptions.find(o => o.label === timeRange);
            const currentGranularity = selected ? selected.granularity : '5m';
            const currentCacheKey = `${itemId}-${currentGranularity}`;
            const currentData = chartDataCacheRef.current[currentCacheKey];
            if (currentData) {
                setPriceData(currentData);
            }
            return; // Don't fetch, don't set up polling - data is already cached
        }

        // Mark that we're fetching for this item_id
        fetchedItemIdRef.current = itemId;

        // Fetch all granularities in parallel (only missing ones)
        const missingGranularities = granularities.filter(granularity => {
            const cacheKey = `${itemId}-${granularity}`;
            return !chartDataCacheRef.current[cacheKey] || chartDataCacheRef.current[cacheKey].length === 0;
        });
        
        if (missingGranularities.length > 0) {
            // Fetch only missing granularities
            const promises = missingGranularities.map(granularity => 
                apiFetchJson(`/api/prices/chart/${granularity}/${itemId}`)
                    .then(data => ({ granularity, data: data || [] }))
                    .catch(err => {
                        console.error(`Error fetching ${granularity}:`, err);
                        return { granularity, data: [] };
                    })
            );
            
            Promise.all(promises).then(results => {
                // Cache all results
                results.forEach(({ granularity, data }) => {
                    const cacheKey = `${itemId}-${granularity}`;
                    chartDataCacheRef.current[cacheKey] = data;
                });
                
                // Update current priceData if it matches current timeRange
                const selected = timeOptions.find(o => o.label === timeRange);
                const currentGranularity = selected ? selected.granularity : '5m';
                const currentCacheKey = `${itemId}-${currentGranularity}`;
                const currentData = chartDataCacheRef.current[currentCacheKey];
                if (currentData) {
                    setPriceData(currentData);
                }
            });
        }
        
        // Poll all granularities every 15 seconds (always fetch to update data)
        const interval = setInterval(() => {
            // For polling, always fetch to get fresh data
            const currentItemId = canonicalData?.item_id;
            if (!currentItemId) return;
            
            const promises = granularities.map(granularity => 
                apiFetchJson(`/api/prices/chart/${granularity}/${currentItemId}`)
                    .then(data => ({ granularity, data: data || [] }))
                    .catch(err => {
                        console.error(`Error fetching ${granularity}:`, err);
                        return { granularity, data: [] };
                    })
            );
            
            Promise.all(promises).then(results => {
                results.forEach(({ granularity, data }) => {
                    const cacheKey = `${currentItemId}-${granularity}`;
                    chartDataCacheRef.current[cacheKey] = data;
                });
                
                // Update current priceData if it matches current timeRange
                const selected = timeOptions.find(o => o.label === timeRange);
                const currentGranularity = selected ? selected.granularity : '5m';
                const currentCacheKey = `${currentItemId}-${currentGranularity}`;
                const currentData = chartDataCacheRef.current[currentCacheKey];
                if (currentData) {
                    setPriceData(currentData);
                }
            });
        }, 15000);
        
        return () => {
            clearInterval(interval);
        };
    }, [canonicalData?.item_id]); // Only depend on item_id, not entire canonicalData object

    // When timeRange changes, use cached data immediately
    useEffect(() => {
        if (!canonicalData || !canonicalData.item_id) return;
        
        const selected = timeOptions.find(o => o.label === timeRange);
        const granularity = selected ? selected.granularity : '5m';
        const cacheKey = `${canonicalData.item_id}-${granularity}`;
        
        const cached = chartDataCacheRef.current[cacheKey];
        if (cached) {
            setPriceData(cached);
        }
    }, [timeRange, canonicalData]);

    // Fetch recent trades
    useEffect(() => {
        if (!canonicalData || !canonicalData.item_id) return;

        const fetchRecent = () => {
            apiFetchJson(`/api/prices/recent/${canonicalData.item_id}`)
                .then(setRecentTrades)
                .catch(console.error);
        };

        // Stagger initial fetch slightly to avoid simultaneous requests
        const initialTimeout = setTimeout(fetchRecent, 150);
        const int = setInterval(fetchRecent, 15000);
        return () => {
            clearTimeout(initialTimeout);
            clearInterval(int);
        };
    }, [canonicalData]);
    
    // Zoom callback is now handled directly via onZoomChange prop in PriceChart component
    
    // Always reset zoom bounds when granularity changes
    useEffect(() => {
        setZoomBounds({ min: null, max: null });
    }, [selectedGranularity]);
    
    // Always reset zoom bounds when time range changes
    useEffect(() => {
        setZoomBounds({ min: null, max: null });
    }, [timeRange]);
    
    // Drag-to-zoom is now handled entirely by PriceChart component

    if (basicLoading || advancedLoading) {
        return (
            <div style={{ padding: "2rem", fontFamily: "'Inter',sans-serif" }}>
                <p>Loading item data...</p>
            </div>
        );
    }

    if (!canonicalData) {
        return (
            <div style={{ padding: "2rem", fontFamily: "'Inter',sans-serif" }}>
                <p>Item not found</p>
            </div>
        );
    }

    const icon = canonicalData.icon || `${canonicalData.name}.png`;
    const safe = encodeURIComponent(icon.replace(/ /g, "_"));

    // Get metrics for selected granularity from canonical data
    const getGranularityMetrics = (gran) => {
        if (!canonicalData) {
            return {
                volume: null,
                turnover: null,
                trend: null,
                buy_sell_rate: null,
                price_high: null,
                price_low: null,
            };
        }
        
        // Map granularity to the correct field names
        // Note: volume and turnover still use '7d' in database, but trend uses '1w'
        let trendKey;
        let volumeKey;
        let turnoverKey;
        let priceHighKey;
        let priceLowKey;
        let buySellRateKey;
        
        if (gran === '1w') {
            trendKey = 'trend_1w';
            volumeKey = 'volume_7d';  // Database still uses 7d for volume
            turnoverKey = 'turnover_7d';  // Database still uses 7d for turnover
            priceHighKey = 'price_1w_high';
            priceLowKey = 'price_1w_low';
            buySellRateKey = 'buy_sell_rate_1w';
        } else {
            trendKey = `trend_${gran}`;
            volumeKey = `volume_${gran}`;
            turnoverKey = `turnover_${gran}`;
            priceHighKey = `price_${gran}_high`;
            priceLowKey = `price_${gran}_low`;
            buySellRateKey = `buy_sell_rate_${gran}`;
        }
        
        const metrics = {
            volume: canonicalData[volumeKey] != null ? canonicalData[volumeKey] : null,
            turnover: canonicalData[turnoverKey] != null ? canonicalData[turnoverKey] : null,
            trend: canonicalData[trendKey] != null ? canonicalData[trendKey] : null,
            buy_sell_rate: canonicalData[buySellRateKey] != null ? canonicalData[buySellRateKey] : null,
            price_high: canonicalData[priceHighKey] != null ? canonicalData[priceHighKey] : null,
            price_low: canonicalData[priceLowKey] != null ? canonicalData[priceLowKey] : null,
        };

        return metrics;
    };

    const granularityMetrics = getGranularityMetrics(selectedGranularity);

    // Check if there's valid price data to display
    // Chart calculations are now in PriceChart component
    const selected = timeOptions.find(o => o.label === timeRange);
    const granularity = selected ? selected.granularity : '5m';
    const is4hChart = granularity === '4h';
    
    // Simple check for valid price data
    const hasValidPriceData = priceData.length > 0 && priceData.some(p => {
                if (is4hChart) {
            return p.price != null && p.price > 0;
                } else {
            return (p.high != null && p.high > 0) || (p.low != null && p.low > 0);
        }
    });

    // Zoom trend calculation is now handled by PriceChart component

    return (
        <div style={{ 
            padding: isMobile ? "0" : "2rem", 
            paddingTop: isMobile ? "90px" : "2rem", // Space for search bar (50px) + Discord banner (40px) on mobile
            paddingBottom: isMobile ? "0" : "2rem", // No bottom padding on mobile - pagination is fixed
            fontFamily: "'Inter',sans-serif", 
            backgroundColor: "#0f1115", 
            minHeight: isMobile ? "calc(100vh - 90px - 48px)" : "100vh", // Resizeable between Discord banner and bottom nav
            height: isMobile ? "calc(100vh - 90px - 48px)" : "auto",
            display: isMobile ? "flex" : "block",
            flexDirection: isMobile ? "column" : "row",
            overflow: isMobile ? "hidden" : "visible",
            color: "#e6e9ef" 
        }}>
            {/* Header */}
            <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "16px", 
                marginBottom: isMobile ? "16px" : "32px",
                flexShrink: 0,
                padding: isMobile ? "16px" : "0"
            }}>
                <img
                    src={`${baseIconURL}/${safe}/64px-${safe}`}
                    alt={canonicalData.name}
                    width={64}
                    height={64}
                    style={{ borderRadius: 8, objectFit: "contain" }}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                />
                <div style={{ flex: 1 }}>
                    <h1 style={{ margin: 0, fontSize: "32px", color: "#e6e9ef" }}>{canonicalData.name}</h1>
                    {basicData && basicData.high && basicData.low && (
                        <p style={{ margin: "8px 0 0 0", fontSize: "18px", color: "#9aa4b2" }}>
                            Buy: {formatPriceFull(basicData.low)} gp | Sell: {formatPriceFull(basicData.high)} gp
                        </p>
                    )}
                </div>
            </div>

            {/* Content Area - Resizeable between Discord banner and pagination */}
            <div style={{
                flex: isMobile ? 1 : "none",
                minHeight: 0,
                overflowY: isMobile ? "auto" : "visible",
                overflowX: "hidden",
                display: "flex",
                flexDirection: "column",
                gap: isMobile ? "16px" : "0"
            }}>
            {/* Price Chart and Recent Trades Side by Side */}
            <div style={sectionContainerStyle}>
                <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                    {/* Price Chart - 80% width */}
                    <div style={{ flex: '0 0 80%', width: '80%' }}>
                        <h2 style={sectionTitleStyle}>Price Chart</h2>
                        
                        {/* Time range buttons */}
                        <div style={{ marginBottom: 16 }}>
                            {timeOptions.map(({ label }) => (
                                <button
                                    key={label}
                                    onClick={() => setTimeRange(label)}
                                    style={{
                                        marginRight: 6,
                                        padding: '6px 10px',
                                        background: label === timeRange ? '#202737' : '#151a22',
                                        color: label === timeRange ? '#e6e9ef' : '#9aa4b2',
                                        borderRadius: 4,
                                        border: label === timeRange ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.06)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (label !== timeRange) {
                                            e.target.style.background = '#202737';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (label !== timeRange) {
                                            e.target.style.background = '#151a22';
                                        }
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* Chart */}
                            <div style={{ height: '60vh', position: 'relative', backgroundColor: '#151a22', borderRadius: '8px', padding: '16px' }}>
                            {/* Reset Zoom Button, Zoom Trend, and No Data message are now handled by PriceChart component */}
                            <div style={{ height: '100%', width: '100%' }}>
                                <PriceChart
                                    ref={chartRef} 
                                    priceData={priceData}
                                    timeRange={timeRange}
                                    zoomBounds={zoomBounds}
                                    onZoomChange={(min, max) => {
                                        setZoomBounds({ min, max });
                                    }}
                                    isLoading={advancedLoading}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Recent Trades - 20% width */}
                    <div style={{ flex: '0 0 20%', width: '20%' }}>
                        <h2 style={sectionTitleStyle}>Recent Trades</h2>
                        <TradeList trades={recentTrades} maxHeight={600} maxItems={20} />
                    </div>
                </div>
            </div>

            {/* SECTION 1 — BASIC (LIVE MARKET DATA) */}
            <div style={sectionContainerStyle}>
                <h2 style={sectionTitleStyle}>Basic (Live Market Data)</h2>
                {basicData ? (
                    <>
                        {/* Row 1: High, Low, Margin, ROI, Spread */}
                        <div style={{ ...gridStyle, marginBottom: "24px" }}>
                            <Field label="High (Instant Sell)" value={formatPriceFull(basicData.high)} />
                            <Field label="Low (Instant Buy)" value={formatPriceFull(basicData.low)} />
                            <Field label="Margin" value={formatColoredNumber(basicData.margin)} />
                            <Field label="ROI %" value={formatRoi(basicData.roi_percent)} />
                            <Field label="Spread %" value={formatRoi(basicData.spread_percent)} />
                        </div>
                        {/* Row 2: High Timestamp, Low Timestamp, Limit, Max Profit, Max Investment */}
                        <div style={gridStyle}>
                            <Field label="High Timestamp" value={timeAgo(basicData.high_timestamp)} />
                            <Field label="Low Timestamp" value={timeAgo(basicData.low_timestamp)} />
                            <Field label="Limit" value={basicData.limit ? basicData.limit.toLocaleString() : "–"} />
                            <Field label="Max Profit" value={formatColoredNumber(basicData.max_profit)} />
                            <Field label="Max Investment" value={formatPriceFull(basicData.max_investment)} />
                        </div>
                    </>
                ) : (
                    <p style={{ color: '#9aa4b2' }}>No live market data available</p>
                )}
            </div>

            {/* SECTION 2 — ADVANCED (GRANULARITY-BASED) */}
            <div style={sectionContainerStyle}>
                <h2 style={sectionTitleStyle}>Advanced (Granularity-Based Market Analysis)</h2>
                
                {/* Granularity Selector */}
                <div style={{ marginBottom: "24px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {GRANULARITY_OPTIONS.map((gran) => (
                        <button
                            key={gran}
                            onClick={() => setSelectedGranularity(gran)}
                            style={{
                                padding: '8px 16px',
                                background: gran === selectedGranularity ? '#202737' : '#151a22',
                                color: gran === selectedGranularity ? '#e6e9ef' : '#9aa4b2',
                                borderRadius: 4,
                                border: gran === selectedGranularity ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.06)',
                                cursor: 'pointer',
                                fontWeight: gran === selectedGranularity ? 600 : 400,
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                                if (gran !== selectedGranularity) {
                                    e.target.style.background = '#202737';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (gran !== selectedGranularity) {
                                    e.target.style.background = '#151a22';
                                }
                            }}
                        >
                            {gran}
                        </button>
                    ))}
                </div>

                {/* Display metrics for selected granularity */}
                <div style={gridStyle}>
                    <Field 
                        label={`Volume (${selectedGranularity})`} 
                        value={granularityMetrics.volume != null ? formatCompact(granularityMetrics.volume) : "–"} 
                    />
                    <Field 
                        label={`Turnover (${selectedGranularity})`} 
                        value={granularityMetrics.turnover != null ? formatCompact(granularityMetrics.turnover) : "–"} 
                    />
                    <TrendField 
                        label={selectedGranularity === '1w' ? 'TREND (1W)' : `Trend (${selectedGranularity})`} 
                        value={formatRoi(granularityMetrics.trend)}
                        itemId={canonicalData?.item_id}
                        granularity={selectedGranularity}
                    />
                    {granularityMetrics.buy_sell_rate != null && (
                        <Field 
                            label={`Buy/Sell Rate (${selectedGranularity})`} 
                            value={
                                <span style={{ 
                                    color: granularityMetrics.buy_sell_rate < 1 ? "#ff5c5c" : "#2bd97f",
                                    fontFamily: "monospace"
                                }}>
                                    {parseFloat(granularityMetrics.buy_sell_rate).toFixed(2)}
                                </span>
                            } 
                        />
                    )}
                    {granularityMetrics.price_high != null && (
                        <Field 
                            label={`Price High (${selectedGranularity})`} 
                            value={formatPriceFull(granularityMetrics.price_high)} 
                        />
                    )}
                    {granularityMetrics.price_low != null && (
                        <Field 
                            label={`Price Low (${selectedGranularity})`} 
                            value={formatPriceFull(granularityMetrics.price_low)} 
                        />
                    )}
                </div>
            </div>
            </div>
            {/* End Content Area */}
        </div>
    );
}

// Field component for displaying label-value pairs
function Field({ label, value }) {
    return (
        <div style={fieldStyle}>
            <div style={labelStyle}>{label}</div>
            <div style={valueStyle}>{value}</div>
        </div>
    );
}

// TrendField component with hover tooltip showing calculation details
function TrendField({ label, value, itemId, granularity }) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipData, setTooltipData] = useState(null);
    const [loading, setLoading] = useState(false);
    const tooltipRef = useRef(null);

    const handleMouseEnter = async () => {
        if (!itemId || !granularity) return;
        
        setShowTooltip(true);
        setLoading(true);
        
        try {
            // Map granularity to trend key
            const trendKey = granularity === '1w' ? 'trend_1w' : 
                           granularity === '1m' ? 'trend_1m' :
                           `trend_${granularity}`;
            
            const res = await apiFetch(`/api/items/trend-details/${itemId}`);
            if (res.ok) {
                const data = await res.json();
                setTooltipData(data[trendKey] || null);
            } else {
                console.error("TrendField: API error", res.status);
            }
        } catch (err) {
            console.error("TrendField: Error fetching trend details:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
        setTooltipData(null);
    };

    const formatPrice = (price) => {
        if (price == null) return "N/A";
        return price.toLocaleString();
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return "N/A";
        return new Date(timestamp * 1000).toLocaleString();
    };

    return (
        <div 
            style={{ ...fieldStyle, position: 'relative' }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div style={labelStyle}>{label}</div>
            <div style={valueStyle}>{value}</div>
            {showTooltip && (
                <div 
                    ref={tooltipRef}
                    style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginBottom: '8px',
                        backgroundColor: '#151a22', // Table surface
                        color: '#e6e9ef', // Primary text
                        padding: '12px 16px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        minWidth: '300px',
                        maxWidth: '400px',
                        zIndex: 1000,
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                        pointerEvents: 'none',
                        border: '1px solid rgba(255,255,255,0.06)', // Borders
                    }}
                >
                    {loading ? (
                        <div>Loading calculation details...</div>
                    ) : tooltipData ? (
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px' }}>
                                Trend Calculation
                            </div>
                            {tooltipData.current && tooltipData.previous ? (
                                <>
                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontWeight: 500, marginBottom: '4px' }}>Current Price:</div>
                                        <div style={{ marginLeft: '8px', fontSize: '11px', color: '#9aa4b2' }}>
                                            Mid: {formatPrice(tooltipData.current.mid)} gp
                                            {tooltipData.current.avg_high && tooltipData.current.avg_low && (
                                                <span> (High: {formatPrice(tooltipData.current.avg_high)}, Low: {formatPrice(tooltipData.current.avg_low)})</span>
                                            )}
                                            <br />
                                            Time: {formatTime(tooltipData.current.timestamp)}
                                            <br />
                                            Source: {tooltipData.current.table}
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontWeight: 500, marginBottom: '4px' }}>Previous Price:</div>
                                        <div style={{ marginLeft: '8px', fontSize: '11px', color: '#9aa4b2' }}>
                                            Mid: {formatPrice(tooltipData.previous.mid)} gp
                                            {tooltipData.previous.avg_high && tooltipData.previous.avg_low && (
                                                <span> (High: {formatPrice(tooltipData.previous.avg_high)}, Low: {formatPrice(tooltipData.previous.avg_low)})</span>
                                            )}
                                            <br />
                                            Time: {formatTime(tooltipData.previous.timestamp)}
                                            <br />
                                            Source: {tooltipData.previous.table}
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ fontWeight: 500, marginBottom: '4px' }}>Calculation:</div>
                                        <div style={{ marginLeft: '8px', fontSize: '11px', color: '#9aa4b2', fontFamily: 'monospace' }}>
                                            (({formatPrice(tooltipData.current.mid)} - {formatPrice(tooltipData.previous.mid)}) / {formatPrice(tooltipData.previous.mid)}) × 100
                                            <br />
                                            = {(() => {
                                                // SINGLE SOURCE OF TRUTH: Use stored trend value from canonical_items
                                                // This ensures tooltip shows the same value as the label
                                                if (tooltipData.trend != null && typeof tooltipData.trend === 'number') {
                                                    return `${tooltipData.trend.toFixed(2)}%`;
                                                }
                                                // If no stored trend, show N/A (don't calculate on-the-fly)
                                                return 'N/A (trend not calculated yet)';
                                            })()}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div style={{ color: '#9aa4b2' }}>
                                    Insufficient data to calculate trend
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>No trend data available</div>
                    )}
                </div>
            )}
        </div>
    );
}

// Styles
const sectionContainerStyle = {
    background: "#151a22", // Table surface
    border: "1px solid rgba(255,255,255,0.06)", // Borders
    borderRadius: "8px",
    padding: "24px",
    marginBottom: "32px",
    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.3)",
};

const sectionTitleStyle = {
    margin: "0 0 24px 0",
    fontSize: "24px",
    fontWeight: 600,
    color: "#e6e9ef", // Primary text
    borderBottom: "2px solid rgba(255,255,255,0.06)", // Borders
    paddingBottom: "12px",
};

const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "24px",
    padding: "8px 0",
};

const fieldStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
};

const labelStyle = {
    fontSize: "12px",
    fontWeight: 500,
    color: "#9aa4b2", // Secondary text
    textTransform: "uppercase",
    letterSpacing: "0.5px",
};

const valueStyle = {
    fontSize: "16px",
    fontWeight: 500,
    color: "#e6e9ef", // Primary text
};
