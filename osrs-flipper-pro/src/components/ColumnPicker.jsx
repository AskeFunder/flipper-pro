import React from "react";
import Tooltip from "./Tooltip";
import "../styles/browse.css";

const pickerContainerStyle = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    marginBottom: "24px",
    width: "100%",
};

const pickerHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
};

const pickerTitleStyle = {
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

const pickerContentStyle = {
    padding: "12px 16px",
    maxHeight: "500px",
    overflowY: "auto",
    overflowX: "hidden",
    minHeight: "200px",
};

const categoryGroupStyle = {
    marginBottom: "20px",
    width: "100%",
};

const categoryHeaderStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "8px",
    cursor: "help",
    padding: "4px 8px",
    borderRadius: "4px",
    transition: "background-color 0.2s",
};

const categoryNameStyle = {
    fontWeight: 600,
    fontSize: "14px",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
};

const infoIconStyle = {
    fontSize: "14px",
    opacity: 0.7,
};

const checkboxGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "8px",
    marginTop: "4px",
    width: "100%",
    boxSizing: "border-box",
};

const checkboxLabelStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    padding: "6px 10px",
    borderRadius: "6px",
    transition: "background-color 0.2s",
    userSelect: "none",
    whiteSpace: "nowrap",
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
};

const checkboxInputStyle = {
    width: "18px",
    height: "18px",
    cursor: "pointer",
    accentColor: "#1e1e1e",
};

const checkboxTextStyle = {
    fontSize: "14px",
    color: "#374151",
};

const pickerFooterStyle = {
    padding: "12px 16px",
    borderTop: "1px solid #e5e7eb",
    background: "#f9fafb",
    display: "flex",
    justifyContent: "flex-end",
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

const categoryDescriptions = {
    "Core": "Essential price and profit metrics: buy/sell prices, margin, ROI, and spread percentages.",
    "Limit": "Trading limit information: maximum items you can buy/sell and related calculations.",
    "Volume": "Number of items traded over different time periods (5m, 1h, 6h, 24h, 7d). Higher volume = more liquidity.",
    "Turnover": "Total value of items traded (price × volume) over different time periods. Shows market activity in GP.",
    "Trend": "Price change percentage over time. Positive = price going up, negative = price going down.",
    "Buy/Sell Ratio": "Ratio of sell volume to buy volume. >1 = more sellers, <1 = more buyers. Helps gauge demand."
};

export default function ColumnPicker({ columnSettings, onToggleColumn, onClose }) {
    const groups = columnSettings.reduce((acc, col) => {
        (acc[col.category] = acc[col.category] || []).push(col);
        return acc;
    }, {});

    return (
        <div style={pickerContainerStyle}>
            <div style={pickerHeaderStyle}>
                <h3 style={pickerTitleStyle}>Select Columns</h3>
                <button onClick={onClose} style={closeButtonStyle} className="column-picker-close">×</button>
            </div>
            <div style={pickerContentStyle}>
            {Object.entries(groups).map(([cat, cols]) => (
                    <div key={cat} style={categoryGroupStyle}>
                        <Tooltip text={categoryDescriptions[cat] || "Column category"}>
                            <div style={categoryHeaderStyle}>
                                <span style={categoryNameStyle}>{cat}</span>
                                <span style={infoIconStyle}>ℹ️</span>
                            </div>
                        </Tooltip>
                        <div style={checkboxGridStyle}>
                        {cols.map((c) => (
                                <label key={c.id} style={checkboxLabelStyle} className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={c.visible}
                                    onChange={() => onToggleColumn(c.id)}
                                        style={checkboxInputStyle}
                                    />
                                    <span style={checkboxTextStyle}>{c.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            ))}
                <div style={{ height: "8px" }}></div>
            </div>
            <div style={pickerFooterStyle}>
                <button onClick={onClose} style={doneButtonStyle} className="column-picker-done">
                Done
            </button>
            </div>
        </div>
    );
}
