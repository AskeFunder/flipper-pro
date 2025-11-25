import React, { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import {
    Chart as ChartJS,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    TimeScale,
    Legend,
    Tooltip,
} from "chart.js";
import 'chartjs-adapter-date-fns';
import {
    formatCompact,
    formatPriceFull,
    formatColoredNumber,
    formatRoi,
    timeAgo,
} from "../utils/formatting";
import CanonicalDataDisplay from "../components/CanonicalDataDisplay";

ChartJS.register(
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    TimeScale,
    Legend,
    Tooltip
);

const API_BASE = "http://localhost:3001";

const timeOptions = [
    { label: '4H', ms: 4 * 3600e3, granularity: '4h' },
    { label: '12H', ms: 12 * 3600e3, granularity: '5m' },
    { label: '1D', ms: 24 * 3600e3, granularity: '5m' },
    { label: '1W', ms: 7 * 24 * 3600e3, granularity: '1h' },
    { label: '1M', ms: 30 * 24 * 3600e3, granularity: '6h' },
    { label: '3M', ms: 90 * 24 * 3600e3, granularity: '24h' },
    { label: '1Y', ms: 365 * 24 * 3600e3, granularity: '24h' },
    { label: 'All', ms: 0, granularity: '24h' },
];

const baseIconURL = "https://oldschool.runescape.wiki/images/thumb";

export default function ItemDetailPage({ itemId, onBack }) {
    const [priceData, setPriceData] = useState([]);
    const [canonicalData, setCanonicalData] = useState(null);
    const [recentTrades, setRecentTrades] = useState([]);
    const [timeRange, setTimeRange] = useState('12H');
    const [loading, setLoading] = useState(true);

    console.log("ItemDetailPage rendered with itemId:", itemId);

    const selected = timeOptions.find(o => o.label === timeRange);
    const granularity = selected ? selected.granularity : '5m';

    // Fetch canonical data
    useEffect(() => {
        if (!itemId) return;

        const fetchCanonical = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/items/canonical/${itemId}`);
                if (res.ok) {
                    const data = await res.json();
                    setCanonicalData(data);
                } else {
                    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
                    console.error("Error fetching canonical data:", res.status, errorData);
                }
            } catch (err) {
                console.error("Error fetching canonical data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchCanonical();
    }, [itemId]);

    // Fetch chart data
    useEffect(() => {
        if (!itemId) return;

        const fetchChart = () => {
            fetch(`${API_BASE}/api/prices/chart/${granularity}/${itemId}`)
                .then(res => res.json())
                .then(setPriceData)
                .catch(console.error);
        };

        fetchChart();
        const int = setInterval(fetchChart, 15000);
        return () => clearInterval(int);
    }, [itemId, granularity, timeRange]);

    // Fetch recent trades
    useEffect(() => {
        if (!itemId) return;

        const fetchRecent = () => {
            fetch(`${API_BASE}/api/prices/recent/${itemId}`)
                .then(res => res.json())
                .then(setRecentTrades)
                .catch(console.error);
        };

        fetchRecent();
        const int = setInterval(fetchRecent, 15000);
        return () => clearInterval(int);
    }, [itemId]);

    const now = Date.now();
    const minTime = selected ? now - selected.ms : 0;
    const filtered = priceData.filter(p => minTime === 0 || p.ts * 1000 >= minTime);

    // Calculate min/max for x-axis - NO PADDING, exact bounds
    const xMin = filtered.length > 0 ? new Date(Math.min(...filtered.map(p => p.ts * 1000))) : null;
    const xMax = filtered.length > 0 ? new Date(Math.max(...filtered.map(p => p.ts * 1000))) : null;

    // Calculate min/max for y-axis with padding
    const allPrices = filtered.flatMap(p => [p.high, p.low]).filter(v => v != null && v > 0);
    const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
    const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;
    const avgPrice = allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0;
    
    // Detect spikes/crashes: if max is more than 3x the average, it's likely a spike
    const hasSpike = maxPrice > avgPrice * 3 && avgPrice > 0;
    
    const priceRange = maxPrice - minPrice;
    const paddingAmount = priceRange > 0 ? priceRange * 0.2 : maxPrice * 0.1; // 20% padding, or 10% of max if range is 0
    
    const yMin = Math.max(0, minPrice - paddingAmount);
    const yMax = hasSpike ? maxPrice : maxPrice + paddingAmount; // Only bottom padding if spike

    const chartData = {
        labels: filtered.map(p => new Date(p.ts * 1000)),
        datasets: [
            {
                label: "Sell",
                data: filtered.map(p => p.high),
                borderColor: "red",
                tension: 0.1,
                pointRadius: 0,
                spanGaps: true,
            },
            {
                label: "Buy",
                data: filtered.map(p => p.low),
                borderColor: "green",
                tension: 0.1,
                pointRadius: 0,
                spanGaps: true,
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            tooltip: {
                callbacks: {
                    title: items => new Date(items[0].parsed.x).toLocaleString()
                }
            }
        },
        scales: {
            x: { 
                type: 'time', 
                title: { display: true, text: 'Time' },
                offset: false,
                bounds: 'ticks',
                min: xMin,
                max: xMax,
                grace: 0,
                ticks: {
                    padding: 0
                }
            },
            y: { 
                title: { display: true, text: 'Price (gp)' },
                min: yMin,
                max: yMax
            }
        }
    };

    if (loading) {
        return (
            <div style={{ padding: "2rem", fontFamily: "'Inter',sans-serif" }}>
                <p>Loading item data...</p>
            </div>
        );
    }

    if (!canonicalData) {
        return (
            <div style={{ padding: "2rem", fontFamily: "'Inter',sans-serif" }}>
                <button onClick={onBack} style={backButtonStyle}>← Back to Browse</button>
                <p>Item not found</p>
            </div>
        );
    }

    const icon = canonicalData.icon || `${canonicalData.name}.png`;
    const safe = encodeURIComponent(icon.replace(/ /g, "_"));

    return (
        <div style={{ padding: "2rem", fontFamily: "'Inter',sans-serif" }}>
            <button onClick={onBack} style={backButtonStyle}>← Back to Browse</button>

            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
                <img
                    src={`${baseIconURL}/${safe}/64px-${safe}`}
                    alt={canonicalData.name}
                    width={64}
                    height={64}
                    style={{ borderRadius: 8, objectFit: "contain" }}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                />
                <div>
                    <h1 style={{ margin: 0, fontSize: "32px" }}>{canonicalData.name}</h1>
                    {canonicalData.high && canonicalData.low && (
                        <p style={{ margin: "8px 0 0 0", fontSize: "18px", color: "#374151" }}>
                            Buy: {formatPriceFull(canonicalData.low)} gp | Sell: {formatPriceFull(canonicalData.high)} gp
                        </p>
                    )}
                </div>
            </div>

            {/* Granularity buttons */}
            <div style={{ marginBottom: 16 }}>
                {timeOptions.map(({ label }) => (
                    <button
                        key={label}
                        onClick={() => setTimeRange(label)}
                        style={{
                            marginRight: 6,
                            padding: '6px 10px',
                            background: label === timeRange ? '#1e1e1e' : '#f0f0f0',
                            color: label === timeRange ? '#fff' : '#000',
                            borderRadius: 4,
                            border: label === timeRange ? '2px solid #444' : '1px solid #ccc',
                            cursor: 'pointer'
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Chart */}
            {filtered.length === 0 ? (
                <p>No price data available in selected range.</p>
            ) : (
                <div style={{ height: '60vh', marginBottom: "32px" }}>
                    <Line data={chartData} options={chartOptions} />
                </div>
            )}

            {/* Recent Trades */}
            <h2 style={{ marginTop: "32px", marginBottom: "16px" }}>Recent Trades</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: "32px" }}>
                <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                        <th align="left" style={{ padding: "12px", textAlign: "left" }}>Time</th>
                        <th align="left" style={{ padding: "12px", textAlign: "left" }}>Type</th>
                        <th align="left" style={{ padding: "12px", textAlign: "left" }}>Price</th>
                    </tr>
                </thead>
                <tbody>
                    {recentTrades.map((t, i) => {
                        const isBuy = t.type === 'buy';
                        const label = isBuy ? 'BUY' : 'SELL';
                        const rowColor = isBuy ? '#eaffea' : '#ffeaea';
                        const textColor = isBuy ? '#007a00' : '#b20000';
                        return (
                            <tr key={i} style={{ backgroundColor: rowColor, color: textColor }}>
                                <td style={{ padding: "10px 12px" }}>{new Date(t.ts * 1000).toLocaleTimeString()}</td>
                                <td style={{ padding: "10px 12px" }}>{label}</td>
                                <td style={{ padding: "10px 12px" }}>{t.price.toLocaleString()} gp</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* Canonical Data Display */}
            <h2 style={{ marginTop: "32px", marginBottom: "16px" }}>Item Data</h2>
            <CanonicalDataDisplay data={canonicalData} />
        </div>
    );
}

const backButtonStyle = {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#374151",
    background: "#ffffff",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    cursor: "pointer",
    marginBottom: "24px",
    transition: "all 0.2s",
};

