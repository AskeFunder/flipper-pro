import React from "react";

const tdStyle = {
    padding: "14px 16px",
    fontSize: 16,
    verticalAlign: "middle",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

export default function ShimmerRow({ colCount }) {
    return (
        <tr>
            <td style={tdStyle}>
                <div className="shimmer shimmer-icon" />
            </td>
            {Array.from({ length: colCount }).map((_, i) => (
                <td key={i} style={{ ...tdStyle, textAlign: "right" }}>
                    <div className="shimmer shimmer-cell" />
                </td>
            ))}
        </tr>
    );
}
