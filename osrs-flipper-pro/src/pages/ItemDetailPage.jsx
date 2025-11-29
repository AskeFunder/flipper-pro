import React, { useEffect, useState, useRef } from "react";
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
import { taxExemptItems } from "../config/taxExemptItems";
import { apiFetch, apiFetchJson } from "../utils/api";

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
        if (chart.tooltip._active && chart.tooltip._active.length) {
            const ctx = chart.ctx;
            const x = chart.tooltip._active[0].element.x;
            const topY = chart.scales.y.top;
            const bottomY = chart.scales.y.bottom;
            
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.restore();
        }
    }
});

// Global callback for zoom - will be set by component
let globalZoomCallback = null;
// Global drag state for direct event listeners
let globalDragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0
};

// Register custom plugin for drag-to-zoom
ChartJS.register({
    id: 'dragToZoom',
    beforeInit: (chart) => {
        chart.dragZoom = {
            isDragging: false,
            startX: 0,
            startY: 0,
            endX: 0,
            endY: 0,
            onZoomComplete: null
        };
    },
    afterEvent: (chart, args) => {
        const event = args.event;
        const canvas = chart.canvas;
        
        if (!chart.dragZoom) {
            chart.dragZoom = {
                isDragging: false,
                startX: 0,
                startY: 0,
                endX: 0,
                endY: 0,
                onZoomComplete: null
            };
        }
        
        // Make sure chartArea is initialized
        if (!chart.chartArea) return;
        
        // Get the native event - Chart.js wraps it differently
        const nativeEvent = event.native || event.originalEvent || event;
        
        if (event.type === 'mousedown' && nativeEvent) {
            // Check for left mouse button
            const isLeftButton = (nativeEvent.buttons === 1 || nativeEvent.button === 0 || nativeEvent.button === undefined);
            if (isLeftButton) {
                const rect = canvas.getBoundingClientRect();
                const x = nativeEvent.clientX - rect.left;
                const y = nativeEvent.clientY - rect.top;
                
                // Check if click is within chart area
                if (x >= chart.chartArea.left && x <= chart.chartArea.right &&
                    y >= chart.chartArea.top && y <= chart.chartArea.bottom) {
                    chart.dragZoom.isDragging = true;
                    chart.dragZoom.startX = x;
                    chart.dragZoom.startY = y;
                    chart.dragZoom.endX = x;
                    chart.dragZoom.endY = y;
                    canvas.style.cursor = 'crosshair';
                }
            }
        } else if (event.type === 'mousemove' && chart.dragZoom.isDragging) {
            const rect = canvas.getBoundingClientRect();
            const nativeEvent = event.native || event.originalEvent || event;
            chart.dragZoom.endX = nativeEvent.clientX - rect.left;
            chart.dragZoom.endY = nativeEvent.clientY - rect.top;
            chart.draw();
        } else if (event.type === 'mouseup' && chart.dragZoom.isDragging) {
            chart.dragZoom.isDragging = false;
            canvas.style.cursor = 'default';
            
            const startX = Math.min(chart.dragZoom.startX, chart.dragZoom.endX);
            const endX = Math.max(chart.dragZoom.startX, chart.dragZoom.endX);
            const startY = Math.min(chart.dragZoom.startY, chart.dragZoom.endY);
            const endY = Math.max(chart.dragZoom.startY, chart.dragZoom.endY);
            
            // Only zoom if selection is large enough (at least 10 pixels)
            if (Math.abs(endX - startX) > 10 && Math.abs(endY - startY) > 10) {
                const xScale = chart.scales.x;
                const minValue = xScale.getValueForPixel(startX);
                const maxValue = xScale.getValueForPixel(endX);
                
                // Use global callback or chart-specific callback
                const callback = chart.dragZoom.onZoomComplete || globalZoomCallback;
                if (callback) {
                    callback(new Date(minValue), new Date(maxValue));
                }
            }
            
            chart.dragZoom.startX = 0;
            chart.dragZoom.startY = 0;
            chart.dragZoom.endX = 0;
            chart.dragZoom.endY = 0;
            chart.draw();
        } else if (event.type === 'dblclick') {
            // Double-click to reset zoom
            const callback = chart.dragZoom?.onZoomComplete || globalZoomCallback;
            if (callback) {
                callback(null, null);
            }
        }
    },
    afterDraw: (chart) => {
        // Check both plugin drag state and global drag state
        const isDragging = (chart.dragZoom && chart.dragZoom.isDragging) || globalDragState.isDragging;
        if (isDragging && chart.chartArea) {
            const ctx = chart.ctx;
            let startX, endX;
            
            if (chart.dragZoom && chart.dragZoom.isDragging) {
                startX = Math.min(chart.dragZoom.startX, chart.dragZoom.endX);
                endX = Math.max(chart.dragZoom.startX, chart.dragZoom.endX);
            } else {
                startX = Math.min(globalDragState.startX, globalDragState.endX);
                endX = Math.max(globalDragState.startX, globalDragState.endX);
            }
            
            // Use full vertical height of chart area
            const topY = chart.chartArea.top;
            const bottomY = chart.chartArea.bottom;
            
            ctx.save();
            ctx.fillStyle = 'rgba(54, 162, 235, 0.1)';
            
            ctx.fillRect(startX, topY, endX - startX, bottomY - topY);
            
            ctx.restore();
        }
    }
});

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

    // Chart and Recent Trades
    const [priceData, setPriceData] = useState([]);
    const [recentTrades, setRecentTrades] = useState([]);
    const [timeRange, setTimeRange] = useState('12H');
    
    // Zoom state
    const [zoomBounds, setZoomBounds] = useState({ min: null, max: null });
    const [chartKey, setChartKey] = useState(0);
    const chartRef = useRef(null);

    // Fetch canonical data first to get item_id and limit
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
        // Update canonical data every 15 seconds (same as other live data)
        const interval = setInterval(fetchCanonical, 15000);
        return () => clearInterval(interval);
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
            apiFetchJson(`/api/prices/chart/${granularity}/${canonicalData.item_id}`)
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
            apiFetchJson(`/api/prices/recent/${canonicalData.item_id}`)
                .then(setRecentTrades)
                .catch(console.error);
        };

        fetchRecent();
        const int = setInterval(fetchRecent, 15000);
        return () => clearInterval(int);
    }, [canonicalData]);
    
    // Set up zoom callback - use global callback that plugin can access
    useEffect(() => {
        globalZoomCallback = (min, max) => {
            if (min === null && max === null) {
                // Reset zoom
                setZoomBounds({ min: null, max: null });
            } else {
                // Apply zoom
                setZoomBounds({ min, max });
            }
        };
        
        return () => {
            globalZoomCallback = null;
        };
    }, []);
    
    // Always reset zoom bounds when granularity changes
    useEffect(() => {
        setZoomBounds({ min: null, max: null });
    }, [selectedGranularity]);
    
    // Always reset zoom bounds when time range changes
    useEffect(() => {
        setZoomBounds({ min: null, max: null });
    }, [timeRange]);
    
    // Set up direct canvas event listeners for drag-to-zoom
    useEffect(() => {
        let cleanup = null;
        
        // Wait a bit for chart to be ready
        const timer = setTimeout(() => {
            if (!chartRef.current) return;
            
            // react-chartjs-2 stores canvas in different places
            const chartInstance = chartRef.current._chart || chartRef.current.chartInstance || chartRef.current;
            const canvas = chartInstance?.canvas || chartRef.current.canvas || chartRef.current;
            if (!canvas || !canvas.getBoundingClientRect) return;
        
            let isDragging = false;
            let startX = 0;
            let startY = 0;
            let endX = 0;
            let endY = 0;
            
            // Helper function to snap X position to nearest data point
            const snapToNearestDataPoint = (x, chart) => {
                if (!chart || !chart.scales || !chart.scales.x) return x;
                
                const xScale = chart.scales.x;
                const datasets = chart.data.datasets;
                if (!datasets || datasets.length === 0) return x;
                
                // Get all data points from first dataset (they all have same x values)
                const firstDataset = datasets[0];
                if (!firstDataset || !firstDataset.data) return x;
                
                // Find nearest data point
                let nearestX = x;
                let minDistance = Infinity;
                
                firstDataset.data.forEach((point) => {
                    if (point && point.x != null) {
                        const pointX = xScale.getPixelForValue(point.x);
                        const distance = Math.abs(pointX - x);
                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestX = pointX;
                        }
                    }
                });
                
                return nearestX;
            };
            
            const handleMouseDown = (e) => {
                if (e.button !== 0) return; // Only left mouse button
                
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Get chart instance to check chartArea
                const chart = chartRef.current?._chart || chartRef.current?.chartInstance || chartRef.current;
                if (!chart || !chart.chartArea) return;
                
                if (x >= chart.chartArea.left && x <= chart.chartArea.right &&
                    y >= chart.chartArea.top && y <= chart.chartArea.bottom) {
                    // Snap to nearest data point
                    const snappedX = snapToNearestDataPoint(x, chart);
                    
                    isDragging = true;
                    startX = snappedX;
                    startY = y;
                    endX = snappedX;
                    endY = y;
                    
                    // Update global drag state
                    globalDragState.isDragging = true;
                    globalDragState.startX = snappedX;
                    globalDragState.startY = y;
                    globalDragState.endX = snappedX;
                    globalDragState.endY = y;
                    
                    // Disable tooltip while dragging
                    if (chart && chart.options && chart.options.plugins && chart.options.plugins.tooltip) {
                        chart.options.plugins.tooltip.enabled = false;
                    }
                    
                    canvas.style.cursor = 'crosshair';
                }
            };
            
            const handleMouseMove = (e) => {
                if (!isDragging) return;
                
                const rect = canvas.getBoundingClientRect();
                const rawX = e.clientX - rect.left;
                const rawY = e.clientY - rect.top;
                
                // Get chart instance
                const chart = chartRef.current?._chart || chartRef.current?.chartInstance || chartRef.current;
                
                // Snap to nearest data point
                const snappedX = snapToNearestDataPoint(rawX, chart);
                
                endX = snappedX;
                endY = rawY;
                
                // Update global drag state
                globalDragState.endX = snappedX;
                globalDragState.endY = rawY;
                
                // Force chart update to show selection rectangle
                if (chart) {
                    chart.update('none'); // Update without animation
                }
            };
            
            const handleMouseUp = (e) => {
                if (!isDragging) return;
                
                isDragging = false;
                globalDragState.isDragging = false;
                canvas.style.cursor = 'default';
                
                // Re-enable tooltip after dragging
                const chart = chartRef.current?._chart || chartRef.current?.chartInstance || chartRef.current;
                if (chart && chart.options && chart.options.plugins && chart.options.plugins.tooltip) {
                    chart.options.plugins.tooltip.enabled = true;
                }
                
                const startXFinal = Math.min(startX, endX);
                const endXFinal = Math.max(startX, endX);
                
                // Only zoom if selection is large enough (only check X since markering is full vertical)
                if (Math.abs(endXFinal - startXFinal) > 10) {
                    const chart = chartRef.current?._chart || chartRef.current?.chartInstance || chartRef.current;
                    if (chart && chart.scales && chart.scales.x) {
                        const xScale = chart.scales.x;
                        const minValue = xScale.getValueForPixel(startXFinal);
                        const maxValue = xScale.getValueForPixel(endXFinal);
                        
                        if (globalZoomCallback) {
                            globalZoomCallback(new Date(minValue), new Date(maxValue));
                        }
                    }
                }
                
                startX = 0;
                startY = 0;
                endX = 0;
                endY = 0;
                globalDragState.startX = 0;
                globalDragState.startY = 0;
                globalDragState.endX = 0;
                globalDragState.endY = 0;
            };
            
            const handleDblClick = () => {
                if (globalZoomCallback) {
                    globalZoomCallback(null, null);
                }
            };
            
            canvas.addEventListener('mousedown', handleMouseDown);
            canvas.addEventListener('mousemove', handleMouseMove);
            canvas.addEventListener('mouseup', handleMouseUp);
            canvas.addEventListener('dblclick', handleDblClick);
            
            // Store cleanup function in outer scope
            cleanup = () => {
                canvas.removeEventListener('mousedown', handleMouseDown);
                canvas.removeEventListener('mousemove', handleMouseMove);
                canvas.removeEventListener('mouseup', handleMouseUp);
                canvas.removeEventListener('dblclick', handleDblClick);
            };
        }, 200);
        
        return () => {
            clearTimeout(timer);
            if (cleanup) cleanup();
        };
    }, [priceData, timeRange]);

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

    // Chart calculations
    const selected = timeOptions.find(o => o.label === timeRange);
    const granularity = selected ? selected.granularity : '5m';
    const now = Date.now();
    
    // For 12H, 1D, and 1W, show data from exactly X time before latest datapoint to latest datapoint
    // This matches the trend calculation logic
    let filtered;
    if ((timeRange === '12H' || timeRange === '1D' || timeRange === '1W') && priceData.length > 0) {
        // Find the actual latest datapoint (not filtered by time window to ensure stability)
        const latestDataPoint = priceData
            .sort((a, b) => b.ts - a.ts)[0];
        
        if (latestDataPoint) {
            const latestTimestamp = latestDataPoint.ts * 1000;
            
            let timeBeforeLatest;
            if (timeRange === '12H') {
                // Go back exactly 12 hours from latest point
                timeBeforeLatest = latestTimestamp - (12 * 3600 * 1000);
            } else if (timeRange === '1D') {
                // Go back exactly 24 hours from latest point
                timeBeforeLatest = latestTimestamp - (24 * 3600 * 1000);
            } else if (timeRange === '1W') {
                // Go back exactly 1 week from latest point
                timeBeforeLatest = latestTimestamp - (7 * 24 * 3600 * 1000);
            }
            
            // Filter to show data from exactly X time before latest to latest (inclusive)
            // This gives us exactly 12h/24h/1w of data points
            filtered = priceData.filter(p => {
                const pTime = p.ts * 1000;
                // Use >= and <= to include both endpoints
                return pTime >= timeBeforeLatest && pTime <= latestTimestamp;
            });
        } else {
            // Fallback to normal filtering if no recent datapoint
            // Note: timestamps are already at end of interval, so we don't need to subtract granularityStep
            const minTime = selected ? (now - selected.ms) : 0;
            filtered = priceData.filter(p => minTime === 0 || p.ts * 1000 >= minTime);
        }
    } else {
        // Normal filtering for other time ranges
        // Note: timestamps are already at end of interval, so we don't need to subtract granularityStep
        const minTime = selected ? (now - selected.ms) : 0;
        filtered = priceData.filter(p => minTime === 0 || p.ts * 1000 >= minTime);
    }

    // Calculate min/max for x-axis - NO PADDING, exact bounds
    // For 1W, use the calculated timeBeforeLatest as xMin to show exact 7-day window
    let calculatedXMin = filtered.length > 0 ? new Date(Math.min(...filtered.map(p => p.ts * 1000))) : null;
    let calculatedXMax = filtered.length > 0 ? new Date(Math.max(...filtered.map(p => p.ts * 1000))) : null;
    
    // For 1W, adjust xMin to be exactly 7 days before latest datapoint
    if (timeRange === '1W' && priceData.length > 0) {
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        const latestDataPoint = priceData
            .filter(p => p.ts * 1000 >= fiveMinutesAgo)
            .sort((a, b) => b.ts - a.ts)[0];
        
        if (latestDataPoint) {
            const latestTimestamp = latestDataPoint.ts * 1000;
            // Note: timestamps are already at end of interval, so we don't need to subtract granularityStep
            const timeBeforeLatest = latestTimestamp - (7 * 24 * 3600 * 1000);
            calculatedXMin = new Date(timeBeforeLatest);
            calculatedXMax = new Date(latestTimestamp);
        }
    }
    
    // Use zoom bounds if set, otherwise use calculated bounds
    const xMin = zoomBounds.min || calculatedXMin;
    const xMax = zoomBounds.max || calculatedXMax;

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
    // Ensure stepSize is a whole number for whole number ticks only
    const wholeNumberStep = Math.max(1, Math.round(niceStep));
    const yMin = Math.max(0, Math.floor(roundToNiceTick(minPaddingBottom, wholeNumberStep, true)));
    const yMax = Math.ceil(roundToNiceTick(minPaddingTop, wholeNumberStep, false));

    // Calculate volume data and scale for bottom 20% of graph
    const volumes = filtered.map(p => p.volume || 0).filter(v => v > 0);
    const maxVolume = volumes.length > 0 ? Math.max(...volumes) : 1;
    const priceRangeForVolume = yMax - yMin;
    const volumeBottom = yMin;
    const volumeTop = yMin + priceRangeForVolume * 0.2; // Bottom 20% of price range

    // Helper function to determine point radius
    // Show filled dots only if there's 1 data point total (so it's visible)
    // If there's more than 1 data point, don't show dots (lines connect them)
    // Also hide dots when dragging to zoom
    const getPointRadius = (dataArray, totalValidPoints = 0) => {
        return (ctx) => {
            // Hide all points when dragging
            if (globalDragState.isDragging) return 0;
            
            const index = ctx.dataIndex;
            const value = dataArray[index];
            
            // If this point has no value, don't show a dot
            if (value == null || value === undefined) return 0;
            
            // If there's only 1 valid data point total, show a dot so it's visible
            // If there's more than 1, don't show dots (lines connect them)
            return totalValidPoints === 1 ? 3 : 0;
        };
    };
    
    // Helper function to determine hover radius - hide when dragging
    const getPointHoverRadius = () => {
        return (ctx) => {
            // Hide hover effect when dragging
            if (globalDragState.isDragging) return 0;
            return 4;
        };
    };
    
    // Count valid data points for buy and sell separately
    const buyDataPoints = filtered.map(p => p.high).filter(v => v != null && v !== undefined && !isNaN(v) && v > 0);
    const sellDataPoints = filtered.map(p => p.low).filter(v => v != null && v !== undefined && !isNaN(v) && v > 0);

    // Calculate trend for zoomed area (if zoomed) - do this before creating chartData
    // Use the same filtered data that the chart actually displays
    let zoomTrend = null;
    if (zoomBounds.min && zoomBounds.max && filtered.length > 0) {
        const zoomMinTime = zoomBounds.min.getTime();
        const zoomMaxTime = zoomBounds.max.getTime();
        
        // Filter to only datapoints that are actually visible in the zoomed chart
        // This matches what the chart displays (Chart.js will show data within xMin and xMax)
        const zoomedData = filtered.filter(p => {
            const pTime = p.ts * 1000;
            return pTime >= zoomMinTime && pTime <= zoomMaxTime;
        });
        
        if (zoomedData.length >= 2) {
            // Sort by timestamp to get first and last datapoints in zoomed area
            const sortedZoomed = [...zoomedData].sort((a, b) => a.ts - b.ts);
            const firstPoint = sortedZoomed[0];
            const lastPoint = sortedZoomed[sortedZoomed.length - 1];
            
            // Only calculate if timestamps are different (at least 2 different points)
            if (firstPoint.ts !== lastPoint.ts) {
                // Calculate mid prices (same logic as trend calculation in backend)
                // Use (high + low) / 2 if both exist, otherwise use whichever exists
                let firstMid = null;
                if (firstPoint.high != null && firstPoint.low != null) {
                    firstMid = (firstPoint.high + firstPoint.low) / 2;
                } else if (firstPoint.high != null) {
                    firstMid = firstPoint.high;
                } else if (firstPoint.low != null) {
                    firstMid = firstPoint.low;
                }
                
                let lastMid = null;
                if (lastPoint.high != null && lastPoint.low != null) {
                    lastMid = (lastPoint.high + lastPoint.low) / 2;
                } else if (lastPoint.high != null) {
                    lastMid = lastPoint.high;
                } else if (lastPoint.low != null) {
                    lastMid = lastPoint.low;
                }
                
                // Calculate trend if we have valid prices (same formula as backend)
                if (firstMid != null && lastMid != null && firstMid !== 0 && !isNaN(firstMid) && !isNaN(lastMid)) {
                    zoomTrend = ((lastMid - firstMid) / firstMid) * 100;
                }
            }
        }
    }

    const chartData = {
        labels: filtered.map(p => new Date(p.ts * 1000)),
        datasets: [
            {
                label: "Buy",
                data: filtered.map(p => ({ x: p.ts * 1000, y: p.high })),
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
                pointHoverRadius: getPointHoverRadius(),
                pointHoverBackgroundColor: "green",
                pointHoverBorderColor: "green",
                pointHoverBorderWidth: 2,
                spanGaps: true,
                yAxisID: 'y',
            },
            {
                label: "Sell",
                data: filtered.map(p => ({ x: p.ts * 1000, y: p.low })),
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
                pointHoverRadius: getPointHoverRadius(),
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
                    // Return a sentinel value with NaN y to maintain index alignment (Chart.js will skip NaN values)
                    return { x: p.ts * 1000, y: NaN, rawVolume: 0 };
                }),
                type: 'bar',
                backgroundColor: 'rgba(200, 200, 220, 0.6)',
                borderColor: 'rgba(200, 200, 220, 0.8)',
                borderWidth: 1,
                yAxisID: 'y',
                // Bar thickness will be set by custom plugin to ensure consistency
                barThickness: undefined,
                // Ensure bars are positioned at exact timestamps, not category centers
                base: undefined,
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { 
            mode: 'index', 
            intersect: false,
            // Match by x value (timestamp) instead of index to handle gaps
            axis: 'x'
        },
        plugins: {
            tooltip: {
                filter: function(tooltipItem) {
                    // Don't show tooltip if currently dragging
                    if (globalDragState.isDragging) return false;
                    
                    // Only show tooltips for items that have valid data
                    const parsedY = tooltipItem.parsed.y;
                    if (parsedY == null || isNaN(parsedY)) return false;
                    
                    // For Volume dataset, also check rawVolume
                    if (tooltipItem.dataset.label === 'Volume') {
                        const rawVolume = tooltipItem.raw?.rawVolume;
                        return rawVolume != null && rawVolume > 0;
                    }
                    
                    return true;
                },
                callbacks: {
                    title: items => {
                        const validItem = items.find(item => item.parsed && item.parsed.x != null);
                        if (!validItem) return '';
                        return new Date(validItem.parsed.x).toLocaleString();
                    },
                    label: function(context) {
                        const dataset = context.dataset;
                        const parsedY = context.parsed.y;
                        
                        // Safety check - should be filtered by filter callback, but just in case
                        if (parsedY == null || isNaN(parsedY)) return null;
                        
                        if (dataset.label === 'Volume') {
                            const rawVolume = context.raw?.rawVolume;
                            if (rawVolume && rawVolume > 0) {
                                // Show actual volume value
                                if (rawVolume >= 1000000) return `Volume: ${(rawVolume / 1000000).toFixed(1)}M`;
                                if (rawVolume >= 1000) return `Volume: ${(rawVolume / 1000).toFixed(1)}K`;
                                return `Volume: ${rawVolume.toLocaleString()}`;
                            }
                            return null;
                        }
                        return `${dataset.label}: ${parsedY.toLocaleString()} gp`;
                    }
                }
            }
        },
        scales: {
            x: { 
                type: 'time', 
                title: { display: false },
                offset: false,
                bounds: 'data',
                min: xMin,
                max: xMax,
                grace: 0,
                distribution: 'series',
                ticks: {
                    padding: 0,
                    // For 4H time range, generate ticks at whole and half hours
                    ...(timeRange === '4H' ? {
                        source: 'data',
                        maxTicksLimit: 20,
                        callback: function(value, index, ticks) {
                            const date = new Date(value);
                            const minutes = date.getMinutes();
                            // Only show labels at whole hours (0 min) or half hours (30 min)
                            if (minutes === 0 || minutes === 30) {
                                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            }
                            return '';
                        },
                        // Generate ticks at whole and half hours
                        stepSize: 30
                    } : {}),
                    // For 12H time range, show tick labels only at whole hours
                    ...(timeRange === '12H' ? {
                        callback: function(value, index, ticks) {
                            const date = new Date(value);
                            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }
                    } : {}),
                    // For 1D time range, show tick labels at every 2nd whole hour
                    ...(timeRange === '1D' ? {
                        callback: function(value, index, ticks) {
                            const date = new Date(value);
                            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }
                    } : {}),
                    // For 1W time range, show tick labels at each day
                    ...(timeRange === '1W' ? {
                        callback: function(value, index, ticks) {
                            const date = new Date(value);
                            return date.toLocaleDateString([], { weekday: 'long' });
                        }
                    } : {}),
                    // For 1M time range, show tick labels at every 3rd day
                    ...(timeRange === '1M' ? {
                        callback: function(value, index, ticks) {
                            const date = new Date(value);
                            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                        }
                    } : {}),
                    // For 3M time range, show tick labels at every 8th day
                    ...(timeRange === '3M' ? {
                        callback: function(value, index, ticks) {
                            const date = new Date(value);
                            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                        }
                    } : {}),
                    // For 1Y time range, show tick labels at each month
                    ...(timeRange === '1Y' ? {
                        callback: function(value, index, ticks) {
                            const date = new Date(value);
                            return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
                        }
                    } : {})
                },
                time: {
                    // For 4H time range, set unit to minutes with 30-minute step
                    ...(timeRange === '4H' ? {
                        unit: 'minute',
                        stepSize: 30,
                        displayFormats: {
                            minute: 'HH:mm'
                        },
                        // Round to nearest whole or half hour
                        round: 'minute'
                    } : {}),
                    // For 12H time range, set unit to hour to generate ticks at whole hours
                    ...(timeRange === '12H' ? {
                        unit: 'hour',
                        stepSize: 1,
                        displayFormats: {
                            hour: 'HH:mm'
                        }
                    } : {}),
                    // For 1D time range, set unit to hour with 2-hour step
                    ...(timeRange === '1D' ? {
                        unit: 'hour',
                        stepSize: 2,
                        displayFormats: {
                            hour: 'HH:mm'
                        }
                    } : {}),
                    // For 1W time range, set unit to day
                    ...(timeRange === '1W' ? {
                        unit: 'day',
                        stepSize: 1,
                        displayFormats: {
                            day: 'MMM d'
                        }
                    } : {}),
                    // For 1M time range, set unit to day with 3-day step
                    ...(timeRange === '1M' ? {
                        unit: 'day',
                        stepSize: 3,
                        displayFormats: {
                            day: 'MMM d'
                        }
                    } : {}),
                    // For 3M time range, set unit to day with 8-day step
                    ...(timeRange === '3M' ? {
                        unit: 'day',
                        stepSize: 8,
                        displayFormats: {
                            day: 'MMM d'
                        }
                    } : {}),
                    // For 1Y time range, set unit to month
                    ...(timeRange === '1Y' ? {
                        unit: 'month',
                        stepSize: 1,
                        displayFormats: {
                            month: 'MMM yyyy'
                        }
                    } : {})
                },
                // For 4H, use afterBuildTicks to generate ticks at whole and half hours
                ...(timeRange === '4H' ? {
                    afterBuildTicks: (axis) => {
                        const ticks = [];
                        const min = axis.min;
                        const max = axis.max;
                        
                        // Start from the first whole or half hour after min
                        const startDate = new Date(min);
                        const startMinutes = startDate.getMinutes();
                        let firstTickMinutes = 0;
                        if (startMinutes > 30) {
                            // If we're past :30, start at next whole hour
                            firstTickMinutes = 60;
                            startDate.setHours(startDate.getHours() + 1);
                            startDate.setMinutes(0);
                        } else if (startMinutes > 0) {
                            // If we're past :00 but before :30, start at :30
                            firstTickMinutes = 30;
                            startDate.setMinutes(30);
                        } else {
                            // Already at whole hour
                            startDate.setMinutes(0);
                        }
                        
                        let currentTick = startDate.getTime();
                        const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
                        
                        while (currentTick <= max) {
                            ticks.push({ value: currentTick });
                            currentTick += thirtyMinutes;
                        }
                        
                        axis.ticks = ticks;
                    }
                } : {}),
                // For 12H, use afterBuildTicks to generate ticks at every whole hour
                ...(timeRange === '12H' ? {
                    afterBuildTicks: (axis) => {
                        const ticks = [];
                        const min = axis.min;
                        const max = axis.max;
                        
                        // Start from the first whole hour at or after min
                        const startDate = new Date(min);
                        startDate.setMinutes(0);
                        startDate.setSeconds(0);
                        startDate.setMilliseconds(0);
                        
                        // If we're not already at a whole hour, move to the next one
                        if (startDate.getTime() < min) {
                            startDate.setHours(startDate.getHours() + 1);
                        }
                        
                        let currentTick = startDate.getTime();
                        const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
                        
                        while (currentTick <= max) {
                            ticks.push({ value: currentTick });
                            currentTick += oneHour;
                        }
                        
                        axis.ticks = ticks;
                    }
                } : {}),
                // For 1D, use afterBuildTicks to generate ticks at every 2nd whole hour
                ...(timeRange === '1D' ? {
                    afterBuildTicks: (axis) => {
                        const ticks = [];
                        const min = axis.min;
                        const max = axis.max;
                        
                        // Start from the first whole hour at or after min
                        const startDate = new Date(min);
                        startDate.setMinutes(0);
                        startDate.setSeconds(0);
                        startDate.setMilliseconds(0);
                        
                        // If we're not already at a whole hour, move to the next one
                        if (startDate.getTime() < min) {
                            startDate.setHours(startDate.getHours() + 1);
                        }
                        
                        // Round to nearest even hour (0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22)
                        const startHour = startDate.getHours();
                        if (startHour % 2 !== 0) {
                            startDate.setHours(startDate.getHours() + 1);
                        }
                        
                        let currentTick = startDate.getTime();
                        const twoHours = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
                        
                        while (currentTick <= max) {
                            ticks.push({ value: currentTick });
                            currentTick += twoHours;
                        }
                        
                        axis.ticks = ticks;
                    }
                } : {}),
                // For 1W, use afterBuildTicks to generate ticks at the start of each day
                ...(timeRange === '1W' ? {
                    afterBuildTicks: (axis) => {
                        const ticks = [];
                        const min = axis.min;
                        const max = axis.max;
                        
                        // Start from the first day (midnight) at or after min
                        const startDate = new Date(min);
                        startDate.setHours(0);
                        startDate.setMinutes(0);
                        startDate.setSeconds(0);
                        startDate.setMilliseconds(0);
                        
                        // If we're not already at midnight, move to the next day
                        if (startDate.getTime() < min) {
                            startDate.setDate(startDate.getDate() + 1);
                        }
                        
                        let currentTick = startDate.getTime();
                        const oneDay = 24 * 60 * 60 * 1000; // 1 day in milliseconds
                        
                        while (currentTick <= max) {
                            ticks.push({ value: currentTick });
                            currentTick += oneDay;
                        }
                        
                        axis.ticks = ticks;
                    }
                } : {}),
                // For 1M, use afterBuildTicks to generate ticks at every 3rd day
                ...(timeRange === '1M' ? {
                    afterBuildTicks: (axis) => {
                        const ticks = [];
                        const min = axis.min;
                        const max = axis.max;
                        
                        // Start from the first day (midnight) at or after min
                        const startDate = new Date(min);
                        startDate.setHours(0);
                        startDate.setMinutes(0);
                        startDate.setSeconds(0);
                        startDate.setMilliseconds(0);
                        
                        // If we're not already at midnight, move to the next day
                        if (startDate.getTime() < min) {
                            startDate.setDate(startDate.getDate() + 1);
                        }
                        
                        // Round to nearest day that's a multiple of 3 from the start
                        // We'll align to days 1, 4, 7, 10, 13, 16, 19, 22, 25, 28 of the month
                        // Or we can just start from the first day and increment by 3
                        let currentTick = startDate.getTime();
                        const threeDays = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds
                        
                        while (currentTick <= max) {
                            ticks.push({ value: currentTick });
                            currentTick += threeDays;
                        }
                        
                        axis.ticks = ticks;
                    }
                } : {}),
                // For 3M, use afterBuildTicks to generate ticks at every 8th day
                ...(timeRange === '3M' ? {
                    afterBuildTicks: (axis) => {
                        const ticks = [];
                        const min = axis.min;
                        const max = axis.max;
                        
                        // Start from the first day (midnight) at or after min
                        const startDate = new Date(min);
                        startDate.setHours(0);
                        startDate.setMinutes(0);
                        startDate.setSeconds(0);
                        startDate.setMilliseconds(0);
                        
                        // If we're not already at midnight, move to the next day
                        if (startDate.getTime() < min) {
                            startDate.setDate(startDate.getDate() + 1);
                        }
                        
                        let currentTick = startDate.getTime();
                        const eightDays = 8 * 24 * 60 * 60 * 1000; // 8 days in milliseconds
                        
                        while (currentTick <= max) {
                            ticks.push({ value: currentTick });
                            currentTick += eightDays;
                        }
                        
                        axis.ticks = ticks;
                    }
                } : {}),
                // For 1Y, use afterBuildTicks to generate ticks at the start of each month
                ...(timeRange === '1Y' ? {
                    afterBuildTicks: (axis) => {
                        const ticks = [];
                        const min = axis.min;
                        const max = axis.max;
                        
                        // Start from the first day of the month at or after min
                        const startDate = new Date(min);
                        startDate.setDate(1); // First day of the month
                        startDate.setHours(0);
                        startDate.setMinutes(0);
                        startDate.setSeconds(0);
                        startDate.setMilliseconds(0);
                        
                        // If we're not already at the first of the month, move to the next month
                        if (startDate.getTime() < min) {
                            startDate.setMonth(startDate.getMonth() + 1);
                        }
                        
                        let currentTick = startDate.getTime();
                        
                        while (currentTick <= max) {
                            ticks.push({ value: currentTick });
                            // Move to the first day of the next month
                            const nextDate = new Date(currentTick);
                            nextDate.setMonth(nextDate.getMonth() + 1);
                            currentTick = nextDate.getTime();
                        }
                        
                        axis.ticks = ticks;
                    }
                } : {}),
            },
            y: { 
                title: { display: false },
                min: yMin,
                max: yMax,
                ticks: {
                    stepSize: wholeNumberStep,
                    callback: function(value) {
                        // Only show ticks at whole numbers, hide decimals
                        if (value % 1 !== 0) {
                            return '';
                        }
                        const rounded = Math.round(value);
                        // Use compact formatting for large numbers (k, m, b)
                        if (rounded >= 1000000000) {
                            return (rounded / 1000000000).toFixed(1).replace(/\.0$/, '') + 'b';
                        } else if (rounded >= 1000000) {
                            return (rounded / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
                        } else if (rounded >= 1000) {
                            return (rounded / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
                        }
                        return rounded.toLocaleString();
                    }
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
                            <div style={{ height: '60vh', position: 'relative' }}>
                                {/* Reset Zoom Button and Zoom Trend */}
                                {zoomBounds.min && zoomBounds.max && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '40px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            zIndex: 10,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                                        }}
                                    >
                                        {zoomTrend !== null && (
                                            <div
                                                style={{
                                                    fontSize: '0.875rem',
                                                    fontWeight: '600',
                                                    color: zoomTrend >= 0 ? '#10b981' : '#ef4444',
                                                }}
                                                title={`Trend for zoomed area: ${zoomTrend >= 0 ? '+' : ''}${zoomTrend.toFixed(2)}%`}
                                            >
                                                Trend: {zoomTrend >= 0 ? '+' : ''}{zoomTrend.toFixed(2)}%
                                            </div>
                                        )}
                                        <button
                                            onClick={() => {
                                                setZoomBounds({ min: null, max: null });
                                            }}
                                            style={{
                                                padding: '6px 12px',
                                                backgroundColor: '#3b82f6',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem',
                                                fontWeight: '500',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.target.style.backgroundColor = '#2563eb';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.target.style.backgroundColor = '#3b82f6';
                                            }}
                                        >
                                            Reset Zoom
                                        </button>
                                    </div>
                                )}
                                <Line 
                                    key={`chart-${selectedGranularity}`}
                                    ref={chartRef} 
                                    data={chartData} 
                                    options={chartOptions} 
                                />
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
                        backgroundColor: '#1f2937',
                        color: '#fff',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        minWidth: '300px',
                        maxWidth: '400px',
                        zIndex: 1000,
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                        pointerEvents: 'none',
                    }}
                >
                    {loading ? (
                        <div>Loading calculation details...</div>
                    ) : tooltipData ? (
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: '8px', borderBottom: '1px solid #374151', paddingBottom: '4px' }}>
                                Trend Calculation
                            </div>
                            {tooltipData.current && tooltipData.previous ? (
                                <>
                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontWeight: 500, marginBottom: '4px' }}>Current Price:</div>
                                        <div style={{ marginLeft: '8px', fontSize: '11px', color: '#d1d5db' }}>
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
                                        <div style={{ marginLeft: '8px', fontSize: '11px', color: '#d1d5db' }}>
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
                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #374151' }}>
                                        <div style={{ fontWeight: 500, marginBottom: '4px' }}>Calculation:</div>
                                        <div style={{ marginLeft: '8px', fontSize: '11px', color: '#d1d5db', fontFamily: 'monospace' }}>
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
                                <div style={{ color: '#9ca3af' }}>
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
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
};

const valueStyle = {
    fontSize: "16px",
    fontWeight: 500,
    color: "#111827",
};
