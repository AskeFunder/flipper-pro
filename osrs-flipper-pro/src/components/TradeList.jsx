import React from "react";
import { formatPriceFull, timeAgo } from "../utils/formatting";

/**
 * Memoized Trade List Component
 * Only re-renders when trades array reference changes
 */
const TradeList = React.memo(({ trades, maxHeight = 200, maxItems = 20 }) => {
    if (trades.length === 0) {
        return (
            <p style={{ color: "#9aa4b2", fontSize: "12px", fontStyle: "italic", margin: 0 }}>
                No recent trades available
            </p>
        );
    }
    
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: `${maxHeight}px`, overflowY: "auto" }}>
            {trades.slice(0, maxItems).map((t, i) => {
                const isBuy = t.type === 'sell';
                const label = isBuy ? 'BUY' : 'SELL';
                const textColor = isBuy ? '#2bd97f' : '#ff5c5c';
                return (
                    <div key={`${t.ts}-${i}`} style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        fontSize: "12px", 
                        padding: "6px 8px", 
                        backgroundColor: "rgba(255, 255, 255, 0.03)", 
                        borderRadius: "4px",
                        color: textColor
                    }}>
                        <span>{timeAgo(t.ts)}</span>
                        <span>{label}</span>
                        <span>{formatPriceFull(t.price)}</span>
                    </div>
                );
            })}
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison: only re-render if trades array reference changed
    return prevProps.trades === nextProps.trades && 
           prevProps.maxHeight === nextProps.maxHeight &&
           prevProps.maxItems === nextProps.maxItems;
});

TradeList.displayName = 'TradeList';

export default TradeList;

