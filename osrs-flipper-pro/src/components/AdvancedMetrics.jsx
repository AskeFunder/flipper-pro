import React from "react";
import { formatRoi } from "../utils/formatting";

/**
 * Memoized Advanced Metrics Component
 * Only re-renders when trendDetails reference changes
 */
const AdvancedMetrics = React.memo(({ trendDetails }) => {
    if (!trendDetails) {
        return null;
    }
    
    const trendKeys = ['trend_5m', 'trend_1h', 'trend_6h', 'trend_24h', 'trend_1w', 'trend_1m'];
    
    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            {trendKeys.map(key => {
                const trend = trendDetails[key];
                if (!trend || trend.trend == null) return null;
                return (
                    <div key={key} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ fontSize: "11px", color: "#9aa4b2", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            {key.replace('trend_', '').toUpperCase()}
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "#e6e9ef" }}>
                            {formatRoi(trend.trend)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison: only re-render if trendDetails reference changed
    return prevProps.trendDetails === nextProps.trendDetails;
});

AdvancedMetrics.displayName = 'AdvancedMetrics';

export default AdvancedMetrics;

