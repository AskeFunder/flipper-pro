import { useState, useEffect, useRef } from "react";
import { apiFetchJson } from "../utils/api";

// Global cache for sparkline data (per itemId)
const sparklineCache = new Map();

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Hook to fetch sparkline data with caching
 * @param {number} itemId - Item ID
 * @param {number} days - Number of days (default: 7)
 * @returns {Array} Array of { timestamp, price } or null if loading/error
 */
export function useSparkline(itemId, days = 7) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const abortControllerRef = useRef(null);

    useEffect(() => {
        if (!itemId) {
            setData(null);
            return;
        }

        // Check cache first
        const cacheKey = `${itemId}-${days}`;
        const cached = sparklineCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            setData(cached.data);
            return;
        }

        // Abort previous request if still pending
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Create new abort controller
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setLoading(true);
        
        apiFetchJson(`/api/prices/sparkline/${itemId}?days=${days}`, {
            signal: controller.signal
        })
            .then((response) => {
                if (!controller.signal.aborted) {
                    const sparklineData = Array.isArray(response) ? response : [];
                    setData(sparklineData);
                    
                    // Cache the data
                    sparklineCache.set(cacheKey, {
                        data: sparklineData,
                        timestamp: Date.now()
                    });
                }
            })
            .catch((error) => {
                if (error.name !== "AbortError" && !controller.signal.aborted) {
                    console.error(`[useSparkline] Error fetching sparkline for item ${itemId}:`, error);
                    setData(null);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => {
            controller.abort();
        };
    }, [itemId, days]);

    return { data, loading };
}


