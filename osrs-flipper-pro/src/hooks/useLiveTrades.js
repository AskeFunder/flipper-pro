import { useState, useEffect, useRef } from "react";
import { apiFetchJson } from "../utils/api";

/**
 * Custom hook for recent trades with diff-based updates
 * Only prepends new trades, doesn't replace entire array
 */
export function useLiveTrades(canonicalData) {
    const [trades, setTrades] = useState([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const lastTimestampRef = useRef(null);
    const isInitialMountRef = useRef(true);
    
    useEffect(() => {
        if (!canonicalData?.item_id) {
            setTrades([]);
            setIsInitialLoading(false);
            lastTimestampRef.current = null;
            return;
        }
        
        const fetchRecent = async () => {
            try {
                const data = await apiFetchJson(`/api/prices/recent/${canonicalData.item_id}`);
                const newTrades = data || [];
                
                if (isInitialMountRef.current) {
                    // Initial load: set all trades
                    setTrades(newTrades);
                    if (newTrades.length > 0) {
                        lastTimestampRef.current = newTrades[0].ts; // Most recent trade timestamp
                    }
                    setIsInitialLoading(false);
                    isInitialMountRef.current = false;
                } else {
                    // Polling: only add new trades
                    if (newTrades.length === 0) return;
                    
                    const latestTimestamp = newTrades[0].ts;
                    
                    // If we have a last timestamp, only add trades newer than it
                    if (lastTimestampRef.current !== null) {
                        const newTradesOnly = newTrades.filter(t => t.ts > lastTimestampRef.current);
                        
                        if (newTradesOnly.length > 0) {
                            // Prepend new trades to existing list
                            setTrades(prev => {
                                // Combine new trades with existing, avoiding duplicates
                                const existingTimestamps = new Set(prev.map(t => t.ts));
                                const uniqueNewTrades = newTradesOnly.filter(t => !existingTimestamps.has(t.ts));
                                
                                if (uniqueNewTrades.length === 0) {
                                    return prev; // No new trades, return same reference
                                }
                                
                                // Prepend new trades and limit to 20 total
                                return [...uniqueNewTrades, ...prev].slice(0, 20);
                            });
                            
                            lastTimestampRef.current = latestTimestamp;
                        }
                    } else {
                        // No last timestamp yet, set all trades
                        setTrades(newTrades);
                        lastTimestampRef.current = latestTimestamp;
                    }
                }
            } catch (err) {
                console.error("Error fetching recent trades:", err);
                if (isInitialMountRef.current) {
                    setIsInitialLoading(false);
                    isInitialMountRef.current = false;
                }
            }
        };
        
        // Initial fetch
        const initialTimeout = setTimeout(fetchRecent, 150);
        
        // Polling (only adds new trades, doesn't trigger loading state)
        const interval = setInterval(fetchRecent, 15000);
        
        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [canonicalData]);
    
    return { trades, isInitialLoading };
}

