import React from "react";
import { TABLE_MODES, MODE_CONFIG } from "../constants/tableModes";
import "../styles/browse.css";

const modeSelectorStyle = {
    display: "flex",
    gap: "5px",
    alignItems: "center",
};

const modeButtonStyle = {
    padding: "6px",
    width: "32px",
    height: "32px",
    borderRadius: "6px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    backgroundColor: "#202737",
    color: "#9aa4b2",
    cursor: "pointer",
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
};

const modeButtonActiveStyle = {
    ...modeButtonStyle,
    backgroundColor: "#5865F2",
    color: "#ffffff",
    borderColor: "#5865F2",
};

const iconStyle = {
    width: "16px",
    height: "16px",
    display: "block",
};

// Icon components
const HorizontalIcon = ({ isActive }) => (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>
);

const SidePanelIcon = ({ isActive }) => (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="14" height="18" rx="2"></rect>
        <line x1="17" y1="3" x2="21" y2="3"></line>
        <line x1="17" y1="21" x2="21" y2="21"></line>
        <line x1="17" y1="9" x2="21" y2="9"></line>
        <line x1="17" y1="15" x2="21" y2="15"></line>
    </svg>
);

const ExpandableIcon = ({ isActive }) => (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
        <line x1="3" y1="3" x2="21" y2="3"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="21" x2="21" y2="21"></line>
    </svg>
);

export default function TableModeSelector({ mode, onModeChange }) {
    return (
        <div style={modeSelectorStyle}>
            <button
                onClick={() => onModeChange(TABLE_MODES.HORIZONTAL)}
                style={mode === TABLE_MODES.HORIZONTAL ? modeButtonActiveStyle : modeButtonStyle}
                title={MODE_CONFIG[TABLE_MODES.HORIZONTAL].description}
            >
                <HorizontalIcon isActive={mode === TABLE_MODES.HORIZONTAL} />
            </button>
            <button
                onClick={() => onModeChange(TABLE_MODES.SIDE)}
                style={mode === TABLE_MODES.SIDE ? modeButtonActiveStyle : modeButtonStyle}
                title={MODE_CONFIG[TABLE_MODES.SIDE].description}
            >
                <SidePanelIcon isActive={mode === TABLE_MODES.SIDE} />
            </button>
            <button
                onClick={() => onModeChange(TABLE_MODES.ROW)}
                style={mode === TABLE_MODES.ROW ? modeButtonActiveStyle : modeButtonStyle}
                title={MODE_CONFIG[TABLE_MODES.ROW].description}
            >
                <ExpandableIcon isActive={mode === TABLE_MODES.ROW} />
            </button>
        </div>
    );
}

