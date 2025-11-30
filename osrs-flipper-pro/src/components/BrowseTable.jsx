import React from "react";
import {
    formatCompact,
    formatPriceFull,
    formatColoredNumber,
    formatRoi,
    timeAgo,
    nameToSlug,
} from "../utils/formatting";

const baseIconURL = "https://oldschool.runescape.wiki/images/thumb";

export default function BrowseTable({ items, visibleColumns, loading, sortBy, order, onSort, onItemClick }) {
    const shimmerColCount = 10;

    if (loading) {
        return (
            <div style={scrollContainerStyle}>
            <table style={tableStyle}>
                <thead>
                    <tr style={headerRowStyle}>
                        <th style={thStyle}>Item</th>
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

    if (!items.length) {
        return (
            <div style={scrollContainerStyle}>
            <table style={tableStyle}>
                <thead>
                    <tr style={headerRowStyle}>
                        <th style={thStyle}>Item</th>
                        {visibleColumns.map((col) => (
                            <th key={col.id} style={thStyle}>{col.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colSpan={visibleColumns.length + 1} style={tdStyle}>No items found.</td>
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
                {items.map((item) => {
                    const icon = item.icon || `${item.name}.png`;
                    const safe = encodeURIComponent(icon.replace(/ /g, "_"));
                    const slug = nameToSlug(item.name);
                    const itemUrl = `/item/${item.id}-${encodeURIComponent(slug)}`;
                    
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
                                key={item.id} 
                                style={rowStyle}
                                onClick={handleRowClick}
                                className="browse-table-row"
                            >
                            <td style={tdStyle}>
                                <a
                                    href={itemUrl}
                                    onClick={handleLinkClick}
                                    className="browse-item-link"
                                    style={{
                                        color: "inherit",
                                        textDecoration: "none",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                    }}
                                >
                                    <img
                                        src={`${baseIconURL}/${safe}/32px-${safe}`}
                                        alt={item.name}
                                        width={32}
                                        height={32}
                                        style={iconStyle}
                                        onError={(e) => (e.currentTarget.style.display = "none")}
                                    />
                                    <span>{item.name}</span>
                                </a>
                            </td>
                            {visibleColumns.map((col) => {
                                const value = item[col.id];
                                let display;
                                let style = { ...tdStyle, textAlign: "right" };

                                if (col.id === "buy_price") {
                                    display = (
                                        <>
                                            <div>{formatPriceFull(item.buy_price)}</div>
                                            <div style={timeStyle}>{timeAgo(item.buy_time)}</div>
                                        </>
                                    );
                                } else if (col.id === "sell_price") {
                                    display = (
                                        <>
                                            <div>{formatPriceFull(item.sell_price)}</div>
                                            <div style={timeStyle}>{timeAgo(item.sell_time)}</div>
                                        </>
                                    );
                                } else if (col.id.startsWith("buy_sell_rate_")) {
                                    if (value == null) {
                                        display = "–";
                                    } else {
                                        const num = parseFloat(value);
                                        if (isNaN(num)) {
                                            display = "–";
                                        } else {
                                            display = num.toFixed(2);
                                            style.color = num < 1 ? "red" : "green";
                                        }
                                    }
                                } else if (col.id === "roi" || col.id.startsWith("trend_")) {
                                    display = formatRoi(value);
                                } else if (col.id === "margin" || col.id === "max_profit") {
                                    display = formatColoredNumber(value);
                                } else {
                                    display = formatCompact(value);
                                }

                                return (
                                    <td key={col.id} style={style}>
                                        {display}
                                    </td>
                                );
                            })}
                        </tr>
                    );
                })}
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
    background: "#f9fafb",
    borderBottom: "2px solid #e5e7eb",
};

const rowStyle = {
    borderBottom: "1px solid #e5e7eb",
    cursor: "pointer",
    transition: "background-color 0.2s",
};

const thStyle = {
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    color: "#374151",
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
    color: "#1e1e1e",
    fontWeight: "bold",
};

const tdStyle = {
    padding: "14px 16px",
    fontSize: 16,
    verticalAlign: "middle",
    whiteSpace: "nowrap",
};

const timeStyle = {
    fontSize: 12,
    color: "#6b7280",
};

const iconStyle = {
    borderRadius: 4,
    objectFit: "contain",
};
