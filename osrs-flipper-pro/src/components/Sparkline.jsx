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

    // Map data with original indices, filtering invalid points
    const dataWithIndices = data
        .map((point, originalIndex) => ({
            ...point,
            originalIndex,
            isValid: point.price != null && !isNaN(point.price)
        }))
        .filter(d => d.isValid);
    
    if (dataWithIndices.length === 0) {
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

    // Group consecutive valid points into segments
    // This allows us to draw separate lines for each segment, leaving gaps where data is missing
    const segments = [];
    let currentSegment = [];
    
    dataWithIndices.forEach((point, i) => {
        const prevIndex = i > 0 ? dataWithIndices[i - 1].originalIndex : -1;
        const currentIndex = point.originalIndex;
        
        // If there's a gap (more than 1 index difference), start a new segment
        if (currentIndex - prevIndex > 1 && currentSegment.length > 0) {
            segments.push(currentSegment);
            currentSegment = [];
        }
        
        currentSegment.push(point);
    });
    
    // Add the last segment
    if (currentSegment.length > 0) {
        segments.push(currentSegment);
    }

    // Generate polylines for each segment
    const polylines = segments.map(segment => {
        const points = segment
            .map((point) => {
                // Use original index for x-position to preserve gaps
                const x = padding + (point.originalIndex / (data.length - 1 || 1)) * chartWidth;
                const normalizedPrice = (point.price - minPrice) / priceRange;
                const y = padding + chartHeight - (normalizedPrice * chartHeight);
                return `${x},${y}`;
            })
            .join(" ");
        return points;
    });

    return (
        <svg width={width} height={height} style={{ display: "block" }}>
            {polylines.map((points, index) => (
                <polyline
                    key={index}
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ))}
        </svg>
    );
});

Sparkline.displayName = "Sparkline";

export default Sparkline;

