import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { useLivePrice } from "../hooks/useLivePrice";
import { useLiveTrades } from "../hooks/useLiveTrades";
import { useChartStream } from "../hooks/useChartStream";
import PriceChart from "./PriceChart";
import TradeList from "./TradeList";
import AdvancedMetrics from "./AdvancedMetrics";
import { useMobile } from "../hooks/useMobile";
import {
    formatPriceFull,
    formatColoredNumber,
    formatRoi,
    timeAgo,
    nameToSlug,
} from "../utils/formatting";

const timeOptions = [
    { label: '4H', ms: 4 * 3600e3, granularity: '4h' },
    { label: '12H', ms: 12 * 3600e3, granularity: '5m' },
    { label: '1D', ms: 24 * 3600e3, granularity: '5m' },
    { label: '1W', ms: 7 * 24 * 3600e3, granularity: '1h' },
    { label: '1M', ms: 30 * 24 * 3600e3 + 6 * 3600e3, granularity: '6h' },
    { label: '3M', ms: 90 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' },
    { label: '1Y', ms: 365 * 24 * 3600e3 + 24 * 3600e3, granularity: '24h' },
];

/**
 * Expanded Row Content Component (Phase 7: Real Data Integration)
 * 
 * Displays real item data in an expanded row:
 * - Layout: 2/3 chart, 1/3 trades, metrics below
 * - Same data sources as SidePanel
 * - Lazy-mounted for performance
 */
export default function ExpandedRowContent({ item }) {
    const navigate = useNavigate();
    const isMobile = useMobile();
    const [isMounted, setIsMounted] = useState(false);
    
    // Data states
    const [canonicalData, setCanonicalData] = useState(null);
    const [trendDetails, setTrendDetails] = useState(null);
    
    // Loading states (only for initial mount)
    const [canonicalLoading, setCanonicalLoading] = useState(true);
    const [advancedLoading, setAdvancedLoading] = useState(false);
    
    // Chart state
    const [timeRange, setTimeRange] = useState('12H');
    
    // Canonical granularity selector (independent from chart granularity)
    const [selectedCanonicalGranularity, setSelectedCanonicalGranularity] = useState('1h');
    const canonicalGranularityOptions = ['5m', '1h', '6h', '24h', '7d', '1m'];
    
    // Use custom hooks for patch updates
    const { priceData, isInitialLoading: priceLoading } = useLivePrice(canonicalData);
    const { trades, isInitialLoading: tradesLoading } = useLiveTrades(canonicalData);
    const { chartData, isInitialLoading: chartLoading } = useChartStream(canonicalData, timeRange);
    
    // Trend details cache (5-minute TTL)
    const trendCacheRef = useRef({});
    const TREND_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    
    // Lazy mount: only mount when component becomes visible
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
    
    // Fetch canonical data
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
        
        const timer = setTimeout(fetchTrendDetails, 200);
        return () => clearTimeout(timer);
    }, [canonicalData?.item_id, isMounted]);
    
    if (!item) return null;
    
    // Only render heavy content when mounted
    if (!isMounted) {
        return (
            <tr>
                <td colSpan="100%" style={expandedCellStyle}>
                    <div style={expandedContentStyle}>
                        <div style={loadingBoxStyle}>
                            <p style={loadingTextStyle}>Loading...</p>
                        </div>
                    </div>
                </td>
            </tr>
        );
    }
    
    return (
        <tr 
            role="row"
            aria-hidden="false"
        >
            <td colSpan="100%" style={expandedCellStyle}>
                <div 
                    style={expandedContentStyle}
                    role="region"
                    aria-label={`Expanded content for ${item.name}`}
                >
                    {/* Header with arrow navigation */}
                    <div style={expandedHeaderStyle}>
                        <h3 style={expandedHeaderTitleStyle}>{item.name}</h3>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const slug = nameToSlug(item.name);
                                navigate(`/item/${item.id}-${encodeURIComponent(slug)}`);
                            }}
                            style={openFullViewButtonStyle}
                            onMouseEnter={(e) => {
                                Object.assign(e.currentTarget.style, {
                                    background: "#202737",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    color: "#e6e9ef",
                                });
                            }}
                            onMouseLeave={(e) => {
                                Object.assign(e.currentTarget.style, {
                                    background: "#151a22",
                                    border: "1px solid rgba(255, 255, 255, 0.06)",
                                    color: "#9aa4b2",
                                });
                            }}
                            aria-label="Open Full View"
                            title="Open Full View"
                        >
                            ↗
                        </button>
                    </div>
                    
                    {/* Layout: 2/3 chart, 1/3 trades */}
                    <div style={getTopRowStyle(isMobile)}>
                        {/* Chart - 2/3 width */}
                        <div style={getChartSectionStyle(isMobile)}>
                            <div style={chartHeaderStyle}>
                                <h4 style={sectionTitleStyle}>Price Chart</h4>
                                <div style={{
                                    ...timeRangeButtonsStyle,
                                    ...(isMobile ? {
                                        overflowX: "auto",
                                        WebkitOverflowScrolling: "touch",
                                        scrollbarWidth: "thin",
                                    } : {})
                                }}>
                                    {timeOptions.map(({ label }) => (
                                        <button
                                            key={label}
                                            onClick={() => setTimeRange(label)}
                                            style={{
                                                ...timeRangeButtonStyle,
                                                ...(isMobile ? { flexShrink: 0 } : {}),
                                                background: label === timeRange ? '#202737' : '#151a22',
                                                color: label === timeRange ? '#e6e9ef' : '#9aa4b2',
                                                border: label === timeRange ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.06)',
                                            }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {chartLoading ? (
                                <div style={chartLoadingStyle}>
                                    <p style={loadingTextStyle}>Loading chart...</p>
                                </div>
                            ) : (
                                <PriceChart priceData={chartData} timeRange={timeRange} height={isMobile && typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.45, 400) : 400} />
                            )}
                        </div>
                        
                        {/* Recent Trades - 1/3 width */}
                        <div style={getTradesSectionStyle(isMobile)}>
                            <h4 style={sectionTitleStyle}>Recent Trades</h4>
                            {tradesLoading ? (
                                <p style={loadingTextStyle}>Loading trades...</p>
                            ) : (
                                <TradeList trades={trades} maxHeight={isMobile ? 200 : 400} maxItems={isMobile ? 7 : 20} />
                            )}
                        </div>
                    </div>
                    
                    {/* Live Price Block */}
                    {priceLoading ? (
                        <div style={priceSectionStyle}>
                            <p style={loadingTextStyle}>Loading prices...</p>
                        </div>
                    ) : priceData ? (
                        <div style={priceSectionStyle}>
                            <h4 style={sectionTitleStyle}>Live Priceees</h4>
                            <div style={priceGridStyle}>
                                <PriceField label="Buy" value={formatPriceFull(priceData.low)} />
                                <PriceField label="Sell" value={formatPriceFull(priceData.high)} />
                                <PriceField label="Margin" value={formatColoredNumber(priceData.margin)} />
                                <PriceField label="ROI%" value={formatRoi(priceData.roi_percent)} />
                                <PriceField label="Spread%" value={formatRoi(priceData.spread_percent)} />
                                <PriceField label="Max Profit" value={formatColoredNumber(priceData.max_profit)} />
                                <PriceField label="Max Investment" value={formatPriceFull(priceData.max_investment)} />
                            </div>
                            <div style={timestampGridStyle}>
                                <PriceField label="High Timestamp" value={timeAgo(priceData.high_timestamp)} />
                                <PriceField label="Low Timestamp" value={timeAgo(priceData.low_timestamp)} />
                            </div>
                        </div>
                    ) : null}
                    
                    {/* Metrics below */}
                    <div style={metricsSectionStyle}>
                        <h4 style={sectionTitleStyle}>Advanced Metrics</h4>
                        <div style={granularitySelectorStyle}>
                            {canonicalGranularityOptions.map((gran) => (
                                <button
                                    key={gran}
                                    onClick={() => setSelectedCanonicalGranularity(gran)}
                                    style={{
                                        ...granularityButtonStyle,
                                        background: gran === selectedCanonicalGranularity ? '#202737' : '#151a22',
                                        color: gran === selectedCanonicalGranularity ? '#e6e9ef' : '#9aa4b2',
                                        border: gran === selectedCanonicalGranularity ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.06)',
                                    }}
                                >
                                    {gran}
                                </button>
                            ))}
                        </div>
                        {advancedLoading ? (
                            <p style={loadingTextStyle}>Loading advanced metrics...</p>
                        ) : (
                            <AdvancedMetrics 
                                canonicalData={canonicalData} 
                                selectedGranularity={selectedCanonicalGranularity} 
                            />
                        )}
                    </div>
                </div>
            </td>
        </tr>
    );
}

const expandedCellStyle = {
    padding: 0,
    backgroundColor: "#151a22",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
};

const expandedContentStyle = {
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
};

const expandedHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
};

const expandedHeaderTitleStyle = {
    margin: 0,
    fontSize: "18px",
    fontWeight: 600,
    color: "#e6e9ef",
    fontFamily: "'Inter', sans-serif",
};

const openFullViewButtonStyle = {
    background: "#151a22",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    fontSize: "18px",
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
    fontFamily: "'Inter', sans-serif",
};

// Top row style - stack on mobile
const getTopRowStyle = (isMobile) => ({
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    gap: "20px",
    alignItems: "flex-start",
});

// Chart section style - full width on mobile
const getChartSectionStyle = (isMobile) => ({
    ...(isMobile ? {
        width: "100%",
    } : {
        flex: "0 0 66.666%",
        width: "66.666%",
    }),
    backgroundColor: "#151a22",
    borderRadius: "8px",
    padding: "16px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
});

const chartHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
};

// Trades section style - full width on mobile
const getTradesSectionStyle = (isMobile) => ({
    ...(isMobile ? {
        width: "100%",
    } : {
        flex: "0 0 33.333%",
        width: "33.333%",
    }),
    backgroundColor: "#151a22",
    borderRadius: "8px",
    padding: "16px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
});

const priceSectionStyle = {
    backgroundColor: "#151a22",
    borderRadius: "8px",
    padding: "16px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
};

const priceGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "12px",
    marginBottom: "12px",
};

const timestampGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
    paddingTop: "12px",
    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
};

const metricsSectionStyle = {
    backgroundColor: "#151a22",
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
    fontFamily: "'Inter', sans-serif",
};

const timeRangeButtonsStyle = {
    display: "flex",
    gap: "6px",
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
    fontFamily: "'Inter', sans-serif",
};

const chartLoadingStyle = {
    height: "400px",
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
    fontFamily: "'Inter', sans-serif",
};

const emptyTextStyle = {
    color: "#9aa4b2",
    fontSize: "12px",
    fontStyle: "italic",
    margin: 0,
    fontFamily: "'Inter', sans-serif",
};

const granularitySelectorStyle = {
    display: "flex",
    gap: "6px",
    marginBottom: "12px",
    flexWrap: "wrap",
};

const granularityButtonStyle = {
    padding: "4px 8px",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 500,
    transition: "all 0.2s",
    border: "1px solid rgba(255,255,255,0.06)",
    fontFamily: "'Inter', sans-serif",
};

function PriceField({ label, value }) {
    return (
        <div style={priceFieldStyle}>
            <div style={priceLabelStyle}>{label}</div>
            <div style={priceValueStyle}>{value}</div>
        </div>
    );
}

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
    fontFamily: "'Inter', sans-serif",
};

const priceValueStyle = {
    fontSize: "14px",
    fontWeight: 600,
    color: "#e6e9ef",
    fontFamily: "'Inter', sans-serif",
};
