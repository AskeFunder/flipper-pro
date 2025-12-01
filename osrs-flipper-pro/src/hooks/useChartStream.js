import { useState, useEffect, useRef } from "react";
import { apiFetchJson } from "../utils/api";

/**
 * Custom hook for chart data with append-only updates
 * Only appends new chart points, doesn't replace entire dataset
 */
export function useChartStream(canonicalData, timeRange) {
    const [chartData, setChartData] = useState([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const lastTimestampRef = useRef(null);
    const isInitialMountRef = useRef(true);
    
    const timeOptions = [
        { label: '4H', ms: 4 * 3600e3, granularity: '4h' },
        { label: '12H', ms: 12 * 3600e3, granularity: '5m' },
        { label: '1D', ms: 24 * 3600e3, granularity: '5m' },
        { label: '1W', ms: 7 * 24 * 3600e3, granularity: '1h' },
        { label: '1M', ms: 30 * 24 * 3600e3 + 6 * 3600e3, granularity: '6h' },
        { label: '3M', ms: 90 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' },
        { label: '1Y', ms: 365 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' },
    ];
    
    // Track previous timeRange to detect changes
    const prevTimeRangeRef = useRef(timeRange);
    
    useEffect(() => {
        if (!canonicalData?.item_id) {
            setChartData([]);
            setIsInitialLoading(false);
            lastTimestampRef.current = null;
            prevTimeRangeRef.current = timeRange;
            return;
        }
        
        const selected = timeOptions.find(o => o.label === timeRange);
        const granularity = selected ? selected.granularity : '5m';
        
        // Detect time range change
        const timeRangeChanged = prevTimeRangeRef.current !== timeRange;
        if (timeRangeChanged) {
            // Reset state on time range change
            isInitialMountRef.current = true;
            lastTimestampRef.current = null;
            prevTimeRangeRef.current = timeRange;
        }
        
        const fetchChart = async () => {
            try {
                const data = await apiFetchJson(`/api/prices/chart/${granularity}/${canonicalData.item_id}`);
                const newData = data || [];
                
                if (isInitialMountRef.current || lastTimestampRef.current === null || timeRangeChanged) {
                    // Initial load or time range change: set all data
                    setChartData(newData);
                    if (newData.length > 0) {
                        lastTimestampRef.current = newData[newData.length - 1].ts; // Latest timestamp
                    }
                    setIsInitialLoading(false);
                    isInitialMountRef.current = false;
                } else {
                    // Polling: only append new points
                    if (newData.length === 0) return;
                    
                    const latestTimestamp = newData[newData.length - 1].ts;
                    
                    // Find new points (after last known timestamp)
                    const newPoints = newData.filter(p => p.ts > lastTimestampRef.current);
                    
                    if (newPoints.length > 0) {
                        // Append new points
                        setChartData(prev => {
                            // Combine existing with new, avoiding duplicates
                            const existingTimestamps = new Set(prev.map(p => p.ts));
                            const uniqueNewPoints = newPoints.filter(p => !existingTimestamps.has(p.ts));
                            
                            if (uniqueNewPoints.length === 0) {
                                return prev; // No new points, return same reference
                            }
                            
                            // Append new points
                            return [...prev, ...uniqueNewPoints];
                        });
                        
                        lastTimestampRef.current = latestTimestamp;
                    }
                }
            } catch (err) {
                console.error("Error fetching chart data:", err);
                if (isInitialMountRef.current) {
                    setIsInitialLoading(false);
                    isInitialMountRef.current = false;
                }
            }
        };
        
        // Initial fetch
        const initialTimeout = setTimeout(fetchChart, 100);
        
        // Polling (only appends new points, doesn't trigger loading state)
        const interval = setInterval(fetchChart, 15000);
        
        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [canonicalData, timeRange]);
    
    return { chartData, isInitialLoading };
}

