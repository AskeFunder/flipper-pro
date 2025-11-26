import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Line } from "react-chartjs-2";
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

const API_BASE = "http://localhost:3001";

const GRANULARITY_OPTIONS = ['5m', '1h', '6h', '24h', '7d', '1m'];

const timeOptions = [
    { label: '4H', ms: 4 * 3600e3, granularity: '4h' },
    { label: '12H', ms: 12 * 3600e3, granularity: '5m' },
    { label: '1D', ms: 24 * 3600e3, granularity: '5m' },
    { label: '1W', ms: 7 * 24 * 3600e3, granularity: '1h' },
    { label: '1M', ms: 30 * 24 * 3600e3, granularity: '6h' },
    { label: '3M', ms: 90 * 24 * 3600e3, granularity: '24h' },
    { label: '1Y', ms: 365 * 24 * 3600e3, granularity: '24h' },
    { label: 'All', ms: 0, granularity: '24h' },
];

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

    // Chart and Recent Trades
    const [priceData, setPriceData] = useState([]);
    const [recentTrades, setRecentTrades] = useState([]);
    const [timeRange, setTimeRange] = useState('12H');

    // Fetch canonical data first to get item_id and limit
    useEffect(() => {
        if (!numericItemId && !itemNameSlug) return;

        const fetchCanonical = async () => {
            try {
                // Prefer ID lookup if available (more reliable)
                const apiParam = numericItemId ? numericItemId : encodeURIComponent(itemNameSlug);
                const res = await fetch(`${API_BASE}/api/items/canonical/${apiParam}`);
                if (res.ok) {
                    const data = await res.json();
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
    }, [numericItemId, itemNameSlug]);

    // Fetch basic (live) data from /api/prices/latest/:id
    useEffect(() => {
        if (!canonicalData || !canonicalData.item_id) return;

        const fetchBasic = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/prices/latest/${canonicalData.item_id}`);
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
                        margin = Math.floor(high * 0.98) - low;
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

        fetchBasic();
        // Update every 15 seconds
        const interval = setInterval(fetchBasic, 15000);
        return () => clearInterval(interval);
    }, [canonicalData]);

    // Fetch chart data
    useEffect(() => {
        if (!canonicalData || !canonicalData.item_id) return;

        const selected = timeOptions.find(o => o.label === timeRange);
        const granularity = selected ? selected.granularity : '5m';

        const fetchChart = () => {
            fetch(`${API_BASE}/api/prices/chart/${granularity}/${canonicalData.item_id}`)
                .then(res => res.json())
                .then(setPriceData)
                .catch(console.error);
        };

        fetchChart();
        const int = setInterval(fetchChart, 15000);
        return () => clearInterval(int);
    }, [canonicalData, timeRange]);

    // Fetch recent trades
    useEffect(() => {
        if (!canonicalData || !canonicalData.item_id) return;

        const fetchRecent = () => {
            fetch(`${API_BASE}/api/prices/recent/${canonicalData.item_id}`)
                .then(res => res.json())
                .then(setRecentTrades)
                .catch(console.error);
        };

        fetchRecent();
        const int = setInterval(fetchRecent, 15000);
        return () => clearInterval(int);
    }, [canonicalData]);

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
        const metrics = {
            volume: canonicalData[`volume_${gran}`] || null,
            turnover: canonicalData[`turnover_${gran}`] || null,
            trend: canonicalData[`trend_${gran}`] || null,
            buy_sell_rate: canonicalData[`buy_sell_rate_${gran}`] || null,
            price_high: null,
            price_low: null,
        };

        // Price fields only exist for 5m and 1h
        if (gran === '5m') {
            metrics.price_high = canonicalData.price_5m_high || null;
            metrics.price_low = canonicalData.price_5m_low || null;
        } else if (gran === '1h') {
            metrics.price_high = canonicalData.price_1h_high || null;
            metrics.price_low = canonicalData.price_1h_low || null;
        }

        return metrics;
    };

    const granularityMetrics = getGranularityMetrics(selectedGranularity);

    // Chart calculations
    const selected = timeOptions.find(o => o.label === timeRange);
    const granularity = selected ? selected.granularity : '5m';
    const now = Date.now();
    const minTime = selected ? now - selected.ms : 0;
    const filtered = priceData.filter(p => minTime === 0 || p.ts * 1000 >= minTime);

    // Calculate min/max for x-axis - NO PADDING, exact bounds
    const xMin = filtered.length > 0 ? new Date(Math.min(...filtered.map(p => p.ts * 1000))) : null;
    const xMax = filtered.length > 0 ? new Date(Math.max(...filtered.map(p => p.ts * 1000))) : null;

    // Calculate min/max for y-axis with padding
    const allPrices = filtered.flatMap(p => [p.high, p.low]).filter(v => v != null && v > 0);
    const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
    const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;
    
    // Check if there are any valid price points (high or low > 0)
    const hasValidPriceData = allPrices.length > 0;
    const avgPrice = allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0;
    
    // Detect spikes/crashes: if max is more than 3x the average, it's likely a spike
    const hasSpike = maxPrice > avgPrice * 3 && avgPrice > 0;
    
    const priceRange = maxPrice - minPrice;
    const paddingAmount = priceRange > 0 ? priceRange * 0.2 : maxPrice * 0.1; // 20% padding, or 10% of max if range is 0
    
    // Helper function to find a "nice" step size for tick marks
    const getNiceStep = (range) => {
        if (range <= 0) return 1;
        
        // Calculate rough step size (aim for ~5-10 ticks)
        const roughStep = range / 8;
        
        // Find the order of magnitude
        const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
        
        // Normalize to 1-10 range
        const normalized = roughStep / magnitude;
        
        // Choose a nice step: 1, 2, 5, or 10 times the magnitude
        let niceNormalized;
        if (normalized <= 1) niceNormalized = 1;
        else if (normalized <= 2) niceNormalized = 2;
        else if (normalized <= 5) niceNormalized = 5;
        else niceNormalized = 10;
        
        return niceNormalized * magnitude;
    };
    
    // Helper function to round to nearest nice tick
    const roundToNiceTick = (value, step, roundDown = true) => {
        if (value <= 0) return 0;
        if (roundDown) {
            return Math.floor(value / step) * step;
        } else {
            return Math.ceil(value / step) * step;
        }
    };
    
    // Calculate minimum padding values
    const minPaddingBottom = minPrice - paddingAmount;
    const minPaddingTop = hasSpike ? maxPrice : maxPrice + paddingAmount;
    
    // Determine nice step size based on the padded range
    const paddedRange = minPaddingTop - minPaddingBottom;
    const niceStep = getNiceStep(paddedRange);
    
    // Round to nice ticks (down for bottom, up for top)
    const yMin = Math.max(0, roundToNiceTick(minPaddingBottom, niceStep, true));
    const yMax = roundToNiceTick(minPaddingTop, niceStep, false);

    // Calculate volume data and scale for bottom 20% of graph
    const volumes = filtered.map(p => p.volume || 0).filter(v => v > 0);
    const maxVolume = volumes.length > 0 ? Math.max(...volumes) : 1;
    const priceRangeForVolume = yMax - yMin;
    const volumeBottom = yMin;
    const volumeTop = yMin + priceRangeForVolume * 0.2; // Bottom 20% of price range

    // Helper function to determine point radius
    // Show filled dots only if there's 1 data point total (so it's visible)
    // If there's more than 1 data point, don't show dots (lines connect them)
    const getPointRadius = (dataArray, totalValidPoints = 0) => {
        return (ctx) => {
            const index = ctx.dataIndex;
            const value = dataArray[index];
            
            // If this point has no value, don't show a dot
            if (value == null || value === undefined) return 0;
            
            // If there's only 1 valid data point total, show a dot so it's visible
            // If there's more than 1, don't show dots (lines connect them)
            return totalValidPoints === 1 ? 3 : 0;
        };
    };
    
    // Count valid data points for buy and sell separately
    const buyDataPoints = filtered.map(p => p.high).filter(v => v != null && v !== undefined && !isNaN(v) && v > 0);
    const sellDataPoints = filtered.map(p => p.low).filter(v => v != null && v !== undefined && !isNaN(v) && v > 0);

    const chartData = {
        labels: filtered.map(p => new Date(p.ts * 1000)),
        datasets: [
            {
                label: "Buy",
                data: filtered.map(p => p.high),
                borderColor: "green",
                backgroundColor: "green",
                tension: 0.1,
                pointRadius: getPointRadius(
                    filtered.map(p => p.high),
                    buyDataPoints.length
                ),
                pointBackgroundColor: "green",
                pointBorderColor: "green",
                pointBorderWidth: 2,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: "green",
                pointHoverBorderColor: "green",
                pointHoverBorderWidth: 2,
                spanGaps: true,
                yAxisID: 'y',
            },
            {
                label: "Sell",
                data: filtered.map(p => p.low),
                borderColor: "red",
                backgroundColor: "red",
                tension: 0.1,
                pointRadius: getPointRadius(
                    filtered.map(p => p.low),
                    sellDataPoints.length
                ),
                pointBackgroundColor: "red",
                pointBorderColor: "red",
                pointBorderWidth: 2,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: "red",
                pointHoverBorderColor: "red",
                pointHoverBorderWidth: 2,
                spanGaps: true,
                yAxisID: 'y',
            },
            {
                label: "Volume",
                data: filtered.map((p) => {
                    const vol = p.volume || 0;
                    // Map volume to bottom 20% of price range
                    if (vol > 0) {
                        const scaledY = volumeBottom + (vol / maxVolume) * (volumeTop - volumeBottom);
                        return { x: p.ts * 1000, y: scaledY, rawVolume: vol };
                    }
                    return null;
                }).filter(d => d !== null),
                type: 'bar',
                backgroundColor: 'rgba(100, 100, 255, 0.3)',
                borderColor: 'rgba(100, 100, 255, 0.5)',
                borderWidth: 1,
                yAxisID: 'y',
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            tooltip: {
                callbacks: {
                    title: items => new Date(items[0].parsed.x).toLocaleString(),
                    label: function(context) {
                        const dataset = context.dataset;
                        if (dataset.label === 'Volume') {
                            const rawVolume = context.raw?.rawVolume;
                            if (rawVolume) {
                                // Show actual volume value
                                if (rawVolume >= 1000000) return `Volume: ${(rawVolume / 1000000).toFixed(1)}M`;
                                if (rawVolume >= 1000) return `Volume: ${(rawVolume / 1000).toFixed(1)}K`;
                                return `Volume: ${rawVolume.toLocaleString()}`;
                            }
                            return `Volume: ${context.parsed.y.toLocaleString()}`;
                        }
                        return `${dataset.label}: ${context.parsed.y.toLocaleString()} gp`;
                    }
                }
            }
        },
        scales: {
            x: { 
                type: 'time', 
                title: { display: true, text: 'Time' },
                offset: false,
                bounds: 'ticks',
                min: xMin,
                max: xMax,
                grace: 0,
                ticks: {
                    padding: 0
                }
            },
            y: { 
                title: { display: true, text: 'Price (gp)' },
                min: yMin,
                max: yMax,
                ticks: {
                    stepSize: niceStep
                }
            }
        }
    };

    return (
        <div style={{ padding: "2rem", fontFamily: "'Inter',sans-serif" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
                <img
                    src={`${baseIconURL}/${safe}/64px-${safe}`}
                    alt={canonicalData.name}
                    width={64}
                    height={64}
                    style={{ borderRadius: 8, objectFit: "contain" }}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                />
                <div style={{ flex: 1 }}>
                    <h1 style={{ margin: 0, fontSize: "32px" }}>{canonicalData.name}</h1>
                    {basicData && basicData.high && basicData.low && (
                        <p style={{ margin: "8px 0 0 0", fontSize: "18px", color: "#374151" }}>
                            Buy: {formatPriceFull(basicData.low)} gp | Sell: {formatPriceFull(basicData.high)} gp
                        </p>
                    )}
                </div>
            </div>

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
                                        background: label === timeRange ? '#1e1e1e' : '#f0f0f0',
                                        color: label === timeRange ? '#fff' : '#000',
                                        borderRadius: 4,
                                        border: label === timeRange ? '2px solid #444' : '1px solid #ccc',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* Chart */}
                        {!hasValidPriceData ? (
                            <div style={{ 
                                height: '60vh', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                color: '#6b7280',
                                fontSize: '16px',
                                fontStyle: 'italic'
                            }}>
                                No price data available in selected range.
                            </div>
                        ) : (
                            <div style={{ height: '60vh' }}>
                                <Line data={chartData} options={chartOptions} />
                            </div>
                        )}
                    </div>

                    {/* Recent Trades - 20% width */}
                    <div style={{ flex: '0 0 20%', width: '20%' }}>
                        <h2 style={sectionTitleStyle}>Recent Trades</h2>
                        <div style={{ maxHeight: '60vh', overflowY: 'auto', overflowX: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 'clamp(0.75rem, 1.2vw, 0.875rem)' }}>
                                <thead>
                                    <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                                        <th align="left" style={{ padding: "8px 6px", textAlign: "left", whiteSpace: "nowrap", width: "35%" }}>Time</th>
                                        <th align="left" style={{ padding: "8px 6px", textAlign: "left", whiteSpace: "nowrap", width: "15%" }}>Type</th>
                                        <th align="left" style={{ padding: "8px 6px", textAlign: "left", whiteSpace: "nowrap", width: "50%" }}>Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentTrades.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "#6b7280" }}>
                                                No recent trades available
                                            </td>
                                        </tr>
                                    ) : (
                                        recentTrades.map((t, i) => {
                                            // Backend sends: 'sell' for high prices, 'buy' for low prices
                                            // We want: high = Buy (green), low = Sell (red)
                                            // So invert the logic
                                            const isBuy = t.type === 'sell';
                                            const label = isBuy ? 'BUY' : 'SELL';
                                            const rowColor = isBuy ? '#eaffea' : '#ffeaea';
                                            const textColor = isBuy ? '#007a00' : '#b20000';
                                            return (
                                                <tr key={i} style={{ backgroundColor: rowColor, color: textColor }}>
                                                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{timeAgo(t.ts)}</td>
                                                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{label}</td>
                                                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{formatPriceFull(t.price)}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 1 — BASIC (LIVE MARKET DATA) */}
            <div style={sectionContainerStyle}>
                <h2 style={sectionTitleStyle}>Basic (Live Market Data)</h2>
                {basicData ? (
                    <div style={gridStyle}>
                        <Field label="High (Instant Sell)" value={formatPriceFull(basicData.high)} />
                        <Field label="Low (Instant Buy)" value={formatPriceFull(basicData.low)} />
                        <Field label="High Timestamp" value={timeAgo(basicData.high_timestamp)} />
                        <Field label="Low Timestamp" value={timeAgo(basicData.low_timestamp)} />
                        <Field label="Margin" value={formatColoredNumber(basicData.margin)} />
                        <Field label="ROI %" value={formatRoi(basicData.roi_percent)} />
                        <Field label="Spread %" value={formatRoi(basicData.spread_percent)} />
                        <Field label="Limit" value={basicData.limit ? basicData.limit.toLocaleString() : "–"} />
                        <Field label="Max Profit" value={formatColoredNumber(basicData.max_profit)} />
                        <Field label="Max Investment" value={formatPriceFull(basicData.max_investment)} />
                    </div>
                ) : (
                    <p>No live market data available</p>
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
                                background: gran === selectedGranularity ? '#1e1e1e' : '#f0f0f0',
                                color: gran === selectedGranularity ? '#fff' : '#000',
                                borderRadius: 4,
                                border: gran === selectedGranularity ? '2px solid #444' : '1px solid #ccc',
                                cursor: 'pointer',
                                fontWeight: gran === selectedGranularity ? 600 : 400,
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
                    <Field 
                        label={`Trend (${selectedGranularity})`} 
                        value={formatRoi(granularityMetrics.trend)} 
                    />
                    {granularityMetrics.buy_sell_rate != null && (
                        <Field 
                            label={`Buy/Sell Rate (${selectedGranularity})`} 
                            value={
                                <span style={{ 
                                    color: granularityMetrics.buy_sell_rate < 1 ? "#dc2626" : "#16a34a",
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

                {/* Additional trend fields (3m and 1y) - not granularity-specific */}
                {(canonicalData.trend_3m != null || canonicalData.trend_1y != null) && (
                    <div style={{ marginTop: "24px" }}>
                        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: "#374151" }}>
                            Extended Trends
                        </h3>
                        <div style={gridStyle}>
                            {canonicalData.trend_3m != null && (
                                <Field label="Trend (3m)" value={formatRoi(canonicalData.trend_3m)} />
                            )}
                            {canonicalData.trend_1y != null && (
                                <Field label="Trend (1y)" value={formatRoi(canonicalData.trend_1y)} />
                            )}
                        </div>
                    </div>
                )}
            </div>
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

// Styles
const sectionContainerStyle = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "24px",
    marginBottom: "32px",
    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
};

const sectionTitleStyle = {
    margin: "0 0 24px 0",
    fontSize: "24px",
    fontWeight: 600,
    color: "#111827",
    borderBottom: "2px solid #e5e7eb",
    paddingBottom: "12px",
};

const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "20px",
};

const fieldStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
};

const labelStyle = {
    fontSize: "12px",
    fontWeight: 500,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
};

const valueStyle = {
    fontSize: "16px",
    fontWeight: 500,
    color: "#111827",
};
