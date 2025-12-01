import React from "react";
import {
    formatPriceFull,
    formatColoredNumber,
    formatRoi,
} from "../utils/formatting";

const baseIconURL = "https://oldschool.runescape.wiki/images/thumb";

const cardStyle = {
    backgroundColor: "#181e27",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "12px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    cursor: "pointer",
    transition: "all 0.2s",
    minHeight: "80px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    boxSizing: "border-box",
};

const cardHoverStyle = {
    backgroundColor: "#202737",
    border: "1px solid rgba(255, 255, 255, 0.1)",
};

const iconContainerStyle = {
    flexShrink: 0,
    width: "48px",
    height: "48px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

const iconStyle = {
    width: "40px",
    height: "40px",
    borderRadius: "4px",
    objectFit: "contain",
};

const contentStyle = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: 0,
};

const nameStyle = {
    fontSize: "16px",
    fontWeight: 600,
    color: "#e6e9ef",
    fontFamily: "'Inter', sans-serif",
    margin: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
};

const metricsRowStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "8px",
    fontSize: "12px",
};

const metricItemStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
};

const metricLabelStyle = {
    fontSize: "10px",
    color: "#9aa4b2",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    fontFamily: "'Inter', sans-serif",
};

const metricValueStyle = {
    fontSize: "14px",
    fontWeight: 600,
    color: "#e6e9ef",
    fontFamily: "'Inter', sans-serif",
};

export default function MobileItemCard({ item, onClick }) {
    const icon = item.icon || `${item.name}.png`;
    const safe = encodeURIComponent(icon.replace(/ /g, "_"));
    
    return (
        <div
            style={cardStyle}
            onClick={onClick}
            onMouseEnter={(e) => {
                Object.assign(e.currentTarget.style, cardHoverStyle);
            }}
            onMouseLeave={(e) => {
                Object.assign(e.currentTarget.style, cardStyle);
            }}
        >
            <div style={iconContainerStyle}>
                <img
                    src={`${baseIconURL}/${safe}/32px-${safe}`}
                    alt={item.name}
                    style={iconStyle}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                />
            </div>
            <div style={contentStyle}>
                <h3 style={nameStyle}>{item.name}</h3>
                <div style={metricsRowStyle}>
                    <div style={metricItemStyle}>
                        <div style={metricLabelStyle}>Buy</div>
                        <div style={metricValueStyle}>{formatPriceFull(item.buy_price)}</div>
                    </div>
                    <div style={metricItemStyle}>
                        <div style={metricLabelStyle}>Sell</div>
                        <div style={metricValueStyle}>{formatPriceFull(item.sell_price)}</div>
                    </div>
                    <div style={metricItemStyle}>
                        <div style={metricLabelStyle}>Margin</div>
                        <div style={{ ...metricValueStyle, color: item.margin >= 0 ? "#2bd97f" : "#ff5c5c" }}>
                            {formatColoredNumber(item.margin)}
                        </div>
                    </div>
                    <div style={metricItemStyle}>
                        <div style={metricLabelStyle}>ROI</div>
                        <div style={{ ...metricValueStyle, color: item.roi >= 0 ? "#2bd97f" : "#ff5c5c" }}>
                            {formatRoi(item.roi)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

