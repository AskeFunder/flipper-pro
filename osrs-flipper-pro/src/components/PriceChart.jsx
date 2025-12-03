import React, { forwardRef, useEffect, useRef } from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS } from "chart.js";

// Global drag state for direct event listeners (shared with parent)
let globalDragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0
};

// Export function to update drag state (called from parent)
export const setGlobalDragState = (state) => {
    globalDragState = { ...globalDragState, ...state };
};

// Register drag-to-zoom plugin (only once, globally)
let dragToZoomPluginRegistered = false;
if (!dragToZoomPluginRegistered) {
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
        afterInit: (chart) => {
            // Try to get callback from chart options
            if (chart.options && chart.options.onZoomChange && !chart.dragZoom.onZoomComplete) {
                chart.dragZoom.onZoomComplete = chart.options.onZoomChange;
            }
        },
        afterUpdate: (chart) => {
            // Try to get callback from chart options (in case it's set later)
            if (chart.options && chart.options.onZoomChange) {
                chart.dragZoom.onZoomComplete = chart.options.onZoomChange;
            }
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
                
                // Zoom regardless of selection size (as long as there's some width/height)
                const width = Math.abs(endX - startX);
                const height = Math.abs(endY - startY);
                if (width > 0 && height > 0) {
                    const xScale = chart.scales.x;
                    const minValue = xScale.getValueForPixel(startX);
                    const maxValue = xScale.getValueForPixel(endX);
                    
                    // Use chart-specific callback if available
                    const callback = chart.dragZoom.onZoomComplete || (chart.options && chart.options.onZoomChange);
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
                const callback = chart.dragZoom?.onZoomComplete || (chart.options && chart.options.onZoomChange);
                if (callback) {
                    callback(null, null);
                }
            }
        },
        afterDraw: (chart) => {
            if (!chart || !chart.chartArea || !chart.ctx) {
                return;
            }
            
            const isDragging = chart.dragZoom && chart.dragZoom.isDragging;
            if (isDragging) {
                const ctx = chart.ctx;
                const startX = Math.min(chart.dragZoom.startX, chart.dragZoom.endX);
                const endX = Math.max(chart.dragZoom.startX, chart.dragZoom.endX);
                const topY = chart.chartArea.top;
                const bottomY = chart.chartArea.bottom;
                
                ctx.save();
                ctx.fillStyle = 'rgba(54, 162, 235, 0.1)';
                ctx.fillRect(startX, topY, endX - startX, bottomY - topY);
                ctx.restore();
            }
        }
    });
    dragToZoomPluginRegistered = true;
}

const PriceChart = forwardRef(({ 
    priceData, 
    timeRange, 
    zoomBounds, 
    onZoomChange,
    height,
    isLoading = false
}, ref) => {
    // Track previous chart type and data to prevent empty flash when switching structures
    const prevIs4hChartRef = useRef(null);
    const prevChartDataRef = useRef(null);
    const prevChartOptionsRef = useRef(null);
    
    // Store original data bounds in ref so event handlers can access them
    const originalBoundsRef = useRef({ min: null, max: null });
    
    // Time range options
    const timeOptions = [
        { label: '4H', ms: 4 * 3600e3, granularity: '4h' },
        { label: '12H', ms: 12 * 3600e3, granularity: '5m' },
        { label: '1D', ms: 24 * 3600e3, granularity: '5m' },
        { label: '1W', ms: 7 * 24 * 3600e3, granularity: '1h' },
        { label: '1M', ms: 30 * 24 * 3600e3 + 6 * 3600e3, granularity: '6h' },
        { label: '3M', ms: 90 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' },
        { label: '1Y', ms: 365 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' },
        { label: 'All', ms: 0, granularity: '24h' },
    ];

    // Chart calculations
    const selected = timeOptions.find(o => o.label === timeRange);
    const granularity = selected ? selected.granularity : '5m';
    const is4hChart = granularity === '4h';
    
    // Track chart structure changes
    const chartStructureChanged = prevIs4hChartRef.current !== null && prevIs4hChartRef.current !== is4hChart;
    prevIs4hChartRef.current = is4hChart;
    
    const now = Date.now();
        
        // For 12H, 1D, and 1W, show data from exactly X time before latest datapoint to latest datapoint
    let filtered;
    if ((timeRange === '12H' || timeRange === '1D' || timeRange === '1W') && priceData.length > 0 && !is4hChart) {
        const latestDataPoint = priceData.sort((a, b) => b.ts - a.ts)[0];
            
            if (latestDataPoint) {
                const latestTimestamp = latestDataPoint.ts * 1000;
                
                let timeBeforeLatest;
                if (timeRange === '12H') {
                    timeBeforeLatest = latestTimestamp - (12 * 3600 * 1000);
                } else if (timeRange === '1D') {
                    timeBeforeLatest = latestTimestamp - (24 * 3600 * 1000);
                } else if (timeRange === '1W') {
                    timeBeforeLatest = latestTimestamp - (7 * 24 * 3600 * 1000);
                }
                
            filtered = priceData.filter(p => {
                    const pTime = p.ts * 1000;
                    return pTime >= timeBeforeLatest && pTime <= latestTimestamp;
                });
            } else {
            const minTime = selected ? (now - selected.ms) : 0;
            filtered = priceData.filter(p => minTime === 0 || p.ts * 1000 >= minTime);
            }
        } else {
            const minTime = selected ? (now - selected.ms) : 0;
        filtered = priceData.filter(p => minTime === 0 || p.ts * 1000 >= minTime);
        }
    
    // Calculate min/max for x-axis
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
                const timeBeforeLatest = latestTimestamp - (7 * 24 * 3600 * 1000);
                calculatedXMin = new Date(timeBeforeLatest);
                calculatedXMax = new Date(latestTimestamp);
            }
        }
        
    // Use zoom bounds if set, otherwise use calculated bounds
    const xMin = (zoomBounds && zoomBounds.min) ? zoomBounds.min : calculatedXMin;
    const xMax = (zoomBounds && zoomBounds.max) ? zoomBounds.max : calculatedXMax;
    
    // Reset zoom when timeRange changes
    const prevTimeRangeRef = useRef(timeRange);
    useEffect(() => {
        if (prevTimeRangeRef.current !== timeRange) {
            // Time range changed, reset zoom
            if (onZoomChange) {
                onZoomChange(null, null);
            }
            prevTimeRangeRef.current = timeRange;
        }
    }, [timeRange, onZoomChange]);
    
    // Update original bounds ref when calculated bounds change
    useEffect(() => {
        if (calculatedXMin && calculatedXMax) {
            const newMin = calculatedXMin.getTime();
            const newMax = calculatedXMax.getTime();
            const oldMin = originalBoundsRef.current.min;
            const oldMax = originalBoundsRef.current.max;
            
            // Only update if bounds actually changed
            if (oldMin !== newMin || oldMax !== newMax) {
                originalBoundsRef.current = {
                    min: newMin,
                    max: newMax
                };
            }
        }
    }, [calculatedXMin, calculatedXMax]);
    
    if (zoomBounds && zoomBounds.min && zoomBounds.max) {
        const formatDate = (date) => {
            if (!date) return null;
            return date.toLocaleString('en-US', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false 
            });
        };
        
        // Only log if zoom bounds changed (to avoid spam)
        const currentZoomKey = `${zoomBounds.min.getTime()}-${zoomBounds.max.getTime()}`;
        if (!window._lastZoomKey || window._lastZoomKey !== currentZoomKey) {
            window._lastZoomKey = currentZoomKey;
            console.log('PriceChart: Using zoom bounds for chart', {
                zoomBounds: {
                    min: formatDate(zoomBounds.min),
                    max: formatDate(zoomBounds.max)
                },
                xMin: formatDate(xMin),
                xMax: formatDate(xMax),
                calculatedXMin: formatDate(calculatedXMin),
                calculatedXMax: formatDate(calculatedXMax),
                originalBoundsRef: {
                    min: formatDate(new Date(originalBoundsRef.current.min)),
                    max: formatDate(new Date(originalBoundsRef.current.max))
                }
            });
        }
    }
        
        // Calculate min/max for y-axis with padding
    const allPrices = is4hChart 
        ? filtered.map(p => p.price).filter(v => v != null && v > 0)
        : filtered.flatMap(p => [p.high, p.low]).filter(v => v != null && v > 0);
        const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
        const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;
        const avgPrice = allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0;
        const hasSpike = maxPrice > avgPrice * 3 && avgPrice > 0;
        const priceRange = maxPrice - minPrice;
    const paddingAmount = priceRange > 0 ? priceRange * 0.2 : maxPrice * 0.1;
        
        // Helper function to find a "nice" step size for tick marks
        const getNiceStep = (range) => {
            if (range <= 0) return 1;
            const roughStep = range / 8;
            const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
            const normalized = roughStep / magnitude;
            let niceNormalized;
            if (normalized <= 1) niceNormalized = 1;
            else if (normalized <= 2) niceNormalized = 2;
            else if (normalized <= 5) niceNormalized = 5;
            else niceNormalized = 10;
            return niceNormalized * magnitude;
        };
        
        const roundToNiceTick = (value, step, roundDown = true) => {
            if (value <= 0) return 0;
            if (roundDown) {
                return Math.floor(value / step) * step;
            } else {
                return Math.ceil(value / step) * step;
            }
        };
        
    const minPaddingBottom = minPrice - paddingAmount;
    const minPaddingTop = hasSpike ? maxPrice : maxPrice + paddingAmount;
    const paddedRange = minPaddingTop - minPaddingBottom;
    const niceStep = getNiceStep(paddedRange);
    const wholeNumberStep = Math.max(1, Math.round(niceStep));
        const yMin = Math.max(0, Math.floor(roundToNiceTick(minPaddingBottom, wholeNumberStep, true)));
        const yMax = Math.ceil(roundToNiceTick(minPaddingTop, wholeNumberStep, false));
        
        // Calculate volume data and scale for bottom 20% of graph
    const volumes = is4hChart 
        ? [] 
        : filtered.map(p => p.volume || 0).filter(v => v > 0);
        const maxVolume = volumes.length > 0 ? Math.max(...volumes) : 1;
        const priceRangeForVolume = yMax - yMin;
        const volumeBottom = yMin;
        const volumeTop = yMin + priceRangeForVolume * 0.2;
        
    // Helper function to determine point radius
    const getPointRadius = (dataArray, totalValidPoints = 0) => {
        return (ctx) => {
            if (globalDragState.isDragging) return 0;
            const index = ctx.dataIndex;
            const value = dataArray[index];
            if (value == null || value === undefined) return 0;
            return totalValidPoints === 1 ? 3 : 0;
        };
    };
    
    const getPointHoverRadius = () => {
        return (ctx) => {
            if (globalDragState.isDragging) return 0;
            return 4;
        };
    };
    
    const buyDataPoints = is4hChart
        ? filtered.filter(p => p.type === 'low').map(p => p.price).filter(v => v != null && v !== undefined && !isNaN(v) && v > 0)
        : filtered.map(p => p.high).filter(v => v != null && v !== undefined && !isNaN(v) && v > 0);
    const sellDataPoints = is4hChart
        ? filtered.filter(p => p.type === 'high').map(p => p.price).filter(v => v != null && v !== undefined && !isNaN(v) && v > 0)
        : filtered.map(p => p.low).filter(v => v != null && v !== undefined && !isNaN(v) && v > 0);

    // Build chart data
    let chartData;
    if (is4hChart) {
        const sellEvents = filtered.filter(p => p.type === 'high').map(p => ({
            x: p.ts * 1000,
            y: p.price
        }));
        const buyEvents = filtered.filter(p => p.type === 'low').map(p => ({
            x: p.ts * 1000,
            y: p.price
        }));
        
        const allTimestamps = [...new Set(filtered.map(p => p.ts * 1000))].sort((a, b) => a - b);
        
        chartData = {
            labels: allTimestamps.map(ts => new Date(ts)),
            datasets: [
                {
                    label: "Sell",
                    data: sellEvents,
                    borderColor: "red",
                    backgroundColor: "red",
                    tension: 0,
                    pointRadius: 0,
                    pointBackgroundColor: "transparent",
                    pointBorderColor: "transparent",
                    pointBorderWidth: 0,
                    pointHoverRadius: 5,
                    pointHitRadius: 4,
                    pointHoverBackgroundColor: "red",
                    pointHoverBorderColor: "red",
                    pointHoverBorderWidth: 2,
                    spanGaps: false,
                    yAxisID: 'y',
                },
                {
                    label: "Buy",
                    data: buyEvents,
                    borderColor: "green",
                    backgroundColor: "green",
                    tension: 0,
                    pointRadius: 0,
                    pointBackgroundColor: "transparent",
                    pointBorderColor: "transparent",
                    pointBorderWidth: 0,
                    pointHoverRadius: 5,
                    pointHitRadius: 4,
                    pointHoverBackgroundColor: "green",
                    pointHoverBorderColor: "green",
                    pointHoverBorderWidth: 2,
                    spanGaps: false,
                    yAxisID: 'y',
                }
            ]
        };
    } else {
        chartData = {
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
                        if (vol > 0) {
                            const scaledY = volumeBottom + (vol / maxVolume) * (volumeTop - volumeBottom);
                            return { x: p.ts * 1000, y: scaledY, rawVolume: vol };
                        }
                        return { x: p.ts * 1000, y: NaN, rawVolume: 0 };
                    }),
                    type: 'bar',
                    backgroundColor: 'rgba(200, 200, 220, 0.6)',
                    borderColor: 'rgba(200, 200, 220, 0.8)',
                    borderWidth: 1,
                    yAxisID: 'y',
                    barThickness: undefined,
                    base: undefined,
                }
            ]
        };
    }

    // Store onZoomChange in a ref so plugin can access it
    const onZoomChangeRef = useRef(onZoomChange);
    useEffect(() => {
        onZoomChangeRef.current = onZoomChange;
    }, [onZoomChange]);

    // Calculate zoomTrend for zoomed area (if zoomed)
    let zoomTrend = null;
    if (zoomBounds && zoomBounds.min && zoomBounds.max && priceData.length > 0) {
        const zoomMinTime = zoomBounds.min.getTime();
        const zoomMaxTime = zoomBounds.max.getTime();
        
        // Get filtered data for trend calculation (same logic as chart filtering)
        let filteredForTrend;
        if ((timeRange === '12H' || timeRange === '1D' || timeRange === '1W') && priceData.length > 0 && !is4hChart) {
            const latestDataPoint = priceData.sort((a, b) => b.ts - a.ts)[0];
            if (latestDataPoint) {
                const latestTimestamp = latestDataPoint.ts * 1000;
                let timeBeforeLatest;
                if (timeRange === '12H') {
                    timeBeforeLatest = latestTimestamp - (12 * 3600 * 1000);
                } else if (timeRange === '1D') {
                    timeBeforeLatest = latestTimestamp - (24 * 3600 * 1000);
                } else if (timeRange === '1W') {
                    timeBeforeLatest = latestTimestamp - (7 * 24 * 3600 * 1000);
                }
                filteredForTrend = priceData.filter(p => {
                    const pTime = p.ts * 1000;
                    return pTime >= timeBeforeLatest && pTime <= latestTimestamp;
                });
            } else {
                const minTime = selected ? (now - selected.ms) : 0;
                filteredForTrend = priceData.filter(p => minTime === 0 || p.ts * 1000 >= minTime);
            }
        } else {
            const minTime = selected ? (now - selected.ms) : 0;
            filteredForTrend = priceData.filter(p => minTime === 0 || p.ts * 1000 >= minTime);
        }
        
        // Filter to only datapoints that are actually visible in the zoomed chart
        // Use the actual first and last datapoints in the zoom window (what's displayed)
        const zoomedData = filteredForTrend.filter(p => {
            const pTime = p.ts * 1000;
            return pTime >= zoomMinTime && pTime <= zoomMaxTime;
        });
        
        if (zoomedData.length >= 2) {
            // Sort by timestamp to get first and last timestamps in zoomed area (on x axis)
            const sortedZoomed = [...zoomedData].sort((a, b) => a.ts - b.ts);
            const firstTimestamp = sortedZoomed[0].ts;
            const lastTimestamp = sortedZoomed[sortedZoomed.length - 1].ts;
            
            // Only calculate if timestamps are different (at least 2 different points)
            if (firstTimestamp !== lastTimestamp) {
                // For aggregated data: find all points with first/last timestamp and get their high/low
                // Group by timestamp to handle cases where there might be multiple points per timestamp
                let firstHigh = null;
                let firstLow = null;
                let lastHigh = null;
                let lastLow = null;
                
                if (is4hChart) {
                    // For 4h chart: find high and low events at first and last timestamps
                    const firstTimestampPoints = zoomedData.filter(p => p.ts === firstTimestamp);
                    const lastTimestampPoints = zoomedData.filter(p => p.ts === lastTimestamp);
                    
                    firstHigh = firstTimestampPoints.find(p => p.type === 'high');
                    firstLow = firstTimestampPoints.find(p => p.type === 'low');
                    lastHigh = lastTimestampPoints.find(p => p.type === 'high');
                    lastLow = lastTimestampPoints.find(p => p.type === 'low');
                } else {
                    // For aggregated data: find all points with first/last timestamp
                    // Take the highest high and lowest low for each timestamp
                    const firstTimestampPoints = zoomedData.filter(p => p.ts === firstTimestamp);
                    const lastTimestampPoints = zoomedData.filter(p => p.ts === lastTimestamp);
                    
                    // Get the highest high and lowest low from all points at first timestamp
                    firstTimestampPoints.forEach(p => {
                        const high = typeof p.high === 'string' ? parseFloat(p.high) : p.high;
                        const low = typeof p.low === 'string' ? parseFloat(p.low) : p.low;
                        if (high != null && !isNaN(high) && (firstHigh == null || high > firstHigh)) {
                            firstHigh = high;
                        }
                        if (low != null && !isNaN(low) && (firstLow == null || low < firstLow)) {
                            firstLow = low;
                        }
                    });
                    
                    // Get the highest high and lowest low from all points at last timestamp
                    lastTimestampPoints.forEach(p => {
                        const high = typeof p.high === 'string' ? parseFloat(p.high) : p.high;
                        const low = typeof p.low === 'string' ? parseFloat(p.low) : p.low;
                        if (high != null && !isNaN(high) && (lastHigh == null || high > lastHigh)) {
                            lastHigh = high;
                        }
                        if (low != null && !isNaN(low) && (lastLow == null || low < lastLow)) {
                            lastLow = low;
                        }
                    });
                }
                
                // Convert to numbers if they're strings
                const firstHighNum = typeof firstHigh === 'string' ? parseFloat(firstHigh) : firstHigh;
                const firstLowNum = typeof firstLow === 'string' ? parseFloat(firstLow) : firstLow;
                const lastHighNum = typeof lastHigh === 'string' ? parseFloat(lastHigh) : lastHigh;
                const lastLowNum = typeof lastLow === 'string' ? parseFloat(lastLow) : lastLow;
                
                // Calculate windowstartmidprice
                let windowStartMidPrice = null;
                if (is4hChart) {
                    const firstHighPrice = firstHigh?.price != null ? (typeof firstHigh.price === 'string' ? parseFloat(firstHigh.price) : firstHigh.price) : null;
                    const firstLowPrice = firstLow?.price != null ? (typeof firstLow.price === 'string' ? parseFloat(firstLow.price) : firstLow.price) : null;
                    if (firstHighPrice != null && firstLowPrice != null) {
                        windowStartMidPrice = (firstHighPrice + firstLowPrice) / 2;
                    } else if (firstHighPrice != null) {
                        windowStartMidPrice = firstHighPrice;
                    } else if (firstLowPrice != null) {
                        windowStartMidPrice = firstLowPrice;
                    }
                } else {
                    if (firstHighNum != null && !isNaN(firstHighNum) && firstLowNum != null && !isNaN(firstLowNum)) {
                        windowStartMidPrice = (firstHighNum + firstLowNum) / 2;
                    } else if (firstHighNum != null && !isNaN(firstHighNum)) {
                        windowStartMidPrice = firstHighNum;
                    } else if (firstLowNum != null && !isNaN(firstLowNum)) {
                        windowStartMidPrice = firstLowNum;
                    }
                }
                
                // Calculate windowendmidprice
                let windowEndMidPrice = null;
                if (is4hChart) {
                    const lastHighPrice = lastHigh?.price != null ? (typeof lastHigh.price === 'string' ? parseFloat(lastHigh.price) : lastHigh.price) : null;
                    const lastLowPrice = lastLow?.price != null ? (typeof lastLow.price === 'string' ? parseFloat(lastLow.price) : lastLow.price) : null;
                    if (lastHighPrice != null && lastLowPrice != null) {
                        windowEndMidPrice = (lastHighPrice + lastLowPrice) / 2;
                    } else if (lastHighPrice != null) {
                        windowEndMidPrice = lastHighPrice;
                    } else if (lastLowPrice != null) {
                        windowEndMidPrice = lastLowPrice;
                    }
                } else {
                    if (lastHighNum != null && !isNaN(lastHighNum) && lastLowNum != null && !isNaN(lastLowNum)) {
                        windowEndMidPrice = (lastHighNum + lastLowNum) / 2;
                    } else if (lastHighNum != null && !isNaN(lastHighNum)) {
                        windowEndMidPrice = lastHighNum;
                    } else if (lastLowNum != null && !isNaN(lastLowNum)) {
                        windowEndMidPrice = lastLowNum;
                    }
                }
                
                // Calculate zoomedwindowtrend
                if (windowStartMidPrice != null && windowEndMidPrice != null && windowStartMidPrice > 0) {
                    zoomTrend = ((windowEndMidPrice - windowStartMidPrice) / windowStartMidPrice) * 100;
                } else {
                    console.warn('PriceChart: Cannot calculate trend - missing values', {
                        windowStartMidPrice,
                        windowEndMidPrice,
                        windowStartMidPriceValid: windowStartMidPrice != null && windowStartMidPrice > 0
                    });
                }
            }
        }
    }

    // Build chart options with all time range specific configurations
    const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
        // Only disable animation when chart structure changes (4h <-> aggregated)
        // Keep animation for same-structure changes (aggregated <-> aggregated)
        animation: chartStructureChanged ? false : {
            duration: 300 // Smooth animation for same-structure updates
        },
        // Store zoom callback in options so plugin can access it
        onZoomChange: onZoomChange ? ((min, max) => {
            if (min === null && max === null) {
                onZoomChangeRef.current?.(null, null);
            } else {
                onZoomChangeRef.current?.(min, max);
            }
        }) : null,
        onHover: (event, activeElements, chart) => {
            // Also set callback directly on chart when hover happens (backup method)
            if (chart && chart.dragZoom && !chart.dragZoom.onZoomComplete && onZoomChangeRef.current) {
                chart.dragZoom.onZoomComplete = (min, max) => {
                    if (min === null && max === null) {
                        onZoomChangeRef.current?.(null, null);
                    } else {
                        onZoomChangeRef.current?.(min, max);
                    }
                };
            }
        },
            interaction: {
            mode: (is4hChart ? 'nearest' : 'index'),
            intersect: false
        },
        plugins: {
            tooltip: {
                filter: function(tooltipItem, index, tooltipItems) {
                    if (globalDragState.isDragging) return false;
                    const parsedY = tooltipItem.parsed.y;
                    if (parsedY == null || isNaN(parsedY)) return false;
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
                        const date = new Date(validItem.parsed.x);
                        if (is4hChart) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const hours = String(date.getHours()).padStart(2, '0');
                            const minutes = String(date.getMinutes()).padStart(2, '0');
                            const seconds = String(date.getSeconds()).padStart(2, '0');
                            return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
                        }
                        return date.toLocaleString();
                    },
                    label: function(context) {
                        const dataset = context.dataset;
                        const parsedY = context.parsed.y;
                        if (parsedY == null || isNaN(parsedY)) return null;
                        if (dataset.label === 'Volume') {
                            const rawVolume = context.raw?.rawVolume;
                            if (rawVolume && rawVolume > 0) {
                                if (rawVolume >= 1000000) return `Volume: ${(rawVolume / 1000000).toFixed(1)}M`;
                                if (rawVolume >= 1000) return `Volume: ${(rawVolume / 1000).toFixed(1)}K`;
                                return `Volume: ${rawVolume.toLocaleString()}`;
                            }
                            return null;
                        }
                        return `${dataset.label}: ${parsedY.toLocaleString()} gp`;
                    }
                },
                backgroundColor: '#151a22',
                titleColor: '#e6e9ef',
                bodyColor: '#e6e9ef',
                borderColor: 'rgba(255, 255, 255, 0.06)',
                borderWidth: 1,
            },
            legend: {
                labels: {
                    color: '#e6e9ef',
                }
            }
            },
            scales: {
                x: { 
                    type: 'time', 
                    title: { display: false },
                    offset: false,
                bounds: (is4hChart ? false : 'data'),
                    min: xMin,
                    max: xMax,
                    grace: 0,
                    distribution: 'series',
                    ticks: {
                        padding: 0,
                        color: '#9aa4b2',
                        ...(timeRange === '4H' ? {
                        source: (is4hChart ? 'auto' : 'data'),
                            maxTicksLimit: 20,
                            callback: function(value, index, ticks) {
                                const date = new Date(value);
                                const minutes = date.getMinutes();
                                if (minutes === 0 || minutes === 30) {
                                    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                }
                                return '';
                            },
                            stepSize: 30
                        } : {}),
                        ...(timeRange === '12H' ? {
                            callback: function(value, index, ticks) {
                                const date = new Date(value);
                                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            }
                        } : {}),
                        ...(timeRange === '1D' ? {
                            callback: function(value, index, ticks) {
                                const date = new Date(value);
                                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            }
                        } : {}),
                        ...(timeRange === '1W' ? {
                            callback: function(value, index, ticks) {
                                const date = new Date(value);
                                return date.toLocaleDateString([], { weekday: 'long' });
                            }
                        } : {}),
                        ...(timeRange === '1M' ? {
                            callback: function(value, index, ticks) {
                                const date = new Date(value);
                                return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                            }
                        } : {}),
                        ...(timeRange === '3M' ? {
                            callback: function(value, index, ticks) {
                                const date = new Date(value);
                                return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                            }
                        } : {}),
                        ...(timeRange === '1Y' ? {
                            callback: function(value, index, ticks) {
                                const date = new Date(value);
                                return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
                            }
                        } : {})
                    },
                    time: {
                    ...(timeRange === '4H' && is4hChart ? {
                        unit: 'second',
                        displayFormats: {
                            second: 'HH:mm:ss',
                            minute: 'HH:mm'
                        }
                    } : timeRange === '4H' ? {
                            unit: 'minute',
                            stepSize: 30,
                            displayFormats: {
                                minute: 'HH:mm'
                            },
                            round: 'minute'
                        } : {}),
                        ...(timeRange === '12H' ? {
                            unit: 'hour',
                            stepSize: 1,
                            displayFormats: {
                                hour: 'HH:mm'
                            }
                        } : {}),
                        ...(timeRange === '1D' ? {
                            unit: 'hour',
                            stepSize: 2,
                            displayFormats: {
                                hour: 'HH:mm'
                            }
                        } : {}),
                        ...(timeRange === '1W' ? {
                            unit: 'day',
                            stepSize: 1,
                            displayFormats: {
                                day: 'MMM d'
                            }
                        } : {}),
                        ...(timeRange === '1M' ? {
                            unit: 'day',
                            stepSize: 3,
                            displayFormats: {
                                day: 'MMM d'
                            }
                        } : {}),
                        ...(timeRange === '3M' ? {
                            unit: 'day',
                            stepSize: 8,
                            displayFormats: {
                                day: 'MMM d'
                            }
                        } : {}),
                        ...(timeRange === '1Y' ? {
                            unit: 'month',
                            stepSize: 1,
                            displayFormats: {
                                month: 'MMM yyyy'
                            }
                        } : {})
                    },
                    ...(timeRange === '4H' ? {
                        afterBuildTicks: (axis) => {
                            const ticks = [];
                            const min = axis.min;
                            const max = axis.max;
                            const startDate = new Date(min);
                            const startMinutes = startDate.getMinutes();
                            if (startMinutes > 30) {
                                startDate.setHours(startDate.getHours() + 1);
                                startDate.setMinutes(0);
                            } else if (startMinutes > 0) {
                                startDate.setMinutes(30);
                            } else {
                                startDate.setMinutes(0);
                            }
                            let currentTick = startDate.getTime();
                            const thirtyMinutes = 30 * 60 * 1000;
                            while (currentTick <= max) {
                                ticks.push({ value: currentTick });
                                currentTick += thirtyMinutes;
                            }
                            axis.ticks = ticks;
                        }
                    } : {}),
                    ...(timeRange === '12H' ? {
                        afterBuildTicks: (axis) => {
                            const ticks = [];
                            const min = axis.min;
                            const max = axis.max;
                            const startDate = new Date(min);
                            startDate.setMinutes(0);
                            startDate.setSeconds(0);
                            startDate.setMilliseconds(0);
                            if (startDate.getTime() < min) {
                                startDate.setHours(startDate.getHours() + 1);
                            }
                            let currentTick = startDate.getTime();
                            const oneHour = 60 * 60 * 1000;
                            while (currentTick <= max) {
                                ticks.push({ value: currentTick });
                                currentTick += oneHour;
                            }
                            axis.ticks = ticks;
                        }
                    } : {}),
                    ...(timeRange === '1D' ? {
                        afterBuildTicks: (axis) => {
                            const ticks = [];
                            const min = axis.min;
                            const max = axis.max;
                            const startDate = new Date(min);
                            startDate.setMinutes(0);
                            startDate.setSeconds(0);
                            startDate.setMilliseconds(0);
                            if (startDate.getTime() < min) {
                                startDate.setHours(startDate.getHours() + 1);
                            }
                            const startHour = startDate.getHours();
                            if (startHour % 2 !== 0) {
                                startDate.setHours(startDate.getHours() + 1);
                            }
                            let currentTick = startDate.getTime();
                            const twoHours = 2 * 60 * 60 * 1000;
                            while (currentTick <= max) {
                                ticks.push({ value: currentTick });
                                currentTick += twoHours;
                            }
                            axis.ticks = ticks;
                        }
                    } : {}),
                    ...(timeRange === '1W' ? {
                        afterBuildTicks: (axis) => {
                            const ticks = [];
                            const min = axis.min;
                            const max = axis.max;
                            const startDate = new Date(min);
                            startDate.setHours(0);
                            startDate.setMinutes(0);
                            startDate.setSeconds(0);
                            startDate.setMilliseconds(0);
                            if (startDate.getTime() < min) {
                                startDate.setDate(startDate.getDate() + 1);
                            }
                            let currentTick = startDate.getTime();
                            const oneDay = 24 * 60 * 60 * 1000;
                            while (currentTick <= max) {
                                ticks.push({ value: currentTick });
                                currentTick += oneDay;
                            }
                            axis.ticks = ticks;
                        }
                    } : {}),
                    ...(timeRange === '1M' ? {
                        afterBuildTicks: (axis) => {
                            const ticks = [];
                            const min = axis.min;
                            const max = axis.max;
                            const startDate = new Date(min);
                            startDate.setHours(0);
                            startDate.setMinutes(0);
                            startDate.setSeconds(0);
                            startDate.setMilliseconds(0);
                            if (startDate.getTime() < min) {
                                startDate.setDate(startDate.getDate() + 1);
                            }
                            let currentTick = startDate.getTime();
                            const threeDays = 3 * 24 * 60 * 60 * 1000;
                            while (currentTick <= max) {
                                ticks.push({ value: currentTick });
                                currentTick += threeDays;
                            }
                            axis.ticks = ticks;
                        }
                    } : {}),
                    ...(timeRange === '3M' ? {
                        afterBuildTicks: (axis) => {
                            const ticks = [];
                            const min = axis.min;
                            const max = axis.max;
                            const startDate = new Date(min);
                            startDate.setHours(0);
                            startDate.setMinutes(0);
                            startDate.setSeconds(0);
                            startDate.setMilliseconds(0);
                            if (startDate.getTime() < min) {
                                startDate.setDate(startDate.getDate() + 1);
                            }
                            let currentTick = startDate.getTime();
                            const eightDays = 8 * 24 * 60 * 60 * 1000;
                            while (currentTick <= max) {
                                ticks.push({ value: currentTick });
                                currentTick += eightDays;
                            }
                            axis.ticks = ticks;
                        }
                    } : {}),
                    ...(timeRange === '1Y' ? {
                        afterBuildTicks: (axis) => {
                            const ticks = [];
                            const min = axis.min;
                            const max = axis.max;
                            const startDate = new Date(min);
                            startDate.setDate(1);
                            startDate.setHours(0);
                            startDate.setMinutes(0);
                            startDate.setSeconds(0);
                            startDate.setMilliseconds(0);
                            if (startDate.getTime() < min) {
                                startDate.setMonth(startDate.getMonth() + 1);
                            }
                            let currentTick = startDate.getTime();
                            while (currentTick <= max) {
                                ticks.push({ value: currentTick });
                            const nextDate = new Date(currentTick);
                            nextDate.setMonth(nextDate.getMonth() + 1);
                            currentTick = nextDate.getTime();
                            }
                            axis.ticks = ticks;
                        }
                } : {}),
                grid: {
                    display: false,
                    drawBorder: false,
                }
                },
                y: {
                type: 'linear',
                position: 'left',
                title: { display: false },
                    min: yMin,
                    max: yMax,
                    ticks: {
                        stepSize: wholeNumberStep,
                        color: '#9aa4b2',
                        callback: function(value) {
                        if (value % 1 !== 0) {
                            return '';
                        }
                            const rounded = Math.round(value);
                        if (rounded >= 1000000000) {
                            return (rounded / 1000000000).toFixed(1).replace(/\.0$/, '') + 'b';
                        } else if (rounded >= 1000000) {
                            return (rounded / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
                        } else if (rounded >= 1000) {
                            return (rounded / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
                        }
                            return rounded.toLocaleString();
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.06)',
                    }
                }
        }
    };

    // Set up direct canvas event listeners for drag-to-zoom (Chart.js doesn't send mousedown/mouseup to afterEvent)
    useEffect(() => {
        if (!ref || !onZoomChange) return;
        
        let cleanup = null;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let endX = 0;
        let endY = 0;
        let chartInstance = null;
        let canvas = null;
        
        const trySetup = () => {
            if (!ref.current) {
                // Retry after a short delay
                setTimeout(trySetup, 50);
                return;
            }
            
            // react-chartjs-2 stores chart instance in different places
            chartInstance = ref.current._chart || ref.current.chartInstance || (typeof ref.current.getChart === 'function' ? ref.current.getChart() : ref.current);
            canvas = chartInstance?.canvas || ref.current.canvas || ref.current;
            
            if (!canvas || !canvas.getBoundingClientRect || !chartInstance || !chartInstance.chartArea) {
                // Chart not ready yet, retry
                setTimeout(trySetup, 50);
                return;
            }
        
            // Helper function to snap X position to nearest data point and return both pixel position and timestamp
            const snapToNearestDataPoint = (x, chart) => {
                if (!chart || !chart.scales || !chart.scales.x) {
                    console.warn('PriceChart: snapToNearestDataPoint - chart or scale missing', { chart: !!chart, hasScales: !!chart?.scales, hasXScale: !!chart?.scales?.x });
                    return { pixelX: x, timestamp: null };
                }
                
                const xScale = chart.scales.x;
                const datasets = chart.data.datasets;
                if (!datasets || datasets.length === 0) {
                    console.warn('PriceChart: snapToNearestDataPoint - no datasets', { datasetsCount: datasets?.length });
                    return { pixelX: x, timestamp: null };
                }
                
                // Get all data points from first dataset (they all have same x values)
                const firstDataset = datasets[0];
                if (!firstDataset || !firstDataset.data) {
                    console.warn('PriceChart: snapToNearestDataPoint - no data in first dataset', { hasDataset: !!firstDataset, hasData: !!firstDataset?.data, dataLength: firstDataset?.data?.length });
                    return { pixelX: x, timestamp: null };
                }
                
                // CRITICAL: When zoomed, getPixelForValue uses the zoomed scale
                // We need to calculate pixel positions based on original bounds, not current zoomed scale
                const originalMin = originalBoundsRef.current.min ?? xScale.min;
                const originalMax = originalBoundsRef.current.max ?? xScale.max;
                const chartAreaLeft = chart.chartArea.left;
                const chartAreaRight = chart.chartArea.right;
                const chartAreaWidth = chartAreaRight - chartAreaLeft;
                
                // Find nearest data point using original scale
                let nearestX = x;
                let nearestTimestamp = null;
                let minDistance = Infinity;
                let checkedPoints = 0;
                
                firstDataset.data.forEach((point) => {
                    if (point && point.x != null) {
                        checkedPoints++;
                        // Calculate pixel position based on original scale, not zoomed scale
                        const pointTimestamp = point.x;
                        const ratio = (pointTimestamp - originalMin) / (originalMax - originalMin);
                        const pointX = chartAreaLeft + (ratio * chartAreaWidth);
                        const distance = Math.abs(pointX - x);
                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestX = pointX;
                            nearestTimestamp = pointTimestamp;
                        }
                    }
                });
                
                if (checkedPoints === 0) {
                    console.warn('PriceChart: snapToNearestDataPoint - no valid points found', { 
                        dataLength: firstDataset.data.length,
                        samplePoint: firstDataset.data[0]
                    });
                    return { pixelX: x, timestamp: null };
                }
                
                return { pixelX: nearestX, timestamp: nearestTimestamp };
            };
            
            const handleMouseDown = (e) => {
                if (!chartInstance || !chartInstance.chartArea) return;
                
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Check if click is within chart area
                if (x >= chartInstance.chartArea.left && x <= chartInstance.chartArea.right &&
                    y >= chartInstance.chartArea.top && y <= chartInstance.chartArea.bottom) {
                    // Snap to nearest data point
                    const snapped = snapToNearestDataPoint(x, chartInstance);
                    const snappedX = snapped.pixelX;
                    const startTimestamp = snapped.timestamp;
                    
                    isDragging = true;
                    startX = snappedX;
                    startY = y;
                    endX = snappedX;
                    endY = y;
                    
                    // Store the timestamp of the snapped point for accurate zoom calculation
                    if (!chartInstance.dragZoom) {
                        chartInstance.dragZoom = {
                            isDragging: false,
                            startX: 0,
                            startY: 0,
                            endX: 0,
                            endY: 0,
                            startTimestamp: null,
                            endTimestamp: null
                        };
                    }
                    chartInstance.dragZoom.startTimestamp = startTimestamp;
                    
                    // Store drag state in chart instance so plugin can access it
                    if (!chartInstance.dragZoom) {
                        chartInstance.dragZoom = {
                            isDragging: false,
                            startX: 0,
                            startY: 0,
                            endX: 0,
                            endY: 0
                        };
                    }
                    chartInstance.dragZoom.isDragging = true;
                    chartInstance.dragZoom.startX = snappedX;
                    chartInstance.dragZoom.startY = y;
                    chartInstance.dragZoom.endX = snappedX;
                    chartInstance.dragZoom.endY = y;
                    canvas.style.cursor = 'crosshair';
                    chartInstance.draw();
                }
            };
            
            const handleMouseMove = (e) => {
                if (!isDragging || !chartInstance || !chartInstance.chartArea) return;
                
                const rect = canvas.getBoundingClientRect();
                const rawX = e.clientX - rect.left;
                const rawY = e.clientY - rect.top;
                
                // Snap to nearest data point
                const snapped = snapToNearestDataPoint(rawX, chartInstance);
                const snappedX = snapped.pixelX;
                
                endX = snappedX;
                endY = rawY;
                
                if (chartInstance.dragZoom) {
                    chartInstance.dragZoom.endX = snappedX;
                    chartInstance.dragZoom.endY = rawY;
                    chartInstance.dragZoom.endTimestamp = snapped.timestamp;
                }
                chartInstance.draw();
            };
            
            const handleMouseUp = (e) => {
                if (!isDragging || !chartInstance || !chartInstance.chartArea) return;
                
                isDragging = false;
                canvas.style.cursor = 'default';
                
                // Use the latest endX/endY from mouseup event, not from closure
                const rect = canvas.getBoundingClientRect();
                const rawX = e.clientX - rect.left;
                const rawY = e.clientY - rect.top;
                
                // Snap to nearest data point
                const snapped = snapToNearestDataPoint(rawX, chartInstance);
                const snappedEndX = snapped.pixelX;
                const endTimestamp = snapped.timestamp;
                
                endX = snappedEndX;
                endY = rawY;
                
                if (chartInstance.dragZoom) {
                    chartInstance.dragZoom.isDragging = false;
                    chartInstance.dragZoom.endX = snappedEndX;
                    chartInstance.dragZoom.endY = rawY;
                    chartInstance.dragZoom.endTimestamp = endTimestamp;
                }
                
                // Use the snapped positions for visual feedback
                const finalStartX = Math.min(startX, snappedEndX);
                const finalEndXCalculated = Math.max(startX, snappedEndX);
                const finalStartY = Math.min(startY, rawY);
                const finalEndYCalculated = Math.max(startY, rawY);
                
                const width = Math.abs(finalEndXCalculated - finalStartX);
                const height = Math.abs(finalEndYCalculated - finalStartY);
                
                // Zoom regardless of selection size (as long as there's some width/height)
                if (chartInstance.scales && chartInstance.scales.x && width > 0 && height > 0 && onZoomChange) {
                    // CRITICAL: Use the actual timestamps from the snapped data points, not calculated from pixels
                    // This ensures 100% accuracy - we snap to data points, so use their timestamps directly
                    const startTimestamp = chartInstance.dragZoom?.startTimestamp;
                    const endTimestamp = chartInstance.dragZoom?.endTimestamp;
                    
                    let minValue, maxValue;
                    
                    if (startTimestamp != null && endTimestamp != null) {
                        // Use the actual timestamps from snapped data points
                        minValue = Math.min(startTimestamp, endTimestamp);
                        maxValue = Math.max(startTimestamp, endTimestamp);
                    } else {
                        // Fallback: calculate from pixel positions if timestamps not available
                        const xScale = chartInstance.scales.x;
                        const originalMin = originalBoundsRef.current.min ?? xScale.min;
                        const originalMax = originalBoundsRef.current.max ?? xScale.max;
                        const chartAreaLeft = chartInstance.chartArea.left;
                        const chartAreaRight = chartInstance.chartArea.right;
                        const chartAreaWidth = chartAreaRight - chartAreaLeft;
                        
                        const startRatio = Math.max(0, Math.min(1, (finalStartX - chartAreaLeft) / chartAreaWidth));
                        const endRatio = Math.max(0, Math.min(1, (finalEndXCalculated - chartAreaLeft) / chartAreaWidth));
                        
                        minValue = originalMin + (startRatio * (originalMax - originalMin));
                        maxValue = originalMin + (endRatio * (originalMax - originalMin));
                    }
                    
                    const formatDate = (date) => {
                        if (!date) return null;
                        return date.toLocaleString('en-US', { 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit', 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit',
                            hour12: false 
                        });
                    };
                    
                    const minDate = new Date(minValue);
                    const maxDate = new Date(maxValue);
                    
                    console.log('PriceChart: Zoom window calculation', {
                        mousePositions: {
                            startX: startX,
                            endX: snappedEndX,
                            finalStartX: finalStartX,
                            finalEndX: finalEndXCalculated,
                            width: width,
                            height: height
                        },
                        snappedTimestamps: {
                            startTimestamp: startTimestamp ? formatDate(new Date(startTimestamp)) : null,
                            endTimestamp: endTimestamp ? formatDate(new Date(endTimestamp)) : null,
                            startTimestampRaw: startTimestamp,
                            endTimestampRaw: endTimestamp
                        },
                        calculatedTimestamps: {
                            minValue: formatDate(minDate),
                            maxValue: formatDate(maxDate),
                            minValueRaw: minValue,
                            maxValueRaw: maxValue
                        },
                        method: startTimestamp != null && endTimestamp != null ? 'direct_timestamps' : 'pixel_calculation'
                    });
                    
                    console.log('PriceChart: Calling onZoomChange with', {
                        min: formatDate(minDate),
                        max: formatDate(maxDate)
                    });
                    
                    onZoomChange(new Date(minValue), new Date(maxValue));
                }
                
                startX = 0;
                startY = 0;
                endX = 0;
                endY = 0;
                if (chartInstance.dragZoom) {
                    chartInstance.dragZoom.startX = 0;
                    chartInstance.dragZoom.startY = 0;
                    chartInstance.dragZoom.endX = 0;
                    chartInstance.dragZoom.endY = 0;
                }
                chartInstance.draw();
            };
            
            const handleDoubleClick = (e) => {
                if (onZoomChange) {
                    onZoomChange(null, null);
                }
            };
            
            // Also listen on window for mouseup in case user drags outside canvas
            const handleWindowMouseUp = (e) => {
                if (isDragging) {
                    handleMouseUp(e);
                }
            };
            
            canvas.addEventListener('mousedown', handleMouseDown);
            canvas.addEventListener('mousemove', handleMouseMove);
            canvas.addEventListener('mouseup', handleMouseUp);
            canvas.addEventListener('dblclick', handleDoubleClick);
            window.addEventListener('mouseup', handleWindowMouseUp);
            
            cleanup = () => {
                canvas.removeEventListener('mousedown', handleMouseDown);
                canvas.removeEventListener('mousemove', handleMouseMove);
                canvas.removeEventListener('mouseup', handleMouseUp);
                canvas.removeEventListener('dblclick', handleDoubleClick);
                window.removeEventListener('mouseup', handleWindowMouseUp);
            };
        };
        
        // Start trying to set up
        trySetup();
        
        return () => {
            if (cleanup) cleanup();
        };
    }, [ref, onZoomChange]); // Don't re-setup on chartData/timeRange changes - this breaks zoom

    const containerStyle = height 
        ? { height: `${height}px`, position: 'relative' }
        : { position: 'relative', width: '100%', height: '100%', minHeight: '400px' };

    // Check if there's any valid data to display
    const hasValidData = priceData && priceData.length > 0 && filtered && filtered.length > 0;
    
    // Check if data structure matches chart type (4h data should have 'type' field, aggregated should have 'high'/'low')
    // This prevents showing wrong chart type when priceData hasn't updated yet after structure change
    const dataStructureMatches = !hasValidData || 
        (is4hChart && filtered.some(p => p.type !== undefined)) ||
        (!is4hChart && filtered.some(p => p.high !== undefined || p.low !== undefined));
    const hasValidDataWithCorrectStructure = hasValidData && dataStructureMatches;

    // If we have valid data with correct structure, store it for next render (to show while loading new structure)
    if (hasValidDataWithCorrectStructure && chartData) {
        prevChartDataRef.current = chartData;
        prevChartOptionsRef.current = chartOptions;
    }

    // If structure changed and we don't have valid data yet, show previous chart
    // This prevents empty flash when switching between 4h and aggregated
    // Also show if we have priceData but filtered is empty (data structure mismatch)
    // BUT: If we have valid data with correct structure now, show the new chart even if structure changed
    const hasPriceDataButNoFiltered = priceData && priceData.length > 0 && (!filtered || filtered.length === 0);
    if (chartStructureChanged && !hasValidDataWithCorrectStructure && (hasPriceDataButNoFiltered || !priceData || priceData.length === 0 || !dataStructureMatches) && prevChartDataRef.current) {
        return (
            <div style={containerStyle}>
                <Line 
                    ref={ref} 
                    data={prevChartDataRef.current} 
                    options={prevChartOptionsRef.current} 
                />
            </div>
        );
    }
    
    // If no valid data and not loading, show "No data" message
    if (!hasValidDataWithCorrectStructure && !isLoading && !chartStructureChanged) {
    return (
            <div style={{
                ...containerStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9aa4b2',
                fontSize: '16px',
                fontStyle: 'italic',
                minHeight: height ? `${height}px` : '400px'
            }}>
                No price data available in selected range.
        </div>
    );
    }

    // If loading and no valid data and no previous chart, show empty container
    if (isLoading && !hasValidDataWithCorrectStructure && !prevChartDataRef.current) {
        return (
            <div style={{
                ...containerStyle,
                minHeight: height ? `${height}px` : '400px',
                backgroundColor: '#151a22'
            }} />
        );
    }

    // Render chart with zoom controls
    const chartElement = (
        <Line 
            ref={ref} 
            data={chartData} 
            options={chartOptions} 
        />
    );

    return (
        <div style={containerStyle}>
            {/* Reset Zoom Button and Zoom Trend */}
            {zoomBounds && zoomBounds.min && zoomBounds.max && (
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
                        backgroundColor: '#181e27',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255,255,255,0.06)',
                    }}
                >
                    {zoomTrend !== null && (
                        <div
                            style={{
                                fontSize: '0.875rem',
                                fontWeight: '600',
                                color: zoomTrend >= 0 ? '#2bd97f' : '#ff5c5c',
                            }}
                            title={`Trend for zoomed area: ${zoomTrend >= 0 ? '+' : ''}${zoomTrend.toFixed(2)}%`}
                        >
                            Trend: {zoomTrend >= 0 ? '+' : ''}{zoomTrend.toFixed(2)}%
                        </div>
                    )}
                    <button
                        onClick={() => {
                            if (onZoomChange) {
                                onZoomChange(null, null);
                            }
                        }}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#202737',
                            color: '#e6e9ef',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#2a3245';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.backgroundColor = '#202737';
                        }}
                    >
                        Reset Zoom
                    </button>
                </div>
            )}
            {chartElement}
        </div>
    );
});

PriceChart.displayName = 'PriceChart';

export default PriceChart;
