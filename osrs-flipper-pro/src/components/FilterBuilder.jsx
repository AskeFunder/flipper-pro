import React, { useState } from "react";
import { parseHumanNumber } from "../utils/formatting";
import "../styles/browse.css";

const SAVED_PRESETS_KEY = "osrs-flipper-saved-filter-presets";

const filterContainerStyle = {
    background: "#151a22", /* Table surface */
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "8px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
    marginBottom: "24px",
    overflow: "hidden",
};

const filterHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    background: "#181e27", /* Row background */
};

const filterTitleStyle = {
    margin: 0,
    fontSize: "18px",
    fontWeight: 600,
    color: "#e6e9ef", /* Primary text */
};

const closeButtonStyle = {
    background: "none",
    border: "none",
    fontSize: "24px",
    color: "#9aa4b2", /* Secondary text */
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
    color: "#9aa4b2", /* Secondary text */
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
    color: "#e6e9ef", /* Primary text */
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
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    backgroundColor: "#151a22", /* Table surface */
    color: "#e6e9ef",
    transition: "all 0.2s",
    minWidth: "0", // Allow flex items to shrink below their content size
    boxSizing: "border-box",
};

const inputDividerStyle = {
    color: "#9aa4b2",
    fontSize: "12px",
    fontWeight: 500,
};

const filterFooterStyle = {
    padding: "12px 16px",
    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
    background: "#181e27", /* Row background */
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
    background: "#5865F2", /* Discord purple */
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s",
};

const clearButtonStyle = {
    padding: "10px 24px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#e6e9ef",
    background: "#202737", /* Button base */
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s",
};

const dialogOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
};

const dialogStyle = {
    background: '#151a22', /* Table surface */
    borderRadius: '8px',
    padding: '24px',
    minWidth: '400px',
    maxWidth: '500px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
};

const dialogInputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: '#151a22',
    color: '#e6e9ef',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box',
};

export default function FilterBuilder({ visibleColumns, filters, onFilterChange, onClose, onClearFilters, isSearchFromSearchBar = false, onSearchFromSearchBarChange }) {
    const [savedPresets, setSavedPresets] = useState(() => {
        try {
            const saved = localStorage.getItem(SAVED_PRESETS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [presetName, setPresetName] = useState("");
    const [showLoadDialog, setShowLoadDialog] = useState(false);

    const filterGroups = visibleColumns.reduce((acc, col) => {
        (acc[col.category] = acc[col.category] || []).push(col);
        return acc;
    }, {});

    const now = Math.floor(Date.now() / 1000);

    const handleSave = () => {
        if (!presetName.trim()) {
            alert("Please enter a name for your preset");
            return;
        }
        const newPresets = [...savedPresets, { name: presetName.trim(), filters: filters, timestamp: Date.now() }];
        setSavedPresets(newPresets);
        localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(newPresets));
        setPresetName("");
        setShowSaveDialog(false);
    };

    const handleLoad = (preset) => {
        const loadEvent = new CustomEvent('importFilters', { detail: preset.filters });
        window.dispatchEvent(loadEvent);
        setShowLoadDialog(false);
    };

    const handleDelete = (index, e) => {
        e.stopPropagation();
        const newPresets = savedPresets.filter((_, i) => i !== index);
        setSavedPresets(newPresets);
        localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(newPresets));
    };

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
                                            onBlur={(e) => e.target.style.borderColor = "rgba(255, 255, 255, 0.1)"}
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
                                            onBlur={(e) => e.target.style.borderColor = "rgba(255, 255, 255, 0.1)"}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            {showSaveDialog && (
                <div style={dialogOverlayStyle} onClick={() => setShowSaveDialog(false)}>
                    <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Save Filter Preset</h3>
                        <input
                            type="text"
                            placeholder="Enter preset name..."
                            value={presetName}
                            onChange={(e) => setPresetName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSave()}
                            style={dialogInputStyle}
                            autoFocus
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button onClick={() => setShowSaveDialog(false)} style={clearButtonStyle}>Cancel</button>
                            <button onClick={handleSave} style={doneButtonStyle}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {showLoadDialog && (
                <div style={dialogOverlayStyle} onClick={() => setShowLoadDialog(false)}>
                    <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Load Filter Preset</h3>
                        {savedPresets.length === 0 ? (
                            <p style={{ color: '#6b7280', margin: '16px 0' }}>No saved presets</p>
                        ) : (
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                {savedPresets.map((preset, index) => (
                                    <div
                                        key={index}
                                        onClick={() => handleLoad(preset)}
                                        style={{
                                            padding: '12px',
                                            marginBottom: '8px',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            transition: 'background-color 0.2s',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#202737'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <span>{preset.name}</span>
                                        <button
                                            onClick={(e) => handleDelete(index, e)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#ef4444',
                                                cursor: 'pointer',
                                                fontSize: '18px',
                                                padding: '0 8px',
                                            }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button onClick={() => setShowLoadDialog(false)} style={doneButtonStyle}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            <div style={filterFooterStyle}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                        onClick={() => setShowSaveDialog(true)}
                        style={clearButtonStyle}
                        title="Save current filters"
                    >
                        Save
                    </button>
                    <button 
                        onClick={() => setShowLoadDialog(true)}
                        style={clearButtonStyle}
                        title="Load saved filters"
                    >
                        Load
                    </button>
                    <button 
                        onClick={onClearFilters} 
                        style={clearButtonStyle} 
                        className="filter-builder-clear"
                    >
                        Clear Filters
                    </button>
                </div>
                <button onClick={onClose} style={doneButtonStyle} className="column-picker-done">
                    Done
                </button>
            </div>
        </div>
    );
}
