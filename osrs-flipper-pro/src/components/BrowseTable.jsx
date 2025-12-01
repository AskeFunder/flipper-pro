import React from "react";
import BrowseTableRow from "./BrowseTableRow";

export default function BrowseTable({ items, visibleColumns, loading, error, sortBy, order, onSort, onItemClick }) {
    const shimmerColCount = 10;

    if (loading) {
        return (
            <div style={scrollContainerStyle}>
            <table style={tableStyle}>
                <thead>
                    <tr style={headerRowStyle}>
                        <th style={thStyle}>Item</th>
                        <th style={thStyle}>7d</th>
                        {Array.from({ length: shimmerColCount }).map((_, i) => (
                            <th key={i} style={thStyle}>&nbsp;</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: 10 }).map((_, i) => (
                        <tr key={i} style={rowStyle}>
                            <td style={tdStyle}>
                                <div className="shimmer shimmer-icon" />
                            </td>
                            <td style={tdStyle}>
                                <div className="shimmer shimmer-sparkline" />
                            </td>
                            {Array.from({ length: shimmerColCount }).map((_, j) => (
                                <td key={j} style={{ ...tdStyle, textAlign: "right" }}>
                                    <div className="shimmer shimmer-cell" />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
        );
    }

    if (!items.length && !loading) {
        return (
            <div style={scrollContainerStyle}>
            <table style={tableStyle}>
                <thead>
                    <tr style={headerRowStyle}>
                        <th style={thStyle}>Item</th>
                        <th style={thStyle}>7d</th>
                        {visibleColumns.map((col) => (
                            <th key={col.id} style={thStyle}>{col.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colSpan={visibleColumns.length + 2} style={errorStyle}>
                            {error ? (
                                <div style={errorContainerStyle}>
                                    <div style={errorIconStyle}>⚠️</div>
                                    <div>
                                        <div style={errorTitleStyle}>
                                            {error.type === 'rate_limit' ? 'Too Many Requests' : 'Error Loading Items'}
                                        </div>
                                        <div style={errorMessageStyle}>{error.message}</div>
                                        {error.type === 'rate_limit' && (
                                            <div style={errorHintStyle}>
                                                Please wait a few seconds before refreshing.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                'No items found.'
                            )}
                        </td>
                    </tr>
                </tbody>
            </table>
            </div>
        );
    }

    return (
        <div style={scrollContainerStyle}>
        <table style={tableStyle}>
            <thead>
                <tr style={headerRowStyle}>
                    <th style={thStyleLeft}>Item</th>
                    <th style={thStyle}>7d</th>
                    {visibleColumns.map((col) => {
                        const isSorted =
                            (col.id === "buy_price" && sortBy === "buy_time") ||
                            (col.id === "sell_price" && sortBy === "sell_time") ||
                            sortBy === col.id;
                        return (
                            <th 
                                key={col.id} 
                                style={thStyle} 
                                onClick={() => onSort(col.id)}
                                className="table-header"
                            >
                                <span style={headerContentStyle}>
                                    {col.label}
                                    {isSorted && (
                                        <span style={sortIndicatorStyle}>
                                            {order === "asc" ? " ▲" : " ▼"}
                                        </span>
                                    )}
                                </span>
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody>
                {items.map((item) => (
                    <BrowseTableRow
                        key={item.id}
                        item={item}
                        visibleColumns={visibleColumns}
                        onItemClick={onItemClick}
                    />
                ))}
            </tbody>
        </table>
        </div>
    );
}

const scrollContainerStyle = {
    width: "100%",
    maxWidth: "100%",
    overflowX: "auto",
    overflowY: "visible",
    position: "relative",
    WebkitOverflowScrolling: "touch", // Smooth scrolling on iOS
    boxSizing: "border-box",
};

const tableStyle = {
    borderCollapse: "collapse",
    tableLayout: "auto",
    width: "max-content",
    minWidth: "100%",
    margin: 0,
    display: "table",
};

const headerRowStyle = {
    background: "#151a22", /* Table surface */
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
};

const rowStyle = {
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    cursor: "pointer",
    transition: "background-color 0.2s",
    backgroundColor: "#181e27", /* Row background */
};

const thStyle = {
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    color: "#9aa4b2", /* Secondary text */
    textAlign: "right",
    userSelect: "none",
    transition: "background-color 0.2s",
};

const thStyleLeft = {
    ...thStyle,
    textAlign: "left",
};

const headerContentStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
};

const sortIndicatorStyle = {
    fontSize: 12,
    color: "#9aa4b2",
    fontWeight: "bold",
};

const tdStyle = {
    padding: "10px 12px",
    fontSize: 13,
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    color: "#e6e9ef", /* Primary text */
};

const timeStyle = {
    fontSize: 11,
    color: "#9aa4b2", /* Secondary text */
};

const iconStyle = {
    borderRadius: 4,
    objectFit: "contain",
};

const errorStyle = {
    ...tdStyle,
    textAlign: "center",
    padding: "40px 20px",
};

const errorContainerStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    flexDirection: "column",
};

const errorIconStyle = {
    fontSize: "48px",
    lineHeight: 1,
};

const errorTitleStyle = {
    fontSize: "16px",
    fontWeight: 600,
    color: "#ff5c5c", /* Red for errors */
    marginBottom: "8px",
};

const errorMessageStyle = {
    fontSize: "14px",
    color: "#9aa4b2", /* Secondary text */
    marginBottom: "4px",
};

const errorHintStyle = {
    fontSize: "12px",
    color: "#9aa4b2", /* Secondary text */
    fontStyle: "italic",
    marginTop: "8px",
};
