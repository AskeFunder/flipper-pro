import React, { useState } from "react";
import Tooltip from "./Tooltip";
import { allColumns } from "../constants/column";
import "../styles/browse.css";

const pickerContainerStyle = {
    background: "#151a22", /* Table surface */
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "8px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
    marginBottom: "24px",
    width: "100%",
};

const pickerHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    background: "#181e27", /* Row background */
};

const pickerTitleStyle = {
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
    color: "#9aa4b2", /* Secondary text */
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
};

const checkboxTextStyle = {
    fontSize: "14px",
    color: "#e6e9ef", /* Primary text */
};

const pickerFooterStyle = {
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

const defaultButtonStyle = {
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
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box',
};

const categoryDescriptions = {
    "Core": "Essential price and profit metrics: buy/sell prices, margin, ROI, and spread percentages.",
    "Limit": "Trading limit information: maximum items you can buy/sell and related calculations.",
    "Volume": "Number of items traded over different time periods (5m, 1h, 6h, 24h, 7d). Higher volume = more liquidity.",
    "Turnover": "Total value of items traded (price × volume) over different time periods. Shows market activity in GP.",
    "Trend": "Price change percentage over time. Positive = price going up, negative = price going down.",
    "Buy/Sell Ratio": "Ratio of sell volume to buy volume. >1 = more sellers, <1 = more buyers. Helps gauge demand."
};

const SAVED_PRESETS_KEY = "osrs-flipper-saved-column-presets";

export default function ColumnPicker({ columnSettings, onToggleColumn, onClose, onResetToDefaults }) {
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

    const groups = columnSettings.reduce((acc, col) => {
        (acc[col.category] = acc[col.category] || []).push(col);
        return acc;
    }, {});

    const handleSave = () => {
        if (!presetName.trim()) {
            alert("Please enter a name for your preset");
            return;
        }
        const newPresets = [...savedPresets, { name: presetName.trim(), settings: columnSettings, timestamp: Date.now() }];
        setSavedPresets(newPresets);
        localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(newPresets));
        setPresetName("");
        setShowSaveDialog(false);
    };

    const handleLoad = (preset) => {
        const merged = allColumns.map(col => {
            const savedCol = preset.settings.find(c => c.id === col.id);
            return savedCol ? { ...col, visible: savedCol.visible } : col;
        });
        const loadEvent = new CustomEvent('importColumnSettings', { detail: merged });
        window.dispatchEvent(loadEvent);
        setShowLoadDialog(false);
    };

    const handleDelete = (index, e) => {
        e.stopPropagation();
        const newPresets = savedPresets.filter((_, i) => i !== index);
        setSavedPresets(newPresets);
        localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(newPresets));
    };

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
            {showSaveDialog && (
                <div style={dialogOverlayStyle} onClick={() => setShowSaveDialog(false)}>
                    <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Save Column Preset</h3>
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
                            <button onClick={() => setShowSaveDialog(false)} style={defaultButtonStyle}>Cancel</button>
                            <button onClick={handleSave} style={doneButtonStyle}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {showLoadDialog && (
                <div style={dialogOverlayStyle} onClick={() => setShowLoadDialog(false)}>
                    <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Load Column Preset</h3>
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

            <div style={pickerFooterStyle}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                        onClick={() => setShowSaveDialog(true)}
                        style={defaultButtonStyle}
                        title="Save current column settings"
                    >
                        Save
                    </button>
                    <button 
                        onClick={() => setShowLoadDialog(true)}
                        style={defaultButtonStyle}
                        title="Load saved column settings"
                    >
                        Load
                    </button>
                    <button 
                        onClick={onResetToDefaults} 
                        style={defaultButtonStyle} 
                        className="column-picker-default"
                    >
                        Default Columns
                    </button>
                </div>
                <button onClick={onClose} style={doneButtonStyle} className="column-picker-done">
                    Done
                </button>
            </div>
        </div>
    );
}
