import React from "react";
import {
    formatCompact,
    formatPriceFull,
    formatRoi,
} from "../utils/formatting";
import { useMobile } from "../hooks/useMobile";

/**
 * Memoized Advanced Metrics Component
 * Shows metrics for a single selected canonical granularity
 */
const AdvancedMetrics = React.memo(({ canonicalData, selectedGranularity }) => {
    const isMobile = useMobile();
    
    if (!canonicalData || !selectedGranularity) {
        return null;
    }
    
    // Map granularity to canonical field names
    // Note: volume and turnover use '7d' in database, but trend uses '1w'
    let trendKey;
    let volumeKey;
    let turnoverKey;
    let priceHighKey;
    let priceLowKey;
    let buySellRateKey;
    
    if (selectedGranularity === '7d') {
        trendKey = 'trend_1w';  // Database uses 1w for trend
        volumeKey = 'volume_7d';
        turnoverKey = 'turnover_7d';
        priceHighKey = 'price_1w_high';
        priceLowKey = 'price_1w_low';
        buySellRateKey = 'buy_sell_rate_1w';
    } else {
        trendKey = `trend_${selectedGranularity}`;
        volumeKey = `volume_${selectedGranularity}`;
        turnoverKey = `turnover_${selectedGranularity}`;
        priceHighKey = `price_${selectedGranularity}_high`;
        priceLowKey = `price_${selectedGranularity}_low`;
        buySellRateKey = `buy_sell_rate_${selectedGranularity}`;
    }
    
    const volume = canonicalData[volumeKey] != null ? canonicalData[volumeKey] : null;
    const turnover = canonicalData[turnoverKey] != null ? canonicalData[turnoverKey] : null;
    const trend = canonicalData[trendKey] != null ? canonicalData[trendKey] : null;
    const buySellRate = canonicalData[buySellRateKey] != null ? canonicalData[buySellRateKey] : null;
    const priceHigh = canonicalData[priceHighKey] != null ? canonicalData[priceHighKey] : null;
    const priceLow = canonicalData[priceLowKey] != null ? canonicalData[priceLowKey] : null;
    
    // Mobile and Desktop: Grid layout (mobile uses 2 columns, desktop uses 3)
    return (
        <div style={isMobile ? mobileMetricsGridStyle : metricsGridStyle}>
            {volume != null && (
                <MetricField 
                    label={`Volume (${selectedGranularity})`} 
                    value={formatCompact(volume)} 
                />
            )}
            {turnover != null && (
                <MetricField 
                    label={`Turnover (${selectedGranularity})`} 
                    value={formatCompact(turnover)} 
                />
            )}
            {trend != null && (
                <MetricField 
                    label={`Trend (${selectedGranularity === '7d' ? '1w' : selectedGranularity})`} 
                    value={formatRoi(trend)} 
                    highlight={true}
                />
            )}
            {buySellRate != null && (
                <MetricField 
                    label={`Buy/Sell Rate (${selectedGranularity})`} 
                    value={
                        <span style={{ 
                            color: buySellRate < 1 ? "#ff5c5c" : "#2bd97f",
                            fontFamily: "monospace"
                        }}>
                            {parseFloat(buySellRate).toFixed(2)}
                        </span>
                    } 
                />
            )}
            {priceHigh != null && (
                <MetricField 
                    label={`Period High (${selectedGranularity})`} 
                    value={formatPriceFull(priceHigh)} 
                />
            )}
            {priceLow != null && (
                <MetricField 
                    label={`Period Low (${selectedGranularity})`} 
                    value={formatPriceFull(priceLow)} 
                />
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison: only re-render if canonicalData or selectedGranularity changed
    return prevProps.canonicalData === nextProps.canonicalData && 
           prevProps.selectedGranularity === nextProps.selectedGranularity;
});

function MetricField({ label, value, highlight = false }) {
    return (
        <div style={metricItemStyle}>
            <div style={metricLabelStyle}>{label}</div>
            <div style={{ ...metricValueStyle, ...(highlight ? metricHighlightStyle : {}) }}>
                {value}
            </div>
        </div>
    );
}

const metricsGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "16px",
};

const mobileMetricsGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
};

const metricItemStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
};

const metricLabelStyle = {
    fontSize: "11px",
    color: "#9aa4b2",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    fontFamily: "'Inter', sans-serif",
};

const metricValueStyle = {
    fontSize: "14px",
    fontWeight: 600,
    color: "#e6e9ef",
    fontFamily: "'Inter', sans-serif",
};

const metricHighlightStyle = {
    fontSize: "14px",
    fontWeight: 700,
    color: "#e6e9ef",
    fontFamily: "'Inter', sans-serif",
};


AdvancedMetrics.displayName = 'AdvancedMetrics';

export default AdvancedMetrics;
