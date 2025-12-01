import React, { useState, useEffect, useRef } from "react";
import {
    formatPriceFull,
    formatColoredNumber,
    formatRoi,
} from "../utils/formatting";
import { apiFetch } from "../utils/api";
import { useLivePrice } from "../hooks/useLivePrice";
import { useLiveTrades } from "../hooks/useLiveTrades";
import { useChartStream } from "../hooks/useChartStream";
import PriceChart from "./PriceChart";
import TradeList from "./TradeList";
import AdvancedMetrics from "./AdvancedMetrics";

const timeOptions = [
    { label: '4H', ms: 4 * 3600e3, granularity: '4h' },
    { label: '12H', ms: 12 * 3600e3, granularity: '5m' },
    { label: '1D', ms: 24 * 3600e3, granularity: '5m' },
    { label: '1W', ms: 7 * 24 * 3600e3, granularity: '1h' },
    { label: '1M', ms: 30 * 24 * 3600e3 + 6 * 3600e3, granularity: '6h' },
    { label: '3M', ms: 90 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' },
    { label: '1Y', ms: 365 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' },
];

const baseIconURL = "https://oldschool.runescape.wiki/images/thumb";

/**
 * Side Panel Component (Phase 7: Real Data Integration)
 * 
 * Displays real item data in a side panel:
 * - Header with item info
 * - Live price block
 * - Interactive chart
 * - Recent trades
 * - Advanced metrics (lazy-loaded with 5-minute cache)
 */
export default function SidePanel({ item, onClose }) {
    const [isMounted, setIsMounted] = useState(false);
    
    // Data states
    const [canonicalData, setCanonicalData] = useState(null);
    const [trendDetails, setTrendDetails] = useState(null);
    
    // Loading states (only for initial mount)
    const [canonicalLoading, setCanonicalLoading] = useState(true);
    const [advancedLoading, setAdvancedLoading] = useState(false);
    
    // Chart state
    const [timeRange, setTimeRange] = useState('12H');
    
    // Use custom hooks for patch updates
    const { priceData, isInitialLoading: priceLoading } = useLivePrice(canonicalData);
    const { trades, isInitialLoading: tradesLoading } = useLiveTrades(canonicalData);
    const { chartData, isInitialLoading: chartLoading } = useChartStream(canonicalData, timeRange);
    
    // Trend details cache (5-minute TTL)
    const trendCacheRef = useRef({});
    const TREND_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    
    // Lazy mount: only mount when item is selected
    useEffect(() => {
        if (!item) {
            setIsMounted(false);
            return;
        }
        
        const timer = setTimeout(() => {
            setIsMounted(true);
        }, 0);
        
        return () => {
            clearTimeout(timer);
            setIsMounted(false);
        };
    }, [item]);
    
    // Fetch canonical data (item metadata)
    useEffect(() => {
        if (!item?.id) return;
        
        const fetchCanonical = async () => {
            try {
                setCanonicalLoading(true);
                const res = await apiFetch(`/api/items/canonical/${item.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setCanonicalData(data);
                } else {
                    console.error("Error fetching canonical data:", res.status);
                }
            } catch (err) {
                console.error("Error fetching canonical data:", err);
            } finally {
                setCanonicalLoading(false);
            }
        };
        
        fetchCanonical();
    }, [item?.id]);
    
    // Data fetching is now handled by custom hooks (useLivePrice, useLiveTrades, useChartStream)
    
    // Fetch trend details (lazy + cached)
    useEffect(() => {
        if (!canonicalData?.item_id || !isMounted) return;
        
        const fetchTrendDetails = async () => {
            const cacheKey = canonicalData.item_id;
            const cached = trendCacheRef.current[cacheKey];
            
            // Check cache
            if (cached && (Date.now() - cached.timestamp) < TREND_CACHE_TTL) {
                setTrendDetails(cached.data);
                setAdvancedLoading(false);
                return;
            }
            
            try {
                setAdvancedLoading(true);
                const res = await apiFetch(`/api/items/trend-details/${canonicalData.item_id}`);
                if (res.ok) {
                    const data = await res.json();
                    // Update cache
                    trendCacheRef.current[cacheKey] = {
                        data,
                        timestamp: Date.now()
                    };
                    setTrendDetails(data);
                } else {
                    console.error("Error fetching trend details:", res.status);
                }
            } catch (err) {
                console.error("Error fetching trend details:", err);
            } finally {
                setAdvancedLoading(false);
            }
        };
        
        // Delay trend details fetch slightly
        const timer = setTimeout(fetchTrendDetails, 200);
        return () => clearTimeout(timer);
    }, [canonicalData?.item_id, isMounted]);
    
    // Handle Escape key to close panel
    useEffect(() => {
        if (!item) return;
        
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [item, onClose]);
    
    if (!item) return null;
    
    const safe = canonicalData?.icon ? encodeURIComponent(canonicalData.icon) : '';
    
    return (
        <div 
            style={panelStyle}
            role="complementary"
            aria-label={`Side panel for ${item.name}`}
        >
            <div style={headerStyle}>
                <div style={headerContentStyle}>
                    {canonicalData?.icon && (
                        <img
                            src={`${baseIconURL}/${safe}/32px-${safe}`}
                            alt={canonicalData.name}
                            width={32}
                            height={32}
                            style={{ borderRadius: 4, objectFit: "contain" }}
                            onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                    )}
                    <div style={headerTextStyle}>
                        <h3 style={titleStyle}>{canonicalData?.name || item.name}</h3>
                        {canonicalData && (
                            <div style={headerMetaStyle}>
                                {canonicalData.limit && (
                                    <span>Limit: {canonicalData.limit.toLocaleString()}</span>
                                )}
                                {canonicalData.members && (
                                    <span>Members</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <button 
                    onClick={onClose} 
                    style={closeButtonStyle}
                    aria-label="Close side panel"
                    title="Close side panel (Escape)"
                >
                    ×
                </button>
            </div>
            
            <div style={contentStyle}>
                {!isMounted ? (
                    <div style={loadingBoxStyle}>
                        <p style={loadingTextStyle}>Loading...</p>
                    </div>
                ) : (
                    <>
                        {/* Live Price Block */}
                        {priceLoading ? (
                            <div style={sectionStyle}>
                                <p style={loadingTextStyle}>Loading prices...</p>
                            </div>
                        ) : priceData ? (
                            <div style={sectionStyle}>
                                <h4 style={sectionTitleStyle}>Live Prices</h4>
                                <div style={priceGridStyle}>
                                    <PriceField label="Buy" value={formatPriceFull(priceData.low)} />
                                    <PriceField label="Sell" value={formatPriceFull(priceData.high)} />
                                    <PriceField label="Margin" value={formatColoredNumber(priceData.margin)} />
                                    <PriceField label="ROI%" value={formatRoi(priceData.roi_percent)} />
                                </div>
                            </div>
                        ) : null}
                        
                        {/* Chart */}
                        <div style={sectionStyle}>
                            <h4 style={sectionTitleStyle}>Price Chart</h4>
                            <div style={timeRangeButtonsStyle}>
                                {timeOptions.map(({ label }) => (
                                    <button
                                        key={label}
                                        onClick={() => setTimeRange(label)}
                                        style={{
                                            ...timeRangeButtonStyle,
                                            background: label === timeRange ? '#202737' : '#151a22',
                                            color: label === timeRange ? '#e6e9ef' : '#9aa4b2',
                                            border: label === timeRange ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.06)',
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {chartLoading ? (
                                <div style={chartLoadingStyle}>
                                    <p style={loadingTextStyle}>Loading chart...</p>
                                </div>
                            ) : (
                                <PriceChart priceData={chartData} timeRange={timeRange} height={300} />
                            )}
                        </div>
                        
                        {/* Recent Trades */}
                        <div style={sectionStyle}>
                            <h4 style={sectionTitleStyle}>Recent Trades</h4>
                            {tradesLoading ? (
                                <p style={loadingTextStyle}>Loading trades...</p>
                            ) : (
                                <TradeList trades={trades} maxHeight={200} maxItems={10} />
                            )}
                        </div>
                        
                        {/* Advanced Metrics */}
                        {advancedLoading ? (
                            <div style={sectionStyle}>
                                <p style={loadingTextStyle}>Loading advanced metrics...</p>
                            </div>
                        ) : (
                            <div style={sectionStyle}>
                                <h4 style={sectionTitleStyle}>Advanced Metrics</h4>
                                <AdvancedMetrics trendDetails={trendDetails} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function PriceField({ label, value }) {
    return (
        <div style={priceFieldStyle}>
            <div style={priceLabelStyle}>{label}</div>
            <div style={priceValueStyle}>{value}</div>
        </div>
    );
}

const panelStyle = {
    width: "400px",
    flexShrink: 0,
    backgroundColor: "#151a22",
    borderLeft: "1px solid rgba(255, 255, 255, 0.06)",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    height: "100%",
};

const headerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    backgroundColor: "#181e27",
    position: "sticky",
    top: 0,
    zIndex: 10,
};

const headerContentStyle = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flex: 1,
};

const headerTextStyle = {
    flex: 1,
};

const titleStyle = {
    margin: 0,
    fontSize: "18px",
    fontWeight: 600,
    color: "#e6e9ef",
};

const headerMetaStyle = {
    display: "flex",
    gap: "12px",
    fontSize: "12px",
    color: "#9aa4b2",
    marginTop: "4px",
};

const closeButtonStyle = {
    background: "none",
    border: "none",
    fontSize: "24px",
    color: "#9aa4b2",
    cursor: "pointer",
    padding: "0",
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    transition: "all 0.2s",
};

const contentStyle = {
    padding: "20px",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "20px",
};

const sectionStyle = {
    backgroundColor: "#181e27",
    borderRadius: "8px",
    padding: "16px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
};

const sectionTitleStyle = {
    margin: "0 0 12px 0",
    fontSize: "14px",
    fontWeight: 600,
    color: "#e6e9ef",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
};

const priceGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
};

const priceFieldStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
};

const priceLabelStyle = {
    fontSize: "11px",
    color: "#9aa4b2",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
};

const priceValueStyle = {
    fontSize: "16px",
    fontWeight: 600,
    color: "#e6e9ef",
};

const timeRangeButtonsStyle = {
    display: "flex",
    gap: "6px",
    marginBottom: "12px",
    flexWrap: "wrap",
};

const timeRangeButtonStyle = {
    padding: "4px 8px",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 500,
    transition: "all 0.2s",
    border: "1px solid rgba(255,255,255,0.06)",
};

const chartLoadingStyle = {
    height: "300px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

const loadingBoxStyle = {
    padding: "24px",
    textAlign: "center",
};

const loadingTextStyle = {
    color: "#9aa4b2",
    fontSize: "14px",
    margin: 0,
};

const emptyTextStyle = {
    color: "#9aa4b2",
    fontSize: "12px",
    fontStyle: "italic",
    margin: 0,
};
