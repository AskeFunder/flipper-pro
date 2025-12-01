import React, { useState, useEffect, useRef } from "react";
import {
    formatCompact,
    formatPriceFull,
    formatColoredNumber,
    formatRoi,
    timeAgo,
    nameToSlug,
} from "../utils/formatting";
import Sparkline from "./Sparkline";
import { apiFetch } from "../utils/api";

const baseIconURL = "https://oldschool.runescape.wiki/images/thumb";

// Global cache for sparkline data (per itemId)
const sparklineCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Primary columns (high visual emphasis)
const PRIMARY_COLUMNS = new Set([
    "buy_price",
    "sell_price",
    "margin",
    "roi",
]);

// Secondary columns (dimmed)
const SECONDARY_COLUMNS = new Set([
    "spread",
    "limit",
    "turnover_1h",
    "turnover_24h",
]);

/**
 * Get momentum color based on trend_1h and trend_24h
 * @param {number|null} trend1h - Trend 1h value
 * @param {number|null} trend24h - Trend 24h value
 * @returns {string} Color class name
 */
function getMomentumColor(trend1h, trend24h) {
    const h1 = trend1h != null ? parseFloat(trend1h) : null;
    const h24 = trend24h != null ? parseFloat(trend24h) : null;
    
    // Both positive = bright green
    if (h1 != null && h24 != null && h1 > 0 && h24 > 0) {
        return "momentum-bright-green";
    }
    
    // Both negative = red
    if (h1 != null && h24 != null && h1 < 0 && h24 < 0) {
        return "momentum-red";
    }
    
    // Mixed (one positive, one negative) = yellow
    if (h1 != null && h24 != null && ((h1 > 0 && h24 < 0) || (h1 < 0 && h24 > 0))) {
        return "momentum-yellow";
    }
    
    // Flat (both near zero or null) = grey
    const threshold = 0.1;
    if (
        (h1 == null || (h1 >= -threshold && h1 <= threshold)) &&
        (h24 == null || (h24 >= -threshold && h24 <= threshold))
    ) {
        return "momentum-grey";
    }
    
    // Default to grey
    return "momentum-grey";
}

/**
 * Get stroke color from momentum class
 * @param {string} momentumClass - Momentum class name
 * @returns {string} Hex color code
 */
function getSparklineColor(momentumClass) {
    const colorMap = {
        "momentum-bright-green": "#2bd97f",
        "momentum-red": "#ff5c5c",
        "momentum-yellow": "#f2c94c",
        "momentum-grey": "#9aa4b2",
    };
    return colorMap[momentumClass] || "#9aa4b2";
}

const BrowseTableRow = React.memo(({ item, visibleColumns, onItemClick }) => {
    const icon = item.icon || `${item.name}.png`;
    const safe = encodeURIComponent(icon.replace(/ /g, "_"));
    const slug = nameToSlug(item.name);
    const itemUrl = `/item/${item.id}-${encodeURIComponent(slug)}`;
    
    // Get momentum color based on trends
    const momentumClass = getMomentumColor(item.trend_1h, item.trend_24h);
    const sparklineColor = getSparklineColor(momentumClass);
    
    // Sparkline data state
    const [sparklineData, setSparklineData] = useState(null);
    const [sparklineLoading, setSparklineLoading] = useState(false);
    const abortControllerRef = useRef(null);
    
    // Lazy fetch sparkline data
    useEffect(() => {
        if (!item.id) return;
        
        // Check cache first
        const cacheKey = `${item.id}-7`;
        const cached = sparklineCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            setSparklineData(cached.data);
            return;
        }
        
        // Abort previous request if still pending
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        
        // Create new abort controller
        const controller = new AbortController();
        abortControllerRef.current = controller;
        
        setSparklineLoading(true);
        
        // Use apiFetch directly to check status before parsing
        apiFetch(`/api/prices/sparkline/${item.id}?days=7`, {
            signal: controller.signal
        })
            .then((response) => {
                if (controller.signal.aborted) return;
                
                // Handle 404 silently (endpoint not available or no data)
                if (response.status === 404) {
                    setSparklineData(null);
                    return;
                }
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response.json();
            })
            .then((response) => {
                if (controller.signal.aborted || !response) return;
                
                const data = Array.isArray(response) ? response : [];
                setSparklineData(data);
                
                // Cache the data
                sparklineCache.set(cacheKey, {
                    data: data,
                    timestamp: Date.now()
                });
            })
            .catch((error) => {
                if (error.name !== "AbortError" && !controller.signal.aborted) {
                    // Only log non-404 errors for debugging
                    // 404s are handled silently above
                    if (!error.message || !error.message.includes('404')) {
                        console.error(`[BrowseTableRow] Error fetching sparkline for item ${item.id}:`, error);
                    }
                    setSparklineData(null);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setSparklineLoading(false);
                }
            });
        
        return () => {
            controller.abort();
        };
    }, [item.id]);
    
    const handleRowClick = (e) => {
        // Don't navigate if clicking on a link (let browser handle it)
        if (e.target.tagName === "A" || e.target.closest("a")) {
            return;
        }
        // For normal clicks on the row, do SPA navigation
        if (onItemClick) {
            onItemClick(item.id, item.name);
        }
    };
    
    const handleLinkClick = (e) => {
        // If it's a normal click (not Ctrl/Cmd/Middle), do SPA navigation
        if (!e.ctrlKey && !e.metaKey && e.button === 0) {
            e.preventDefault();
            if (onItemClick) {
                onItemClick(item.id, item.name);
            }
        }
        // Otherwise, let browser handle it (Ctrl/Cmd/Middle-click for new tab)
    };
    
    return (
        <tr 
            className={`browse-table-row ${momentumClass}`}
            onClick={handleRowClick}
        >
            <td className="browse-table-cell browse-table-cell-item">
                <a
                    href={itemUrl}
                    onClick={handleLinkClick}
                    className="browse-item-link"
                >
                    <img
                        src={`${baseIconURL}/${safe}/32px-${safe}`}
                        alt={item.name}
                        width={24}
                        height={24}
                        className="browse-item-icon"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                    <span className="browse-item-name">{item.name}</span>
                </a>
            </td>
            {/* Sparkline column - first column after item name */}
            <td className="browse-table-cell" style={{ width: "90px", padding: "6px 8px" }}>
                {sparklineLoading ? (
                    <div style={{ width: "80px", height: "24px", background: "#202737", borderRadius: "2px" }} />
                ) : (
                    <Sparkline data={sparklineData} color={sparklineColor} width={80} height={24} />
                )}
            </td>
            {visibleColumns.map((col) => {
                const value = item[col.id];
                const isPrimary = PRIMARY_COLUMNS.has(col.id);
                const isSecondary = SECONDARY_COLUMNS.has(col.id);
                
                let display;
                let cellClassName = "browse-table-cell";
                
                if (isPrimary) {
                    cellClassName += " browse-table-cell-primary";
                } else if (isSecondary) {
                    cellClassName += " browse-table-cell-secondary";
                }

                if (col.id === "buy_price") {
                    display = (
                        <>
                            <div className="browse-table-value-primary">{formatPriceFull(item.buy_price)}</div>
                            <div className="browse-table-time">{timeAgo(item.buy_time)}</div>
                        </>
                    );
                } else if (col.id === "sell_price") {
                    display = (
                        <>
                            <div className="browse-table-value-primary">{formatPriceFull(item.sell_price)}</div>
                            <div className="browse-table-time">{timeAgo(item.sell_time)}</div>
                        </>
                    );
                } else if (col.id.startsWith("buy_sell_rate_")) {
                    if (value == null) {
                        display = <span className="browse-table-value-null">–</span>;
                    } else {
                        const num = parseFloat(value);
                        if (isNaN(num)) {
                            display = <span className="browse-table-value-null">–</span>;
                        } else {
                            const colorClass = num < 1 ? "browse-table-value-negative" : "browse-table-value-positive";
                            display = <span className={colorClass}>{num.toFixed(2)}</span>;
                        }
                    }
                } else if (col.id === "roi" || col.id.startsWith("trend_")) {
                    const numValue = value != null ? parseFloat(value) : null;
                    if (numValue == null || isNaN(numValue)) {
                        display = <span className="browse-table-value-null">–</span>;
                    } else {
                        const colorClass = numValue >= 0 ? "browse-table-value-positive" : "browse-table-value-negative";
                        display = <span className={colorClass}>{formatRoi(value)}</span>;
                    }
                } else if (col.id === "margin" || col.id === "max_profit") {
                    const numValue = value != null ? parseFloat(value) : null;
                    if (numValue == null || isNaN(numValue)) {
                        display = <span className="browse-table-value-null">–</span>;
                    } else {
                        const colorClass = numValue >= 0 ? "browse-table-value-positive" : "browse-table-value-negative";
                        display = <span className={colorClass}>{formatColoredNumber(value)}</span>;
                    }
                } else {
                    display = <span className="browse-table-value-default">{formatCompact(value)}</span>;
                }

                return (
                    <td key={col.id} className={cellClassName}>
                        {display}
                    </td>
                );
            })}
        </tr>
    );
});

BrowseTableRow.displayName = "BrowseTableRow";

export default BrowseTableRow;

