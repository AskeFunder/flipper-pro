import React from "react";

/**
 * SVG Sparkline Component
 * Pure SVG implementation with polyline for trend visualization
 * 
 * @param {Array} data - Array of { timestamp, price } objects
 * @param {string} color - Stroke color (inherits from row momentum class)
 * @param {number} width - SVG width (default: 80)
 * @param {number} height - SVG height (default: 24)
 */
const Sparkline = React.memo(({ data, color = "#9aa4b2", width = 80, height = 24 }) => {
    if (!data || data.length === 0) {
        return (
            <svg width={width} height={height} style={{ display: "block" }}>
                <line
                    x1="0"
                    y1={height / 2}
                    x2={width}
                    y2={height / 2}
                    stroke={color}
                    strokeWidth="1"
                    opacity="0.3"
                />
            </svg>
        );
    }

    // Calculate min/max for scaling
    const prices = data.map(d => d.price).filter(p => p != null && !isNaN(p));
    if (prices.length === 0) {
        return (
            <svg width={width} height={height} style={{ display: "block" }}>
                <line
                    x1="0"
                    y1={height / 2}
                    x2={width}
                    y2={height / 2}
                    stroke={color}
                    strokeWidth="1"
                    opacity="0.3"
                />
            </svg>
        );
    }

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1; // Avoid division by zero

    // Padding for visual clarity
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Generate polyline points
    const points = data
        .map((point, index) => {
            const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
            const normalizedPrice = (point.price - minPrice) / priceRange;
            const y = padding + chartHeight - (normalizedPrice * chartHeight);
            return `${x},${y}`;
        })
        .join(" ");

    return (
        <svg width={width} height={height} style={{ display: "block" }}>
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
});

Sparkline.displayName = "Sparkline";

export default Sparkline;

