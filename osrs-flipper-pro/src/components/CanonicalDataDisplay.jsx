import React from "react";
import {
    formatCompact,
    formatPriceFull,
    formatColoredNumber,
    formatRoi,
    timeAgo,
} from "../utils/formatting";

export default function CanonicalDataDisplay({ data }) {
    if (!data) return null;

    const formatValue = (key, value) => {
        if (value == null || value === null) return "–";

        // Handle different data types
        if (key.includes("trend_") || key === "roi_percent" || key === "spread_percent") {
            return formatRoi(value);
        }

        if (key.includes("margin") || key.includes("max_profit") || key.includes("max_investment")) {
            return formatColoredNumber(value);
        }

        if (key.includes("price") || key === "high" || key === "low") {
            return formatPriceFull(value);
        }

        if (key.includes("turnover")) {
            return formatCompact(value);
        }

        if (key.includes("buy_sell_rate")) {
            const num = parseFloat(value);
            if (isNaN(num)) return "–";
            return (
                <span style={{ color: num < 1 ? "red" : "green" }}>
                    {num.toFixed(2)}
                </span>
            );
        }

        if (key.includes("timestamp")) {
            return timeAgo(value);
        }

        if (typeof value === "boolean") {
            return value ? "Yes" : "No";
        }

        return formatCompact(value);
    };

    const sections = [
        {
            title: "Core",
            fields: [
                { key: "high", label: "High Price" },
                { key: "low", label: "Low Price" },
                { key: "high_timestamp", label: "High Timestamp" },
                { key: "low_timestamp", label: "Low Timestamp" },
                { key: "margin", label: "Margin" },
                { key: "roi_percent", label: "ROI%" },
                { key: "spread_percent", label: "Spread%" },
                { key: "max_profit", label: "Max Profit" },
                { key: "max_investment", label: "Max Investment" },
            ]
        },
        {
            title: "Item Info",
            fields: [
                { key: "name", label: "Name" },
                { key: "members", label: "Members Only" },
                { key: "limit", label: "Trade Limit" },
            ]
        },
        {
            title: "Volume",
            fields: [
                { key: "volume_5m", label: "Volume (5m)" },
                { key: "volume_1h", label: "Volume (1h)" },
                { key: "volume_6h", label: "Volume (6h)" },
                { key: "volume_24h", label: "Volume (24h)" },
                { key: "volume_7d", label: "Volume (7d)" },
            ]
        },
        {
            title: "Turnover",
            fields: [
                { key: "turnover_5m", label: "Turnover (5m)" },
                { key: "turnover_1h", label: "Turnover (1h)" },
                { key: "turnover_6h", label: "Turnover (6h)" },
                { key: "turnover_24h", label: "Turnover (24h)" },
                { key: "turnover_7d", label: "Turnover (7d)" },
                { key: "turnover_1m", label: "Turnover (1m)" },
            ]
        },
        {
            title: "Trend",
            fields: [
                { key: "trend_5m", label: "Trend (5m)" },
                { key: "trend_1h", label: "Trend (1h)" },
                { key: "trend_6h", label: "Trend (6h)" },
                { key: "trend_24h", label: "Trend (24h)" },
                { key: "trend_7d", label: "Trend (7d)" },
                { key: "trend_1m", label: "Trend (1m)" },
            ]
        },
        {
            title: "Buy/Sell Rate",
            fields: [
                { key: "buy_sell_rate_5m", label: "Buy/Sell Rate (5m)" },
                { key: "buy_sell_rate_1h", label: "Buy/Sell Rate (1h)" },
            ]
        },
        {
            title: "Aggregated Prices",
            fields: [
                { key: "price_5m_high", label: "Price 5m High" },
                { key: "price_5m_low", label: "Price 5m Low" },
                { key: "price_1h_high", label: "Price 1h High" },
                { key: "price_1h_low", label: "Price 1h Low" },
            ]
        },
    ];

    return (
        <div style={containerStyle}>
            {sections.map((section) => (
                <div key={section.title} style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>{section.title}</h3>
                    <div style={gridStyle}>
                        {section.fields.map((field) => (
                            <div key={field.key} style={fieldStyle}>
                                <div style={labelStyle}>{field.label}</div>
                                <div style={valueStyle}>{formatValue(field.key, data[field.key])}</div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

const containerStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
};

const sectionStyle = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "20px",
    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
};

const sectionTitleStyle = {
    margin: "0 0 16px 0",
    fontSize: "18px",
    fontWeight: 600,
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
};

const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "16px",
};

const fieldStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
};

const labelStyle = {
    fontSize: "12px",
    fontWeight: 500,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
};

const valueStyle = {
    fontSize: "16px",
    fontWeight: 500,
    color: "#111827",
};





