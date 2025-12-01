import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";

/**
 * Memoized Price Chart Component
 * Matches ItemDetailPage chart logic exactly:
 * - For 12H, 1D, 1W: shows data from exactly X time before latest datapoint to latest
 * - Uses granularity steps to go back one point before the window
 * - Exact x-axis bounds with no padding
 */
const PriceChart = React.memo(({ priceData, timeRange, height = 300 }) => {
    const timeOptions = [
        { label: '4H', ms: 4 * 3600e3, granularity: '4h' },
        { label: '12H', ms: 12 * 3600e3, granularity: '5m' },
        { label: '1D', ms: 24 * 3600e3, granularity: '5m' },
        { label: '1W', ms: 7 * 24 * 3600e3, granularity: '1h' },
        { label: '1M', ms: 30 * 24 * 3600e3 + 6 * 3600e3, granularity: '6h' },
        { label: '3M', ms: 90 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' },
        { label: '1Y', ms: 365 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' },
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
    
    const selected = timeOptions.find(o => o.label === timeRange);
    const granularity = selected ? selected.granularity : '5m';
    const now = Date.now();
    
    // Filter data based on time range - matches ItemDetailPage logic exactly
    const filtered = useMemo(() => {
        if (priceData.length === 0) return [];
        if (!selected) return priceData;
        
        // For 12H, 1D, and 1W, show data from exactly X time before latest datapoint to latest datapoint
        if ((timeRange === '12H' || timeRange === '1D' || timeRange === '1W') && priceData.length > 0) {
            // Find the last datapoint within the granularity time (the latest datapoint)
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
                return priceData.filter(p => {
                    const pTime = p.ts * 1000;
                    // Use >= and <= to include both endpoints
                    return pTime >= timeBeforeLatest && pTime <= latestTimestamp;
                });
            } else {
                // Fallback to normal filtering if no recent datapoint
                const minTime = now - selected.ms;
                return priceData.filter(p => p.ts * 1000 >= minTime);
            }
        } else {
            // Normal filtering for other time ranges
            const minTime = selected ? (now - selected.ms) : 0;
            return priceData.filter(p => minTime === 0 || p.ts * 1000 >= minTime);
        }
    }, [priceData, timeRange, selected, now]);
    
    // Calculate chart bounds - matches ItemDetailPage exactly
    const { chartData, chartOptions, hasValidData } = useMemo(() => {
        // Calculate min/max for x-axis - NO PADDING, exact bounds
        let calculatedXMin = filtered.length > 0 ? new Date(Math.min(...filtered.map(p => p.ts * 1000))) : null;
        let calculatedXMax = filtered.length > 0 ? new Date(Math.max(...filtered.map(p => p.ts * 1000))) : null;
        
        // For 1W, adjust xMin to be exactly 7 days before latest datapoint
        if (timeRange === '1W' && priceData.length > 0) {
            const latestDataPoint = priceData
                .sort((a, b) => b.ts - a.ts)[0];
            
            if (latestDataPoint) {
                const latestTimestamp = latestDataPoint.ts * 1000;
                const timeBeforeLatest = latestTimestamp - (7 * 24 * 3600 * 1000);
                calculatedXMin = new Date(timeBeforeLatest);
                calculatedXMax = new Date(latestTimestamp);
            }
        }
        
        const xMin = calculatedXMin;
        const xMax = calculatedXMax;
        
        // Calculate min/max for y-axis with padding
        const allPrices = filtered.flatMap(p => [p.high, p.low]).filter(v => v != null && v > 0);
        const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
        const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;
        const hasValidData = allPrices.length > 0;
        const avgPrice = allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0;
        
        // Detect spikes/crashes: if max is more than 3x the average, it's likely a spike
        const hasSpike = maxPrice > avgPrice * 3 && avgPrice > 0;
        
        const priceRange = maxPrice - minPrice;
        const paddingAmount = priceRange > 0 ? priceRange * 0.2 : maxPrice * 0.1; // 20% padding, or 10% of max if range is 0
        
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
        
        const minPaddingBottom = minPrice - paddingAmount;
        const minPaddingTop = hasSpike ? maxPrice : maxPrice + paddingAmount;
        const paddedRange = minPaddingTop - minPaddingBottom;
        const niceStep = getNiceStep(paddedRange);
        const wholeNumberStep = Math.max(1, Math.round(niceStep));
        
        const roundToNiceTick = (value, step, roundDown = true) => {
            if (value <= 0) return 0;
            if (roundDown) {
                return Math.floor(value / step) * step;
            } else {
                return Math.ceil(value / step) * step;
            }
        };
        
        const yMin = Math.max(0, Math.floor(roundToNiceTick(minPaddingBottom, wholeNumberStep, true)));
        const yMax = Math.ceil(roundToNiceTick(minPaddingTop, wholeNumberStep, false));
        
        // Calculate volume data and scale for bottom 20% of graph
        const volumes = filtered.map(p => p.volume || 0).filter(v => v > 0);
        const maxVolume = volumes.length > 0 ? Math.max(...volumes) : 1;
        const priceRangeForVolume = yMax - yMin;
        const volumeBottom = yMin;
        const volumeTop = yMin + priceRangeForVolume * 0.2;
        
        const data = {
            datasets: [
                {
                    label: 'High',
                    data: filtered.map(p => ({
                        x: p.ts * 1000,
                        y: p.high
                    })).filter(p => p.y != null && p.y > 0),
                    borderColor: '#2bd97f',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                },
                {
                    label: 'Low',
                    data: filtered.map(p => ({
                        x: p.ts * 1000,
                        y: p.low
                    })).filter(p => p.y != null && p.y > 0),
                    borderColor: '#ff5c5c',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                },
                ...(volumes.length > 0 ? [{
                    label: 'Volume',
                    data: filtered.map((p) => ({
                        x: p.ts * 1000,
                        y: volumeBottom + ((p.volume || 0) / maxVolume) * (volumeTop - volumeBottom),
                        rawVolume: p.volume || 0
                    })),
                    type: 'bar',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1,
                }] : [])
            ]
        };
        
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
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
                    grid: {
                        display: false,
                    },
                    ticks: {
                        padding: 0,
                        color: '#9aa4b2',
                        // For 4H time range, generate ticks at whole and half hours
                        ...(timeRange === '4H' ? {
                            source: 'data',
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
                            const startDate = new Date(min);
                            const startMinutes = startDate.getMinutes();
                            let firstTickMinutes = 0;
                            if (startMinutes > 30) {
                                firstTickMinutes = 60;
                                startDate.setHours(startDate.getHours() + 1);
                                startDate.setMinutes(0);
                            } else if (startMinutes > 0) {
                                firstTickMinutes = 30;
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
                    // For 12H, use afterBuildTicks to generate ticks at every whole hour
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
                    // For 1D, use afterBuildTicks to generate ticks at every 2nd whole hour
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
                    // For 1W, use afterBuildTicks to generate ticks at the start of each day
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
                    // For 1M, use afterBuildTicks to generate ticks at every 3rd day
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
                            // Round to nearest multiple of 3 days
                            const daysSinceEpoch = Math.floor(startDate.getTime() / (24 * 60 * 60 * 1000));
                            const roundedDays = Math.ceil(daysSinceEpoch / 3) * 3;
                            startDate.setTime(roundedDays * 24 * 60 * 60 * 1000);
                            let currentTick = startDate.getTime();
                            const threeDays = 3 * 24 * 60 * 60 * 1000;
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
                            const startDate = new Date(min);
                            startDate.setHours(0);
                            startDate.setMinutes(0);
                            startDate.setSeconds(0);
                            startDate.setMilliseconds(0);
                            if (startDate.getTime() < min) {
                                startDate.setDate(startDate.getDate() + 1);
                            }
                            const daysSinceEpoch = Math.floor(startDate.getTime() / (24 * 60 * 60 * 1000));
                            const roundedDays = Math.ceil(daysSinceEpoch / 8) * 8;
                            startDate.setTime(roundedDays * 24 * 60 * 60 * 1000);
                            let currentTick = startDate.getTime();
                            const eightDays = 8 * 24 * 60 * 60 * 1000;
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
                                const nextMonth = new Date(currentTick);
                                nextMonth.setMonth(nextMonth.getMonth() + 1);
                                currentTick = nextMonth.getTime();
                            }
                            axis.ticks = ticks;
                        }
                    } : {})
                },
                y: {
                    min: yMin,
                    max: yMax,
                    ticks: {
                        stepSize: wholeNumberStep,
                        color: '#9aa4b2',
                        callback: function(value) {
                            if (value % 1 !== 0) return '';
                            const rounded = Math.round(value);
                            if (rounded >= 1000000000) return (rounded / 1000000000).toFixed(1).replace(/\.0$/, '') + 'b';
                            if (rounded >= 1000000) return (rounded / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
                            if (rounded >= 1000) return (rounded / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
                            return rounded.toLocaleString();
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.06)',
                    }
                }
            },
            plugins: {
                tooltip: {
                    filter: function(tooltipItem) {
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
                            return new Date(validItem.parsed.x).toLocaleString();
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
            }
        };
        
        return { chartData: data, chartOptions: options, hasValidData };
    }, [filtered, granularity, timeRange, priceData, now]);
    
    if (!hasValidData) {
        return (
            <div style={{ height: `${height}px`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: "#9aa4b2", fontSize: "14px", margin: 0 }}>No chart data available</p>
            </div>
        );
    }
    
    return (
        <div style={{ height: `${height}px`, position: "relative" }}>
            <Line data={chartData} options={chartOptions} />
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison: only re-render if data or timeRange actually changed
    if (prevProps.timeRange !== nextProps.timeRange) return false;
    if (prevProps.height !== nextProps.height) return false;
    if (prevProps.priceData !== nextProps.priceData) return false;
    return true; // All props are the same, skip re-render
});

PriceChart.displayName = 'PriceChart';

export default PriceChart;
