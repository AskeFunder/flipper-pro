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
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: "12px",
};

const fieldContainerStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
};

const fieldLabelStyle = {
    fontSize: "13px",
    fontWeight: 500,
    color: "#374151",
    marginBottom: "2px",
};

const inputGroupStyle = {
    display: "flex",
    gap: "6px",
    alignItems: "center",
};

const inputStyle = {
    flex: 1,
    padding: "8px 10px",
    fontSize: "13px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    backgroundColor: "#ffffff",
    transition: "all 0.2s",
    minWidth: "70px",
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

export default function FilterBuilder({ visibleColumns, filters, onFilterChange, onClose }) {
    const filterGroups = visibleColumns.reduce((acc, col) => {
        (acc[col.category] = acc[col.category] || []).push(col);
        return acc;
    }, {});

    const now = Math.floor(Date.now() / 1000);

    const handleInputChange = (field, bound, value) => {
        const Cap = field.charAt(0).toUpperCase() + field.slice(1);

        const key = bound === "min" ? `min${Cap}` : `max${Cap}`;

        if (value.trim() === "") {
            onFilterChange(key, null); // ✅ remove filter
        } else if (field === "buy_time" || field === "sell_time") {
            const offset = now - parseHumanNumber(value) * 60;
            onFilterChange(key === `minBuy_time` ? `maxBuy_time` : `minBuy_time`, offset);
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
                <button onClick={onClose} style={doneButtonStyle} className="column-picker-done">
                    Done
                </button>
            </div>
        </div>
    );
}
