import React from "react";
import { parseHumanNumber } from "../utils/formatting";
import "../styles/browse.css";

const filterContainerStyle = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    marginBottom: "24px",
    overflow: "hidden",
};

const filterHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
};

const filterTitleStyle = {
    margin: 0,
    fontSize: "18px",
    fontWeight: 600,
    color: "#111827",
};

const closeButtonStyle = {
    background: "none",
    border: "none",
    fontSize: "24px",
    color: "#6b7280",
    cursor: "pointer",
    padding: "0",
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    transition: "all 0.2s",
};

const filterContentStyle = {
    padding: "12px 16px",
};

const categoryGroupStyle = {
    marginBottom: "16px",
};

const categoryHeaderStyle = {
    fontWeight: 600,
    fontSize: "14px",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "10px",
};

const filterFieldsStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
};

const fieldContainerStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0, // Prevent overflow
};

const fieldLabelStyle = {
    fontSize: "13px",
    fontWeight: 500,
    color: "#374151",
    marginBottom: "2px",
};

const inputGroupStyle = {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    width: "100%",
};

const inputStyle = {
    flex: "1 1 0",
    padding: "8px 10px",
    fontSize: "13px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    backgroundColor: "#ffffff",
    transition: "all 0.2s",
    minWidth: "0", // Allow flex items to shrink below their content size
    boxSizing: "border-box",
};

const inputDividerStyle = {
    color: "#9ca3af",
    fontSize: "12px",
    fontWeight: 500,
};

const filterFooterStyle = {
    padding: "12px 16px",
    borderTop: "1px solid #e5e7eb",
    background: "#f9fafb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
};

const doneButtonStyle = {
    padding: "10px 24px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#ffffff",
    background: "#1e1e1e",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s",
};

const clearButtonStyle = {
    padding: "10px 24px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#374151",
    background: "#ffffff",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s",
};

export default function FilterBuilder({ visibleColumns, filters, onFilterChange, onClose, onClearFilters, isSearchFromSearchBar = false, onSearchFromSearchBarChange }) {
    const filterGroups = visibleColumns.reduce((acc, col) => {
        (acc[col.category] = acc[col.category] || []).push(col);
        return acc;
    }, {});

    const now = Math.floor(Date.now() / 1000);

    // Helper function to get the filter key for a field
    const getFilterKey = (field, bound) => {
        const fieldMap = {
            'buy_price': 'BuyPrice',
            'sell_price': 'SellPrice',
            'margin': 'Margin',
            'roi': 'Roi',
            'spread': 'Spread',
            'limit': 'Limit',
            'volume_5m': 'Volume_5m',
            'volume_1h': 'Volume_1h',
            'volume_6h': 'Volume_6h',
            'volume_24h': 'Volume_24h',
            'volume_7d': 'Volume_7d',
            'turnover_5m': 'Turnover_5m',
            'turnover_1h': 'Turnover_1h',
            'turnover_6h': 'Turnover_6h',
            'turnover_24h': 'Turnover_24h',
            'turnover_7d': 'Turnover_7d',
            'turnover_1m': 'Turnover_1m',
            'buy_sell_rate_5m': 'Buy_sell_rate_5m',
            'buy_sell_rate_1h': 'Buy_sell_rate_1h',
            'buy_sell_rate_6h': 'Buy_sell_rate_6h',
            'buy_sell_rate_24h': 'Buy_sell_rate_24h',
            'buy_sell_rate_7d': 'Buy_sell_rate_7d',
            'trend_5m': 'Trend_5m',
            'trend_1h': 'Trend_1h',
            'trend_6h': 'Trend_6h',
            'trend_24h': 'Trend_24h',
            'trend_7d': 'Trend_7d',
            'trend_1m': 'Trend_1m',
            'max_profit': 'Max_profit',
            'max_investment': 'Max_investment',
            'buy_time': 'BuyTime',
            'sell_time': 'SellTime',
        };

        let formattedField = fieldMap[field];
        if (!formattedField) {
            formattedField = field.charAt(0).toUpperCase() + field.slice(1);
        }

        return bound === "min" ? `min${formattedField}` : `max${formattedField}`;
    };

    // Helper function to get the current filter value for display
    const getFilterValue = (field, bound) => {
        const key = getFilterKey(field, bound);
        const value = filters[key];
        
        if (value == null || value === '') {
            return '';
        }
        
        // For time filters, convert Unix timestamp back to minutes for display
        if ((field === "buy_time" || field === "sell_time") && value != null) {
            const now = Math.floor(Date.now() / 1000);
            return Math.floor((now - value) / 60).toString(); // Display in minutes
        }
        
        return value.toString();
    };

    const handleInputChange = (field, bound, value) => {
        const key = getFilterKey(field, bound);

        // When filters are changed, enable them (disable search-from-searchbar mode)
        if (isSearchFromSearchBar && onSearchFromSearchBarChange) {
            onSearchFromSearchBarChange(false);
        }

        if (value.trim() === "") {
            onFilterChange(key, null); // ✅ remove filter
        } else if (field === "buy_time" || field === "sell_time") {
            // For time filters: user enters minutes, we convert to Unix timestamp
            // User enters "min" = older than X minutes, "max" = newer than X minutes
            // We need to invert: older = lower timestamp, newer = higher timestamp
            const offset = now - parseHumanNumber(value) * 60;
            // Get the base field name (e.g., "Buy_time")
            const baseField = getFilterKey(field, "").replace(/^min|^max/, "");
            // For "min" (older), use maxBuy_time (timestamp <= offset)
            // For "max" (newer), use minBuy_time (timestamp >= offset)
            const timeKey = bound === "min" ? `max${baseField}` : `min${baseField}`;
            onFilterChange(timeKey, offset);
        } else {
            onFilterChange(key, parseHumanNumber(value));
        }
    };

    return (
        <div style={filterContainerStyle}>
            <div style={filterHeaderStyle}>
                <h3 style={filterTitleStyle}>Set Filters</h3>
                <button onClick={onClose} style={closeButtonStyle} className="column-picker-close">×</button>
            </div>
            <div style={filterContentStyle}>
                {Object.entries(filterGroups).map(([cat, cols]) => (
                    <div key={cat} style={categoryGroupStyle}>
                        <div style={categoryHeaderStyle}>{cat}</div>
                        <div style={filterFieldsStyle}>
                            {cols.flatMap((col) => {
                                if (col.id === "buy_price") {
                                    return [
                                        { id: "buy_price", label: "Buy Price" },
                                        { id: "buy_time", label: "Buy Age (min)" },
                                    ];
                                }
                                if (col.id === "sell_price") {
                                    return [
                                        { id: "sell_price", label: "Sell Price" },
                                        { id: "sell_time", label: "Sell Age (min)" },
                                    ];
                                }
                                return [col];
                            }).map((field) => (
                                <div key={field.id} style={fieldContainerStyle}>
                                    <label style={fieldLabelStyle}>{field.label}</label>
                                    <div style={inputGroupStyle}>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="Min"
                                            style={inputStyle}
                                            value={getFilterValue(field.id, "min")}
                                            onChange={(e) =>
                                                handleInputChange(field.id, "min", e.target.value)
                                            }
                                            onFocus={(e) => e.target.style.borderColor = "#1e1e1e"}
                                            onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
                                        />
                                        <span style={inputDividerStyle}>→</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="Max"
                                            style={inputStyle}
                                            value={getFilterValue(field.id, "max")}
                                            onChange={(e) =>
                                                handleInputChange(field.id, "max", e.target.value)
                                            }
                                            onFocus={(e) => e.target.style.borderColor = "#1e1e1e"}
                                            onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div style={filterFooterStyle}>
                <button 
                    onClick={onClearFilters} 
                    style={clearButtonStyle} 
                    className="filter-builder-clear"
                >
                    Clear Filters
                </button>
                <button onClick={onClose} style={doneButtonStyle} className="column-picker-done">
                    Done
                </button>
            </div>
        </div>
    );
}
