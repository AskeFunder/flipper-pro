import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../utils/api";
import { taxExemptItems } from "../config/taxExemptItems";

/**
 * Custom hook for live price data with patch updates
 * Only updates price block, doesn't trigger full re-renders
 */
export function useLivePrice(canonicalData) {
    const [priceData, setPriceData] = useState(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const isInitialMountRef = useRef(true);
    
    useEffect(() => {
        if (!canonicalData?.item_id) {
            setPriceData(null);
            setIsInitialLoading(false);
            return;
        }
        
        const fetchBasic = async () => {
            try {
                const res = await apiFetch(`/api/prices/latest/${canonicalData.item_id}`);
                if (res.ok) {
                    const data = await res.json();
                    
                    const high = data.high;
                    const low = data.low;
                    const high_timestamp = data.ts;
                    const low_timestamp = data.lowTs;
                    
                    let margin = null;
                    let roi_percent = null;
                    let spread_percent = null;
                    let max_profit = null;
                    let max_investment = null;
                    const limit = canonicalData.limit || null;
                    
                    if (high != null && low != null) {
                        const isTaxExempt = canonicalData.name && taxExemptItems.has(canonicalData.name);
                        const tax = isTaxExempt ? 0 : Math.floor(high * 0.02);
                        margin = high - tax - low;
                        roi_percent = low > 0 ? (margin / low) * 100 : 0;
                        spread_percent = high > 0 ? ((high - low) / high) * 100 : 0;
                        max_profit = margin * (limit || 0);
                        max_investment = low * (limit || 0);
                    }
                    
                    // Patch update: only update if values actually changed
                    setPriceData(prev => {
                        if (!prev) {
                            return {
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
                            };
                        }
                        
                        // Only update if values changed
                        if (
                            prev.high === high &&
                            prev.low === low &&
                            prev.high_timestamp === high_timestamp &&
                            prev.low_timestamp === low_timestamp
                        ) {
                            return prev; // No change, return same reference
                        }
                        
                        return {
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
                        };
                    });
                    
                    // Only set loading to false on initial mount
                    if (isInitialMountRef.current) {
                        setIsInitialLoading(false);
                        isInitialMountRef.current = false;
                    }
                }
            } catch (err) {
                console.error("Error fetching basic data:", err);
                if (isInitialMountRef.current) {
                    setIsInitialLoading(false);
                    isInitialMountRef.current = false;
                }
            }
        };
        
        // Initial fetch
        const initialTimeout = setTimeout(fetchBasic, 50);
        
        // Polling (only updates data, doesn't trigger loading state)
        const interval = setInterval(fetchBasic, 15000);
        
        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [canonicalData]);
    
    return { priceData, isInitialLoading };
}

